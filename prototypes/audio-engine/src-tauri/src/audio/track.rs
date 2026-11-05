// Lee una pista desde el disco por bloques y la deja en la cola que usa la salida de audio.
// Nunca carga el archivo completo: si la cola está llena, espera a que se vacíe.

use std::fs::File;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use rtrb::Producer;
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

// Cuadros que convierte el resampler en cada vuelta. Un cuadro = una muestra izquierda + una derecha.
const BLOQUE: usize = 1024;

pub struct Lector {
    formato: Box<dyn FormatReader>,
    decodificador: Box<dyn AudioDecoder>,
    id_pista: u32,
}

// Abre el archivo y prepara el decodificador. Aquí salen los errores de archivo inválido.
pub fn abrir(ruta: &str) -> Result<Lector, String> {
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
    let parametros = pista
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or("El archivo no tiene audio")?;

    let decodificador = symphonia::default::get_codecs()
        .make_audio_decoder(parametros, &AudioDecoderOptions::default())
        .map_err(|e| format!("No se puede decodificar el archivo: {e}"))?;

    Ok(Lector {
        formato,
        decodificador,
        id_pista,
    })
}

impl Lector {
    // Corre en su propio hilo hasta terminar el archivo o hasta que `parar` sea verdadero.
    // Deja en la cola audio estéreo intercalado (izq, der, izq, der...) a `rate_salida`.
    pub fn leer(mut self, rate_salida: u32, mut cola: Producer<f32>, parar: Arc<AtomicBool>) {
        let mut decodificado: Vec<f32> = Vec::new();
        let mut pendiente: Vec<f32> = Vec::new();
        let mut conversor: Option<Conversor> = None;
        let mut primer_bloque = true;

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
            let rate_archivo = audio.spec().rate();
            decodificado.resize(audio.samples_interleaved(), 0.0);
            audio.copy_to_slice_interleaved(&mut decodificado);

            if primer_bloque {
                primer_bloque = false;
                if rate_archivo != rate_salida {
                    match Conversor::new(rate_archivo, rate_salida) {
                        Ok(nuevo) => conversor = Some(nuevo),
                        Err(error) => {
                            eprintln!("{error}");
                            return;
                        }
                    }
                }
            }

            // Una pista mono se copia a los dos lados; de más de 2 canales se usan los 2 primeros.
            for cuadro in decodificado.chunks_exact(canales) {
                pendiente.push(cuadro[0]);
                pendiente.push(if canales > 1 { cuadro[1] } else { cuadro[0] });
            }

            if !enviar(&mut pendiente, conversor.as_mut(), &mut cola, &parar) {
                return;
            }
        }

        // El resampler guarda audio por dentro; este silencio final empuja lo último que le queda.
        if conversor.is_some() {
            pendiente.resize(pendiente.len() + BLOQUE * 4, 0.0);
            enviar(&mut pendiente, conversor.as_mut(), &mut cola, &parar);
        }
        // Al terminar, `cola` se destruye y la salida de audio sabe que la pista acabó.
    }
}

// Convierte de la frecuencia del archivo a la de la tarjeta de sonido.
// Sin esto, una pista de 44.1 kHz en una tarjeta a 48 kHz sonaría más rápida y más aguda.
struct Conversor {
    fft: Fft<f32>,
    salida: Vec<f32>,
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
        Ok(Self { fft, salida })
    }
}

// Pasa a la cola todo lo que se pueda de `pendiente`. Devuelve false si pidieron parar.
fn enviar(
    pendiente: &mut Vec<f32>,
    conversor: Option<&mut Conversor>,
    cola: &mut Producer<f32>,
    parar: &AtomicBool,
) -> bool {
    let Some(conversor) = conversor else {
        let seguir = empujar(pendiente, cola, parar);
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

        if !empujar(&conversor.salida[..escritos * 2], cola, parar) {
            return false;
        }
        pendiente.drain(..cuadros * 2);
    }
}

// Mete muestras en la cola; si está llena espera un poco. Así la RAM no crece.
fn empujar(muestras: &[f32], cola: &mut Producer<f32>, parar: &AtomicBool) -> bool {
    for &muestra in muestras {
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

    // Lee la pista sintética y comprueba duración y distancia entre clicks.
    // Si la conversión de frecuencia fallara, el tiempo entre clicks no daría 0,5 s.
    fn comprobar(rate: u32) {
        let ruta = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../samples/sinteticas/pista1.flac"
        );
        let lector = abrir(ruta).expect("falta correr scripts/generar-pistas.ps1");

        let (productor, mut consumidor) = RingBuffer::<f32>::new(rate as usize * 2);
        let parar = Arc::new(AtomicBool::new(false));
        let hilo = thread::spawn(move || lector.leer(rate, productor, parar));

        let mut cuadros = 0usize;
        let mut clicks = Vec::new();
        let mut silencio = usize::MAX / 2; // el primer click cae en el instante 0
        loop {
            if consumidor.slots() >= 2 {
                let izquierda = consumidor.pop().unwrap();
                consumidor.pop().unwrap();
                if izquierda.abs() > 0.2 {
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

        let esperados = 300 * rate as usize;
        assert!(cuadros >= esperados && cuadros < esperados + 8192, "{cuadros} cuadros");
        assert_eq!(clicks.len(), 600);
        let medio_segundo = rate as usize / 2;
        for par in clicks.windows(2) {
            let distancia = par[1] - par[0];
            assert!(distancia.abs_diff(medio_segundo) <= 2, "distancia {distancia}");
        }
    }

    #[test]
    fn lee_sin_convertir() {
        comprobar(44100);
    }

    #[test]
    fn convierte_a_48_khz() {
        comprobar(48000);
    }
}
