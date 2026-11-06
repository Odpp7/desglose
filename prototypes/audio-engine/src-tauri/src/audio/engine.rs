// Salida de audio: Windows pide sonido cientos de veces por segundo y aquí se mezclan las pistas.
// Esa función nunca lee del disco ni espera a nadie; si se demora, se oye un corte.
//
// Reloj único: en cada cuadro se saca exactamente una muestra de cada pista, o de ninguna.
// Por eso las pistas no pueden desfasarse, aunque una se demore en leer del disco.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig};
use rtrb::{Consumer, RingBuffer};
use serde::Serialize;

use super::track;

// Segundos de audio que cada cola guarda por adelantado.
const SEGUNDOS_EN_COLA: usize = 5;

// Tiempo que tarda un cambio de volumen en completarse. Evita los chasquidos.
const SEGUNDOS_RAMPA: f32 = 0.01;

// Controles de una pista. Son atómicos: se leen y escriben sin bloquear,
// porque la salida de audio no puede quedarse esperando a la interfaz.
struct ControlPista {
    volumen: AtomicU32, // f32 guardado como bits: no existe un f32 atómico
    mute: AtomicBool,
    solo: AtomicBool,
}

impl ControlPista {
    fn new() -> Self {
        Self {
            volumen: AtomicU32::new(1.0f32.to_bits()),
            mute: AtomicBool::new(false),
            solo: AtomicBool::new(false),
        }
    }

    fn volumen(&self) -> f32 {
        f32::from_bits(self.volumen.load(Ordering::Relaxed))
    }
}

// Datos que comparten la interfaz y la salida de audio.
struct Compartido {
    reproduciendo: AtomicBool,
    terminado: AtomicBool,
    cortes: AtomicU64,
    pistas: Vec<ControlPista>,
}

impl Compartido {
    fn new(total_pistas: usize) -> Self {
        Self {
            reproduciendo: AtomicBool::new(false),
            terminado: AtomicBool::new(false),
            cortes: AtomicU64::new(0),
            pistas: (0..total_pistas).map(|_| ControlPista::new()).collect(),
        }
    }
}

// Lo que tiene abierto el motor mientras hay pistas cargadas.
struct Sesion {
    stream: Stream,
    compartido: Arc<Compartido>,
    parar: Arc<AtomicBool>,
    lectores: Vec<JoinHandle<()>>,
}

impl Sesion {
    fn cerrar(self) {
        self.parar.store(true, Ordering::Relaxed);
        drop(self.stream);
        for lector in self.lectores {
            let _ = lector.join();
        }
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
    // Cierra lo anterior, abre las pistas nuevas y deja la salida lista, en pausa.
    pub fn cargar(&self, rutas: &[PathBuf]) -> Result<(), String> {
        let lectores = rutas
            .iter()
            .map(|ruta| track::abrir(ruta))
            .collect::<Result<Vec<_>, _>>()?;

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

        let compartido = Arc::new(Compartido::new(lectores.len()));
        let parar = Arc::new(AtomicBool::new(false));

        let mut colas = Vec::new();
        let mut hilos = Vec::new();
        for lector in lectores {
            let (productor, consumidor) =
                RingBuffer::<f32>::new(rate as usize * 2 * SEGUNDOS_EN_COLA);
            colas.push(consumidor);
            let parar_lector = parar.clone();
            hilos.push(thread::spawn(move || {
                lector.leer(rate, productor, parar_lector)
            }));
        }

        let mezclador = Mezclador::new(colas, compartido.clone(), rate);
        let stream = match formato {
            SampleFormat::F32 => abrir_salida::<f32>(&dispositivo, config, mezclador),
            SampleFormat::I16 => abrir_salida::<i16>(&dispositivo, config, mezclador),
            SampleFormat::I32 => abrir_salida::<i32>(&dispositivo, config, mezclador),
            otro => Err(format!("Formato de salida no soportado: {otro}")),
        }?;
        stream
            .play()
            .map_err(|e| format!("No se pudo iniciar la salida de audio: {e}"))?;

        *sesion = Some(Sesion {
            stream,
            compartido,
            parar,
            lectores: hilos,
        });
        Ok(())
    }

    pub fn play(&self) -> Result<(), String> {
        self.con_compartido(|c| c.reproduciendo.store(true, Ordering::Relaxed))
    }

    pub fn pausa(&self) -> Result<(), String> {
        self.con_compartido(|c| c.reproduciendo.store(false, Ordering::Relaxed))
    }

    pub fn volumen(&self, indice: usize, valor: f32) -> Result<(), String> {
        self.con_pista(indice, |p| {
            p.volumen.store(valor.to_bits(), Ordering::Relaxed)
        })
    }

    pub fn mute(&self, indice: usize, valor: bool) -> Result<(), String> {
        self.con_pista(indice, |p| p.mute.store(valor, Ordering::Relaxed))
    }

    pub fn solo(&self, indice: usize, valor: bool) -> Result<(), String> {
        self.con_pista(indice, |p| p.solo.store(valor, Ordering::Relaxed))
    }

    fn con_compartido(&self, accion: impl FnOnce(&Compartido)) -> Result<(), String> {
        let sesion = self.sesion.lock().unwrap();
        let sesion = sesion.as_ref().ok_or("Primero carga las pistas")?;
        accion(&sesion.compartido);
        Ok(())
    }

    fn con_pista(&self, indice: usize, accion: impl FnOnce(&ControlPista)) -> Result<(), String> {
        let sesion = self.sesion.lock().unwrap();
        let sesion = sesion.as_ref().ok_or("Primero carga las pistas")?;
        let pista = sesion
            .compartido
            .pistas
            .get(indice)
            .ok_or("Esa pista no existe")?;
        accion(pista);
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

// Suma las pistas aplicando volumen, mute y solo. Vive dentro de la salida de audio.
struct Mezclador {
    colas: Vec<Consumer<f32>>,
    compartido: Arc<Compartido>,
    ganancias: Vec<f32>, // volumen que suena ahora; se acerca poco a poco al objetivo
    objetivos: Vec<f32>,
    paso_rampa: f32,
}

impl Mezclador {
    fn new(colas: Vec<Consumer<f32>>, compartido: Arc<Compartido>, rate: u32) -> Self {
        let total = colas.len();
        Self {
            colas,
            compartido,
            ganancias: vec![0.0; total],
            objetivos: vec![0.0; total],
            paso_rampa: 1.0 / (SEGUNDOS_RAMPA * rate as f32),
        }
    }

    // Lee los controles una vez por bloque, no en cada muestra.
    fn leer_controles(&mut self) {
        let pistas = &self.compartido.pistas;
        let hay_solo = pistas.iter().any(|p| p.solo.load(Ordering::Relaxed));

        for (objetivo, pista) in self.objetivos.iter_mut().zip(pistas) {
            let callada = pista.mute.load(Ordering::Relaxed)
                || (hay_solo && !pista.solo.load(Ordering::Relaxed));
            *objetivo = if callada { 0.0 } else { pista.volumen() };
        }
    }

    // Devuelve el siguiente cuadro mezclado, o None si alguna pista aún no tiene audio.
    fn siguiente_cuadro(&mut self) -> Option<(f32, f32)> {
        let mut quedan_pistas = false;
        for cola in &self.colas {
            if cola.slots() >= 2 {
                quedan_pistas = true;
            } else if !cola.is_abandoned() {
                // Esta pista se atrasó: no se saca de ninguna para no desfasarlas.
                return None;
            }
        }

        if !quedan_pistas {
            // Todos los lectores terminaron y no queda audio: la canción acabó.
            self.compartido.reproduciendo.store(false, Ordering::Relaxed);
            self.compartido.terminado.store(true, Ordering::Relaxed);
            return Some((0.0, 0.0));
        }

        let mut izquierda = 0.0;
        let mut derecha = 0.0;
        for (indice, cola) in self.colas.iter_mut().enumerate() {
            let diferencia = self.objetivos[indice] - self.ganancias[indice];
            self.ganancias[indice] += diferencia.clamp(-self.paso_rampa, self.paso_rampa);

            if cola.slots() >= 2 {
                izquierda += cola.pop().unwrap_or(0.0) * self.ganancias[indice];
                derecha += cola.pop().unwrap_or(0.0) * self.ganancias[indice];
            }
        }
        Some((izquierda, derecha))
    }

    // Llena el bloque que pide Windows. En pausa escribe silencio y no toca las colas,
    // así al volver a Play sigue exactamente donde iba.
    fn escribir<T>(&mut self, datos: &mut [T], canales: usize)
    where
        T: Sample + FromSample<f32>,
    {
        self.leer_controles();
        let mut hubo_corte = false;

        for cuadro in datos.chunks_mut(canales) {
            let (izquierda, derecha) = if self.compartido.reproduciendo.load(Ordering::Relaxed) {
                self.siguiente_cuadro().unwrap_or_else(|| {
                    hubo_corte = true;
                    (0.0, 0.0)
                })
            } else {
                (0.0, 0.0)
            };

            for (canal, muestra) in cuadro.iter_mut().enumerate() {
                let valor = match canal {
                    0 => izquierda,
                    1 => derecha,
                    _ => 0.0,
                };
                *muestra = T::from_sample(valor.clamp(-1.0, 1.0));
            }
        }

        if hubo_corte {
            self.compartido.cortes.fetch_add(1, Ordering::Relaxed);
        }
    }
}

// `T` es el tipo de muestra que pide la tarjeta (casi siempre f32).
fn abrir_salida<T>(
    dispositivo: &Device,
    config: StreamConfig,
    mut mezclador: Mezclador,
) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let canales = config.channels as usize;
    dispositivo
        .build_output_stream(
            config,
            move |datos: &mut [T], _: &cpal::OutputCallbackInfo| {
                mezclador.escribir(datos, canales);
            },
            |error| eprintln!("Error en la salida de audio: {error}"),
            None,
        )
        .map_err(|e| format!("No se pudo abrir la salida de audio: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::time::Duration;

    fn rutas_sinteticas() -> Vec<PathBuf> {
        (1..=8)
            .map(|i| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("../../../samples/sinteticas/pista{i}.flac"))
            })
            .collect()
    }

    // Prueba de cancelación: las 8 pistas son idénticas, y 4 se suman y 4 se restan.
    // Si todas van alineadas el resultado es silencio total. Con un solo cuadro de desfase
    // en cualquier pista aparecería sonido. Las colas son diminutas a propósito,
    // para que las pistas se atrasen todo el tiempo y el reloj único tenga que sostenerlas.
    #[test]
    fn las_pistas_no_se_desfasan() {
        let rate = 48000;
        let compartido = Arc::new(Compartido::new(8));
        let parar = Arc::new(AtomicBool::new(false));

        let mut colas = Vec::new();
        let mut hilos = Vec::new();
        for (indice, ruta) in rutas_sinteticas().iter().enumerate() {
            let lector = track::abrir(ruta).expect("falta correr scripts/generar-pistas.ps1");
            let (productor, consumidor) = RingBuffer::<f32>::new(512 + indice * 300);
            colas.push(consumidor);
            let parar_lector = parar.clone();
            hilos.push(thread::spawn(move || {
                lector.leer(rate, productor, parar_lector)
            }));

            let signo: f32 = if indice % 2 == 0 { 1.0 } else { -1.0 };
            compartido.pistas[indice]
                .volumen
                .store(signo.to_bits(), Ordering::Relaxed);
        }

        let mut mezclador = Mezclador::new(colas, compartido.clone(), rate);
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        let mut bloque = vec![0.0f32; 960];
        let mut pico = 0.0f32;
        while !compartido.terminado.load(Ordering::Relaxed) {
            mezclador.escribir(&mut bloque, 2);
            pico = bloque.iter().fold(pico, |p, m| p.max(m.abs()));
        }
        for hilo in hilos {
            hilo.join().unwrap();
        }

        let cortes = compartido.cortes.load(Ordering::Relaxed);
        println!("pico {pico}, bloques con pistas atrasadas {cortes}");
        assert_eq!(pico, 0.0);
        assert!(cortes > 0, "la prueba no llegó a forzar atrasos");
    }

    // Mute, solo y volumen: comprueba cuánto suena la mezcla en cada caso.
    #[test]
    fn mute_solo_y_volumen() {
        let compartido = Arc::new(Compartido::new(2));
        let mut colas = Vec::new();
        let mut productores = Vec::new();
        for _ in 0..2 {
            let (productor, consumidor) = RingBuffer::<f32>::new(40000);
            productores.push(productor);
            colas.push(consumidor);
        }
        let mut mezclador = Mezclador::new(colas, compartido.clone(), 1000);
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        // Toda la señal vale 1: lo que sale es la suma de las ganancias.
        let mut medir = |mezclador: &mut Mezclador| {
            for productor in productores.iter_mut() {
                for _ in 0..200 {
                    productor.push(1.0).unwrap();
                }
            }
            let mut bloque = vec![0.0f32; 200];
            mezclador.escribir(&mut bloque, 2);
            *bloque.last().unwrap()
        };

        compartido.pistas[0].volumen.store(0.25f32.to_bits(), Ordering::Relaxed);
        compartido.pistas[1].volumen.store(0.5f32.to_bits(), Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.75);

        compartido.pistas[1].mute.store(true, Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.25);

        compartido.pistas[1].solo.store(true, Ordering::Relaxed);
        compartido.pistas[1].mute.store(false, Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.5);
    }

    // Suena por la tarjeta real, así que no corre con `cargo test` normal:
    // cargo test -- --ignored reproduce_sin_cortes
    #[test]
    #[ignore]
    fn reproduce_sin_cortes() {
        let motor = Motor::default();
        motor.cargar(&rutas_sinteticas()).unwrap();
        thread::sleep(Duration::from_millis(500));

        motor.play().unwrap();
        thread::sleep(Duration::from_secs(10));
        motor.pausa().unwrap();
        thread::sleep(Duration::from_millis(500));
        motor.play().unwrap();
        thread::sleep(Duration::from_secs(5));

        let estado = motor.estado();
        assert_eq!(estado.cortes, 0);
        assert!(estado.reproduciendo);
    }
}
