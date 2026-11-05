// Salida de audio: Windows pide sonido cientos de veces por segundo y aquí se saca de la cola.
// Esa función nunca lee del disco ni espera a nadie; si se demora, se oye un corte.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig};
use rtrb::{Consumer, RingBuffer};
use serde::Serialize;

use super::track;

// Segundos de audio que la cola guarda por adelantado.
const SEGUNDOS_EN_COLA: usize = 5;

// Datos que comparten la interfaz y la salida de audio. Son atómicos: se leen y escriben
// sin bloquear, porque la salida de audio no puede quedarse esperando.
#[derive(Default)]
struct Compartido {
    reproduciendo: AtomicBool,
    terminado: AtomicBool,
    cortes: AtomicU64,
}

// Lo que tiene abierto el motor mientras hay una pista cargada.
struct Sesion {
    stream: Stream,
    compartido: Arc<Compartido>,
    parar: Arc<AtomicBool>,
    lector: JoinHandle<()>,
}

impl Sesion {
    fn cerrar(self) {
        self.parar.store(true, Ordering::Relaxed);
        drop(self.stream);
        let _ = self.lector.join();
    }
}

#[derive(Serialize)]
pub struct Estado {
    pub reproduciendo: bool,
    pub terminado: bool,
    pub cortes: u64,
}

#[derive(Default)]
pub struct Motor {
    sesion: Mutex<Option<Sesion>>,
}

impl Motor {
    // Cierra la pista anterior, abre la nueva y deja la salida lista, en pausa.
    pub fn cargar(&self, ruta: &str) -> Result<(), String> {
        let lector = track::abrir(ruta)?;

        let mut sesion = self.sesion.lock().unwrap();
        if let Some(anterior) = sesion.take() {
            anterior.cerrar();
        }

        let dispositivo = cpal::default_host()
            .default_output_device()
            .ok_or("No hay salida de audio en esta PC")?;
        let soportada = dispositivo
            .default_output_config()
            .map_err(|e| format!("No se pudo leer la salida de audio: {e}"))?;
        let formato = soportada.sample_format();
        let config: StreamConfig = soportada.into();
        let rate = config.sample_rate;

        let (productor, consumidor) =
            RingBuffer::<f32>::new(rate as usize * 2 * SEGUNDOS_EN_COLA);
        let compartido = Arc::new(Compartido::default());
        let parar = Arc::new(AtomicBool::new(false));

        let stream = match formato {
            SampleFormat::F32 => {
                abrir_salida::<f32>(&dispositivo, config, consumidor, compartido.clone())
            }
            SampleFormat::I16 => {
                abrir_salida::<i16>(&dispositivo, config, consumidor, compartido.clone())
            }
            SampleFormat::I32 => {
                abrir_salida::<i32>(&dispositivo, config, consumidor, compartido.clone())
            }
            otro => Err(format!("Formato de salida no soportado: {otro}")),
        }?;
        stream
            .play()
            .map_err(|e| format!("No se pudo iniciar la salida de audio: {e}"))?;

        let parar_lector = parar.clone();
        let lector = thread::spawn(move || lector.leer(rate, productor, parar_lector));

        *sesion = Some(Sesion {
            stream,
            compartido,
            parar,
            lector,
        });
        Ok(())
    }

    pub fn play(&self) -> Result<(), String> {
        self.poner_reproduciendo(true)
    }

    pub fn pausa(&self) -> Result<(), String> {
        self.poner_reproduciendo(false)
    }

    fn poner_reproduciendo(&self, valor: bool) -> Result<(), String> {
        let sesion = self.sesion.lock().unwrap();
        let sesion = sesion.as_ref().ok_or("Primero carga una pista")?;
        sesion.compartido.reproduciendo.store(valor, Ordering::Relaxed);
        Ok(())
    }

    pub fn estado(&self) -> Estado {
        let sesion = self.sesion.lock().unwrap();
        match sesion.as_ref() {
            Some(sesion) => Estado {
                reproduciendo: sesion.compartido.reproduciendo.load(Ordering::Relaxed),
                terminado: sesion.compartido.terminado.load(Ordering::Relaxed),
                cortes: sesion.compartido.cortes.load(Ordering::Relaxed),
            },
            None => Estado {
                reproduciendo: false,
                terminado: false,
                cortes: 0,
            },
        }
    }
}

// `T` es el tipo de muestra que pide la tarjeta (casi siempre f32).
fn abrir_salida<T>(
    dispositivo: &Device,
    config: StreamConfig,
    mut cola: Consumer<f32>,
    compartido: Arc<Compartido>,
) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let canales = config.channels as usize;
    dispositivo
        .build_output_stream(
            config,
            move |datos: &mut [T], _: &cpal::OutputCallbackInfo| {
                escribir(datos, canales, &mut cola, &compartido);
            },
            |error| eprintln!("Error en la salida de audio: {error}"),
            None,
        )
        .map_err(|e| format!("No se pudo abrir la salida de audio: {e}"))
}

// Llena el bloque que pide Windows. En pausa escribe silencio y no toca la cola,
// así al volver a Play sigue exactamente donde iba.
fn escribir<T>(datos: &mut [T], canales: usize, cola: &mut Consumer<f32>, compartido: &Compartido)
where
    T: Sample + FromSample<f32>,
{
    let mut sonando = compartido.reproduciendo.load(Ordering::Relaxed);
    let mut hubo_corte = false;

    for cuadro in datos.chunks_mut(canales) {
        let mut izquierda = 0.0;
        let mut derecha = 0.0;

        if sonando {
            if cola.slots() >= 2 {
                izquierda = cola.pop().unwrap_or(0.0);
                derecha = cola.pop().unwrap_or(0.0);
            } else if cola.is_abandoned() {
                // El lector ya terminó y no queda audio: la pista acabó.
                sonando = false;
                compartido.reproduciendo.store(false, Ordering::Relaxed);
                compartido.terminado.store(true, Ordering::Relaxed);
            } else {
                hubo_corte = true;
            }
        }

        for (canal, muestra) in cuadro.iter_mut().enumerate() {
            let valor = match canal {
                0 => izquierda,
                1 => derecha,
                _ => 0.0,
            };
            *muestra = T::from_sample(valor);
        }
    }

    if hubo_corte {
        compartido.cortes.fetch_add(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::time::Duration;

    // Suena por la tarjeta real, así que no corre con `cargo test` normal:
    // cargo test -- --ignored reproduce_sin_cortes
    #[test]
    #[ignore]
    fn reproduce_sin_cortes() {
        let ruta = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../samples/sinteticas/pista1.flac"
        );
        let motor = Motor::default();
        motor.cargar(ruta).unwrap();
        thread::sleep(Duration::from_millis(500));

        motor.play().unwrap();
        thread::sleep(Duration::from_secs(5));
        assert!(motor.estado().reproduciendo);

        motor.pausa().unwrap();
        thread::sleep(Duration::from_millis(500));
        motor.play().unwrap();
        thread::sleep(Duration::from_secs(2));

        let estado = motor.estado();
        assert_eq!(estado.cortes, 0);
        assert!(!estado.terminado);
    }
}
