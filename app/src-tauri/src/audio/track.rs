// Lee una pista desde el disco por bloques y la deja en la cola que usa la salida de audio.
// Nunca carga el archivo completo: si la cola está llena, espera a que se vacíe.

use std::fs::File;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use rtrb::Producer;
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::Timestamp;

// Cuadros que convierte el resampler en cada vuelta. Un cuadro = una muestra izquierda + una derecha.
const BLOQUE: usize = 1024;

pub struct Lector {
    formato: Box<dyn FormatReader>,
    decodificador: Box<dyn AudioDecoder>,
    id_pista: u32,
    rate: u32,
    cuadros_totales: u64,
}

// Abre el archivo y prepara el decodificador. Aquí salen los errores de archivo inválido.
pub fn abrir(ruta: &Path) -> Result<Lector, String> {
    let archivo = File::open(ruta).map_err(|e| format!("No se pudo abrir el archivo: {e}"))?;
    let fuente = MediaSourceStream::new(Box::new(archivo), Default::default());

    let formato = symphonia::default::get_probe()
        .probe(
            &Hint::new(),
            fuente,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| format!("Formato no reconocido: {e}"))?;

    let pista = formato
        .default_track(TrackType::Audio)
        .ok_or("El archivo no tiene audio")?;
    let id_pista = pista.id;
    let cuadros_totales = pista.num_frames.unwrap_or(0);
    let parametros = pista
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or("El archivo no tiene audio")?;
    let rate = parametros
        .sample_rate
        .ok_or("El archivo no indica su frecuencia")?;

    let decodificador = symphonia::default::get_codecs()
        .make_audio_decoder(parametros, &AudioDecoderOptions::default())
        .map_err(|e| format!("No se puede decodificar el archivo: {e}"))?;

    Ok(Lector {
        formato,
        decodificador,
        id_pista,
        rate,
        cuadros_totales,
    })
}

impl Lector {
    pub fn rate(&self) -> u32 {
        self.rate
    }

    pub fn duracion(&self) -> f64 {
        self.cuadros_totales as f64 / self.rate as f64
    }

    // Se ubica en `inicio` segundos. Devuelve los cuadros que hay que descartar después,
    // porque el archivo solo permite caer un poco antes del punto pedido.
    fn ubicar(&mut self, inicio: f64) -> Result<usize, Error> {
        if inicio <= 0.0 {
            return Ok(0);
        }

        let destino = (inicio * self.rate as f64).round() as i64;
        let ubicado = self.formato.seek(
            SeekMode::Accurate,
            SeekTo::Timestamp {
                ts: Timestamp::from(destino),
                track_id: self.id_pista,
            },
        )?;
        self.decodificador.reset();
        Ok((ubicado.required_ts.get() - ubicado.actual_ts.get()).max(0) as usize)
    }

    /// Decodifica el archivo completo, de principio a fin, sin convertir la frecuencia.
    /// Entrega cada bloque intercalado (izq, der, izq, der...) con su número de canales.
    /// Sirve para analizar una pista entera, por ejemplo para saber si está vacía.
    pub fn recorrer(mut self, mut al_bloque: impl FnMut(&[f32], usize)) {
        let mut decodificado: Vec<f32> = Vec::new();
        while let Ok(Some(paquete)) = self.formato.next_packet() {
            if paquete.track_id != self.id_pista {
                continue;
            }
            let audio = match self.decodificador.decode(&paquete) {
                Ok(audio) => audio,
                Err(Error::DecodeError(_)) => continue,
                Err(_) => break,
            };
            let canales = audio.spec().channels().count();
            decodificado.resize(audio.samples_interleaved(), 0.0);
            audio.copy_to_slice_interleaved(&mut decodificado);
            al_bloque(&decodificado, canales);
        }
    }

    // Corre en su propio hilo hasta terminar el archivo o hasta que `parar` sea verdadero.
    // Deja en la cola audio estéreo intercalado (izq, der, izq, der...) a `rate_salida`.
    pub fn leer(
        mut self,
        inicio: f64,
        rate_salida: u32,
        mut cola: Producer<f32>,
        parar: Arc<AtomicBool>,
    ) {
        let mut decodificado: Vec<f32> = Vec::new();
        let mut pendiente: Vec<f32> = Vec::new();

        let mut conversor = None;
        if self.rate != rate_salida {
            match Conversor::new(self.rate, rate_salida) {
                Ok(nuevo) => conversor = Some(nuevo),
                Err(error) => {
                    eprintln!("{error}");
                    return;
                }
            }
        }

        // Cuadros que debe entregar en total: así la pista dura lo justo, sin cola de más.
        let mut restantes = if self.cuadros_totales == 0 {
            u64::MAX
        } else {
            let segundos = (self.duracion() - inicio).max(0.0);
            (segundos * rate_salida as f64).round() as u64
        };

        // Si el punto pedido queda después del final, la pista simplemente no suena.
        let Ok(mut descartar) = self.ubicar(inicio) else {
            return;
        };

        while let Ok(Some(paquete)) = self.formato.next_packet() {
            if paquete.track_id != self.id_pista {
                continue;
            }

            let audio = match self.decodificador.decode(&paquete) {
                Ok(audio) => audio,
                Err(Error::DecodeError(_)) => continue,
                Err(_) => break,
            };

            let canales = audio.spec().channels().count();
            decodificado.resize(audio.samples_interleaved(), 0.0);
            audio.copy_to_slice_interleaved(&mut decodificado);

            // Una pista mono se copia a los dos lados; de más de 2 canales se usan los 2 primeros.
            for cuadro in decodificado.chunks_exact(canales) {
                if descartar > 0 {
                    descartar -= 1;
                    continue;
                }
                pendiente.push(cuadro[0]);
                pendiente.push(if canales > 1 { cuadro[1] } else { cuadro[0] });
            }

            if !enviar(
                &mut pendiente,
                conversor.as_mut(),
                &mut restantes,
                &mut cola,
                &parar,
            ) {
                return;
            }
        }

        // El resampler guarda audio por dentro; este silencio final empuja lo último que le queda.
        if conversor.is_some() {
            pendiente.resize(pendiente.len() + BLOQUE * 4, 0.0);
            enviar(
                &mut pendiente,
                conversor.as_mut(),
                &mut restantes,
                &mut cola,
                &parar,
            );
        }
        // Al terminar, `cola` se destruye y la salida de audio sabe que la pista acabó.
    }
}

// Convierte de la frecuencia del archivo a la de la tarjeta de sonido.
// Sin esto, una pista de 44.1 kHz en una tarjeta a 48 kHz sonaría más rápida y más aguda.
struct Conversor {
    fft: Fft<f32>,
    salida: Vec<f32>,
    recortar: usize, // silencio que el resampler agrega al inicio; se quita para no correr el tiempo
}

impl Conversor {
    fn new(rate_archivo: u32, rate_salida: u32) -> Result<Self, String> {
        let fft = Fft::<f32>::new(
            rate_archivo as usize,
            rate_salida as usize,
            BLOQUE,
            2,
            FixedSync::Input,
        )
        .map_err(|e| format!("No se pudo crear el conversor: {e}"))?;
        let salida = vec![0.0; fft.output_frames_max() * 2];
        let recortar = fft.output_delay();
        Ok(Self {
            fft,
            salida,
            recortar,
        })
    }
}

// Pasa a la cola todo lo que se pueda de `pendiente`. Devuelve false si pidieron parar.
fn enviar(
    pendiente: &mut Vec<f32>,
    conversor: Option<&mut Conversor>,
    restantes: &mut u64,
    cola: &mut Producer<f32>,
    parar: &AtomicBool,
) -> bool {
    let Some(conversor) = conversor else {
        let seguir = empujar(pendiente, restantes, cola, parar);
        pendiente.clear();
        return seguir;
    };

    loop {
        let cuadros = conversor.fft.input_frames_next();
        if pendiente.len() < cuadros * 2 {
            return true;
        }

        let capacidad = conversor.salida.len() / 2;
        let entrada = InterleavedSlice::new(&pendiente[..cuadros * 2], 2, cuadros)
            .expect("el bloque de entrada tiene el tamaño correcto");
        let mut salida = InterleavedSlice::new_mut(&mut conversor.salida, 2, capacidad)
            .expect("el bloque de salida tiene el tamaño correcto");
        let (_, escritos) = conversor
            .fft
            .process_into_buffer(&entrada, &mut salida, None)
            .expect("los bloques cumplen lo que pide el conversor");

        let saltar = conversor.recortar.min(escritos);
        conversor.recortar -= saltar;
        if !empujar(
            &conversor.salida[saltar * 2..escritos * 2],
            restantes,
            cola,
            parar,
        ) {
            return false;
        }
        pendiente.drain(..cuadros * 2);
    }
}

// Mete muestras en la cola; si está llena espera un poco. Así la RAM no crece.
// Nunca pasa de `restantes`: lo que sobre al final no se entrega.
fn empujar(
    muestras: &[f32],
    restantes: &mut u64,
    cola: &mut Producer<f32>,
    parar: &AtomicBool,
) -> bool {
    let cuadros = (muestras.len() as u64 / 2).min(*restantes);
    *restantes -= cuadros;

    for &muestra in &muestras[..cuadros as usize * 2] {
        while cola.push(muestra).is_err() {
            if parar.load(Ordering::Relaxed) {
                return false;
            }
            thread::sleep(Duration::from_millis(5));
        }
    }
    !parar.load(Ordering::Relaxed)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use rtrb::RingBuffer;

    // Lee la pista sintética desde `inicio` y comprueba duración y posición de los clicks.
    // Si la conversión o el salto fallaran, los clicks no caerían donde deben.
    fn comprobar(rate: u32, inicio: f64, primer_click: f64, total_clicks: usize) {
        let ruta = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../samples/sinteticas/pista1.flac"
        );
        let lector = abrir(Path::new(ruta)).expect("falta correr scripts/generar-pistas.ps1");
        assert_eq!(lector.duracion(), 300.0);

        let (productor, mut consumidor) = RingBuffer::<f32>::new(rate as usize * 2);
        let parar = Arc::new(AtomicBool::new(false));
        let hilo = thread::spawn(move || lector.leer(inicio, rate, productor, parar));

        let mut cuadros = 0usize;
        let mut clicks = Vec::new();
        let mut silencio = usize::MAX / 2; // el primer click puede caer en el instante 0
        loop {
            if consumidor.slots() >= 2 {
                let izquierda = consumidor.pop().unwrap();
                consumidor.pop().unwrap();
                if izquierda.abs() > 0.05 {
                    if silencio > 1000 {
                        clicks.push(cuadros);
                    }
                    silencio = 0;
                } else {
                    silencio += 1;
                }
                cuadros += 1;
            } else if consumidor.is_abandoned() {
                break;
            }
        }
        hilo.join().unwrap();

        let esperados = ((300.0 - inicio) * rate as f64) as usize;
        assert!(cuadros.abs_diff(esperados) <= 1, "{cuadros} cuadros");
        assert_eq!(clicks.len(), total_clicks);

        let esperado = (primer_click * rate as f64) as usize;
        assert!(
            clicks[0].abs_diff(esperado) <= 8,
            "primer click en {}",
            clicks[0]
        );

        let medio_segundo = rate as usize / 2;
        for par in clicks.windows(2) {
            let distancia = par[1] - par[0];
            assert!(
                distancia.abs_diff(medio_segundo) <= 2,
                "distancia {distancia}"
            );
        }
    }

    #[test]
    fn lee_sin_convertir() {
        comprobar(44100, 0.0, 0.0, 600);
    }

    #[test]
    fn convierte_a_48_khz() {
        comprobar(48000, 0.0, 0.0, 600);
    }

    // Saltar a 1,2 s: el click de 1,5 s debe sonar 0,3 s después.
    #[test]
    fn salta_al_punto_exacto() {
        comprobar(44100, 1.2, 0.3, 597);
    }

    #[test]
    fn salta_al_punto_exacto_convirtiendo() {
        comprobar(48000, 1.2, 0.3, 597);
    }
}
