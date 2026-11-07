// Exporta la mezcla a un WAV de 24 bits sin pasar por la tarjeta de sonido.
// Usa el mismo Mezclador que la reproducción: lo que se escucha es lo que se exporta.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use hound::{SampleFormat, WavSpec, WavWriter};
use rtrb::RingBuffer;

use super::engine::{Compartido, Mezclador};
use super::track;

const MAXIMO_24_BITS: f32 = 8_388_607.0;

// `controles` es una copia de los controles: exportar no toca lo que está sonando.
pub fn exportar(rutas: &[PathBuf], controles: Compartido, destino: &Path) -> Result<(), String> {
    let lectores = rutas
        .iter()
        .map(|ruta| track::abrir(ruta))
        .collect::<Result<Vec<_>, _>>()?;
    let rate = lectores.first().ok_or("No hay pistas para exportar")?.rate();

    let archivo = WavWriter::create(
        destino,
        WavSpec {
            channels: 2,
            sample_rate: rate,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        },
    )
    .map_err(|e| format!("No se pudo crear el archivo: {e}"))?;

    let parar = Arc::new(AtomicBool::new(false));
    let mut colas = Vec::new();
    let mut hilos = Vec::new();
    for lector in lectores {
        let (productor, consumidor) = RingBuffer::<f32>::new(rate as usize * 2);
        colas.push(consumidor);
        let parar_lector = parar.clone();
        hilos.push(thread::spawn(move || {
            lector.leer(0.0, rate, productor, parar_lector)
        }));
    }

    let compartido = Arc::new(controles);
    let mut mezclador = Mezclador::new(colas, compartido.clone(), rate, 0.0);
    mezclador.leer_controles();
    // Sin rampa de entrada: el archivo empieza ya con los volúmenes elegidos.
    mezclador.ganancias = mezclador.objetivos.clone();

    let resultado = escribir_mezcla(&mut mezclador, &compartido, archivo);

    parar.store(true, Ordering::Relaxed);
    for hilo in hilos {
        let _ = hilo.join();
    }
    resultado
}

fn escribir_mezcla(
    mezclador: &mut Mezclador,
    compartido: &Compartido,
    mut archivo: WavWriter<std::io::BufWriter<std::fs::File>>,
) -> Result<(), String> {
    loop {
        // Aquí no hay prisa como en la reproducción: si falta audio, se espera al lector.
        let Some((izquierda, derecha)) = mezclador.siguiente_cuadro() else {
            thread::sleep(Duration::from_millis(1));
            continue;
        };
        if compartido.terminado.load(Ordering::Relaxed) {
            break;
        }

        for muestra in [izquierda, derecha] {
            let entero = (muestra.clamp(-1.0, 1.0) * MAXIMO_24_BITS).round() as i32;
            archivo
                .write_sample(entero)
                .map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
        }
    }

    archivo
        .finalize()
        .map_err(|e| format!("No se pudo terminar el archivo: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::super::click::Click;
    use super::*;
    use hound::WavReader;

    fn ruta_sintetica(numero: u32) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(format!("../../samples/sinteticas/pista{numero}.flac"))
    }

    // Compara el WAV contra un cálculo aparte, hecho sin el Mezclador:
    // pista original por su volumen, más el click generado por el suyo.
    #[test]
    fn el_wav_es_exacto_y_dura_lo_justo() {
        let (bpm, tiempos, rate) = (97.0f32, 3u32, 44100u32);
        let (volumen_1, volumen_2, volumen_click) = (0.5f32, 0.25f32, 0.5f32);

        let controles = Compartido::new(3);
        controles.fijar_volumen(0, volumen_1);
        controles.fijar_volumen(1, volumen_2);
        controles.fijar_volumen(2, 1.0);
        controles.pistas[2].mute.store(true, Ordering::Relaxed);
        controles.fijar_volumen(3, volumen_click);
        controles.fijar_click(bpm, tiempos, 0.0);

        let destino = std::env::temp_dir().join("desglose-prueba-exportar.wav");
        let rutas = [ruta_sintetica(1), ruta_sintetica(2), ruta_sintetica(3)];
        exportar(&rutas, controles, &destino).unwrap();

        let mut wav = WavReader::open(&destino).unwrap();
        assert_eq!(wav.spec().bits_per_sample, 24);
        assert_eq!(wav.spec().channels, 2);
        assert_eq!(wav.spec().sample_rate, rate);
        assert_eq!(wav.duration(), 300 * rate);

        let lector = track::abrir(&rutas[0]).unwrap();
        let (productor, mut original) = RingBuffer::<f32>::new(rate as usize * 2);
        let parar = Arc::new(AtomicBool::new(false));
        let hilo = thread::spawn(move || lector.leer(0.0, rate, productor, parar));

        let click = Click::new(bpm, tiempos, rate, 0.0);
        let mut muestras = wav.samples::<i32>();
        let mut mayor = 0.0f32;
        for cuadro in 0..(300 * rate) as u64 {
            while original.slots() < 2 {
                thread::yield_now();
            }
            let izquierda = original.pop().unwrap();
            original.pop().unwrap();

            let esperado =
                izquierda * (volumen_1 + volumen_2) + click.muestra(cuadro) * volumen_click;
            let obtenido = muestras.next().unwrap().unwrap() as f32 / MAXIMO_24_BITS;
            muestras.next();
            mayor = mayor.max((esperado - obtenido).abs());
        }
        hilo.join().unwrap();
        std::fs::remove_file(&destino).unwrap();

        println!("mayor diferencia {mayor}");
        assert!(mayor < 0.000001);
    }
}
