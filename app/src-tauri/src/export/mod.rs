// Exportar el paquete para REAPER: una carpeta con un WAV por pista, CLICK.wav,
// GUIA.wav y un proyecto .RPP con las secciones como regiones.
//
// Lo que se escucha es lo que se exporta:
//   - Van las pistas con "R" encendida, cada una con su volumen.
//   - CLICK y GUIA solo si están encendidos, con su volumen.
//   - Si se cambió la velocidad o el tono, las pistas pasan por el mismo
//     estirador que al escuchar. El click y la guía caen donde toca pero no se
//     estiran ni cambian de tono (igual que al escuchar). El BPM y las regiones
//     del .RPP se reajustan a la nueva velocidad.
//
// Todo sale en UNA pasada: un hilo por pista lee su archivo por bloques (como al
// reproducir) y aquí se escriben todos los WAV a la vez. Nada se carga entero en
// memoria. Todos los archivos empiezan en 0 y duran exactamente lo mismo.

pub mod rpp;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use hound::{SampleFormat, WavSpec, WavWriter};
use rtrb::{Consumer, RingBuffer};
use serde::Deserialize;

use crate::audio::click::Click;
use crate::audio::guia::Guia;
use crate::audio::stretch::Estirador;
use crate::audio::track;

const MAXIMO_24_BITS: f32 = 8_388_607.0;
/// Cuadros de salida que se procesan por vuelta.
const BLOQUE: usize = 1024;
/// Cada cuántos cuadros se avisa el avance.
const AVISAR_CADA: u64 = 44_100;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PistaExport {
    /// Nombre que se ve en REAPER ("Bateria", "Voz líder").
    pub nombre: String,
    /// Dentro de la carpeta de la canción ("pistas/bateria.flac").
    pub archivo: String,
    /// Segundos que va corrida (desfase propio + compases antes de la música).
    pub desfase: f64,
    pub volumen: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickExport {
    pub bpm: f32,
    pub tiempos: u32,
    /// Segundo del primer tiempo, ya contando los compases antes de la música.
    pub inicio: f32,
    pub conteo: u32,
    pub volumen: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeccionExport {
    pub nombre: String,
    /// Segundos en la línea de la app (a velocidad normal).
    pub inicio: f64,
    pub fin: f64,
}

/// Lo que arma la interfaz al pulsar "Exportar".
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pedido {
    /// Carpeta donde se crea el paquete (la elige el encargado).
    pub destino: PathBuf,
    /// Nombre de la carpeta del paquete: "Yo soy la ofrenda - 140bpm - Em".
    pub carpeta: String,
    /// Nombre del proyecto: "Yo soy la ofrenda".
    pub proyecto: String,
    pub pistas: Vec<PistaExport>,
    /// `None` si el click está apagado.
    pub click: Option<ClickExport>,
    /// `(segundo, frase)` en la línea de la app; `None` si la guía está apagada.
    pub guia: Option<Vec<(f64, String)>>,
    pub volumen_guia: f32,
    /// BPM y compás para el .RPP (aunque el click no vaya).
    pub bpm: f64,
    pub tiempos: u32,
    pub secciones: Vec<SeccionExport>,
    /// Segundos de la línea completa (con los compases antes de la música).
    pub duracion: f64,
    pub velocidad: f64,
    pub semitonos: f32,
}

/// Arma el paquete. `ruta_de` convierte el archivo de una pista en su ruta completa;
/// `guia_de` arma la voz guía con las frases del motor. Devuelve la carpeta creada.
pub fn exportar(
    pedido: &Pedido,
    ruta_de: impl Fn(&str) -> Result<PathBuf, String>,
    guia_de: impl FnOnce(&[(f64, String)]) -> Guia,
    cancelar: &AtomicBool,
    mut avisar: impl FnMut(f64),
) -> Result<PathBuf, String> {
    if pedido.pistas.is_empty() && pedido.click.is_none() && pedido.guia.is_none() {
        return Err("No hay nada para exportar: enciende la R de alguna pista, el click o la guía.".into());
    }
    let velocidad = pedido.velocidad.clamp(0.5, 1.5);

    let rutas = pedido
        .pistas
        .iter()
        .map(|p| ruta_de(&p.archivo))
        .collect::<Result<Vec<_>, _>>()?;
    let lectores = rutas.iter().map(|r| track::abrir(r)).collect::<Result<Vec<_>, _>>()?;
    // Las pistas de MVSep vienen a 44,1 kHz: se exporta igual, sin convertir.
    let rate = lectores.first().map_or(44_100, |l| l.rate());

    let carpeta = carpeta_libre(&pedido.destino, &limpiar_nombre(&pedido.carpeta))?;
    fs::create_dir_all(&carpeta).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;

    let resultado = escribir_paquete(pedido, lectores, rate, velocidad, &carpeta, guia_de, cancelar, &mut avisar);
    if resultado.is_err() {
        // Cancelado o fallido: no se deja un paquete a medias.
        let _ = fs::remove_dir_all(&carpeta);
    }
    resultado.map(|_| carpeta)
}

/// Un archivo de salida y de dónde sale su audio.
struct Salida {
    archivo: String,
    nombre: String,
    escritor: WavWriter<std::io::BufWriter<fs::File>>,
}

#[allow(clippy::too_many_arguments)]
fn escribir_paquete(
    pedido: &Pedido,
    lectores: Vec<track::Lector>,
    rate: u32,
    velocidad: f64,
    carpeta: &Path,
    guia_de: impl FnOnce(&[(f64, String)]) -> Guia,
    cancelar: &AtomicBool,
    avisar: &mut impl FnMut(f64),
) -> Result<(), String> {
    // Cuadros de la canción (a velocidad normal) y de cada archivo de salida.
    let total_cancion = (pedido.duracion * rate as f64).ceil() as u64;
    let total = (total_cancion as f64 / velocidad).ceil() as u64;

    // Los archivos, numerados: primero CLICK y GUIA, después las pistas.
    let mut numero = 0;
    let mut crear = |nombre: &str, canales: u16| -> Result<Salida, String> {
        numero += 1;
        let archivo = format!("{numero:02} {}.wav", limpiar_nombre(nombre));
        let escritor = WavWriter::create(
            carpeta.join(&archivo),
            WavSpec { channels: canales, sample_rate: rate, bits_per_sample: 24, sample_format: SampleFormat::Int },
        )
        .map_err(|e| format!("No se pudo crear {archivo}: {e}"))?;
        Ok(Salida { archivo, nombre: nombre.to_string(), escritor })
    };

    let click = pedido.click.as_ref().map(|c| Click::new(c.bpm, c.tiempos, rate, c.inicio, c.conteo));
    let mut salida_click = match &pedido.click {
        Some(_) => Some(crear("CLICK", 1)?),
        None => None,
    };
    let guia = pedido.guia.as_ref().map(|avisos| guia_de(avisos));
    let mut salida_guia = match &guia {
        Some(_) => Some(crear("GUIA", 1)?),
        None => None,
    };
    let mut salidas_pistas = pedido
        .pistas
        .iter()
        .map(|p| crear(&p.nombre, 2))
        .collect::<Result<Vec<_>, _>>()?;

    // Un lector por pista, cada uno en su hilo, igual que al reproducir.
    let parar = Arc::new(AtomicBool::new(false));
    let mut colas: Vec<Consumer<f32>> = Vec::new();
    let mut hilos: Vec<JoinHandle<()>> = Vec::new();
    for (lector, pista) in lectores.into_iter().zip(&pedido.pistas) {
        let (productor, consumidor) = RingBuffer::<f32>::new(rate as usize * 4);
        colas.push(consumidor);
        let parar_lector = parar.clone();
        let desfase = pista.desfase;
        hilos.push(thread::spawn(move || lector.leer_desde(0.0, desfase, rate, productor, parar_lector)));
    }

    // Con velocidad o tono distintos, cada pista pasa por su estirador. Al empezar,
    // el estirador va atrasado: esos primeros cuadros se descartan para que la pista
    // quede alineada con el click y la guía desde el cuadro 0.
    let estudio = velocidad != 1.0 || pedido.semitonos != 0.0;
    let mut estiradores: Vec<Estirador> = (0..colas.len())
        .map(|_| {
            let mut e = Estirador::new(rate);
            e.ajustar_tono(pedido.semitonos);
            e
        })
        .collect();
    let mut descartar = if estudio {
        estiradores.first().map_or(0, |e| (e.latencia(velocidad) / velocidad).round() as u64)
    } else {
        0
    };

    let resultado = (|| -> Result<(), String> {
        let mut escritos: u64 = 0; // cuadros de salida ya escritos
        let mut resto = 0.0; // fracción de cuadro de la canción que quedó de la vuelta anterior
        let mut proximo_aviso = 0;
        let mut bloque_pista = vec![0.0f32; BLOQUE * 2];

        while escritos < total {
            if cancelar.load(Ordering::Relaxed) {
                return Err("Exportación cancelada.".into());
            }
            // Mientras se descarta el atraso del estirador, no se escribe nada.
            let cuadros = if descartar > 0 {
                (descartar as usize).min(BLOQUE)
            } else {
                ((total - escritos) as usize).min(BLOQUE)
            };

            // Pistas.
            let exacto = cuadros as f64 * velocidad + resto;
            let pedir = exacto.floor() as usize;
            resto = exacto - pedir as f64;
            for (indice, cola) in colas.iter_mut().enumerate() {
                let volumen = pedido.pistas[indice].volumen;
                if estudio {
                    let estirador = &mut estiradores[indice];
                    estirador.entrada.clear();
                    for _ in 0..pedir {
                        let (izquierda, derecha) = sacar(cola);
                        estirador.entrada.push(izquierda);
                        estirador.entrada.push(derecha);
                    }
                    estirador.estirar(cuadros);
                    bloque_pista[..cuadros * 2].copy_from_slice(&estirador.salida[..cuadros * 2]);
                } else {
                    for cuadro in 0..cuadros {
                        let (izquierda, derecha) = sacar(cola);
                        bloque_pista[cuadro * 2] = izquierda;
                        bloque_pista[cuadro * 2 + 1] = derecha;
                    }
                }
                if descartar == 0 {
                    for muestra in &bloque_pista[..cuadros * 2] {
                        escribir(&mut salidas_pistas[indice].escritor, muestra * volumen)?;
                    }
                }
            }
            if descartar > 0 {
                descartar -= cuadros as u64;
                continue;
            }

            // Click y guía: se calculan desde la posición en la canción, sin estirarse.
            for cuadro in 0..cuadros {
                let posicion = (escritos + cuadro as u64) as f64 * velocidad;
                if let (Some(click), Some(salida), Some(c)) = (&click, &mut salida_click, &pedido.click) {
                    escribir(&mut salida.escritor, click.muestra_en(posicion, velocidad) * c.volumen)?;
                }
                if let (Some(guia), Some(salida)) = (&guia, &mut salida_guia) {
                    escribir(&mut salida.escritor, guia.muestra_en(posicion, rate, velocidad) * pedido.volumen_guia)?;
                }
            }

            escritos += cuadros as u64;
            if escritos >= proximo_aviso {
                avisar(escritos as f64 / total as f64);
                proximo_aviso = escritos + AVISAR_CADA;
            }
        }
        Ok(())
    })();

    parar.store(true, Ordering::Relaxed);
    drop(colas);
    for hilo in hilos {
        let _ = hilo.join();
    }
    resultado?;

    // Cerrar los WAV y escribir el proyecto.
    let duracion = total as f64 / rate as f64;
    let mut pistas_rpp = Vec::new();
    for salida in salida_click.into_iter().chain(salida_guia).chain(salidas_pistas) {
        salida.escritor.finalize().map_err(|e| format!("No se pudo terminar {}: {e}", salida.archivo))?;
        pistas_rpp.push(rpp::Pista { nombre: salida.nombre, archivo: salida.archivo, duracion });
    }
    let (bpm, figura) = tempo_rpp(pedido.bpm * velocidad, pedido.tiempos);
    let proyecto = rpp::Proyecto {
        rate,
        tempos: vec![rpp::Tempo { inicio: 0.0, bpm, tiempos: pedido.tiempos, figura }],
        secciones: pedido
            .secciones
            .iter()
            .map(|s| rpp::Seccion {
                nombre: s.nombre.clone(),
                inicio: redondear(s.inicio / velocidad),
                fin: redondear((s.fin / velocidad).min(duracion)),
            })
            .collect(),
        pistas: pistas_rpp,
    };
    let nombre = format!("{}.RPP", limpiar_nombre(&pedido.proyecto));
    fs::write(carpeta.join(&nombre), rpp::escribir(&proyecto))
        .map_err(|e| format!("No se pudo escribir el proyecto: {e}"))?;
    avisar(1.0);
    Ok(())
}

/// Saca un cuadro estéreo de la cola. Si el lector todavía no lo tiene, espera;
/// si la pista ya terminó (o es más corta), entrega silencio.
fn sacar(cola: &mut Consumer<f32>) -> (f32, f32) {
    loop {
        if cola.slots() >= 2 {
            return (cola.pop().unwrap_or(0.0), cola.pop().unwrap_or(0.0));
        }
        if cola.is_abandoned() {
            return (0.0, 0.0);
        }
        thread::sleep(Duration::from_micros(200));
    }
}

fn escribir(escritor: &mut WavWriter<std::io::BufWriter<fs::File>>, muestra: f32) -> Result<(), String> {
    let entero = (muestra.clamp(-1.0, 1.0) * MAXIMO_24_BITS).round() as i32;
    escritor.write_sample(entero).map_err(|e| format!("No se pudo escribir el audio: {e}"))
}

/// En la app, el BPM de 6/8 y 12/8 cuenta corcheas. REAPER cuenta el tempo en
/// negras: se divide por 2 y el compás se escribe sobre 8.
fn tempo_rpp(bpm: f64, tiempos: u32) -> (f64, u32) {
    let bpm = (bpm * 1000.0).round() / 1000.0;
    if tiempos > 3 && tiempos % 3 == 0 {
        (bpm / 2.0, 8)
    } else {
        (bpm, 4)
    }
}

fn redondear(segundos: f64) -> f64 {
    (segundos * 1000.0).round() / 1000.0
}

/// Quita los caracteres que Windows no permite en un nombre de archivo.
fn limpiar_nombre(nombre: &str) -> String {
    let limpio: String = nombre
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { ' ' } else { c })
        .collect();
    let limpio = limpio.split_whitespace().collect::<Vec<_>>().join(" ");
    let limpio = limpio.trim_end_matches('.').trim().to_string();
    if limpio.is_empty() { "Sin nombre".into() } else { limpio }
}

/// Si ya hay una carpeta con ese nombre, usa "Nombre (2)", "Nombre (3)"...
fn carpeta_libre(destino: &Path, nombre: &str) -> Result<PathBuf, String> {
    if !destino.is_dir() {
        return Err("La carpeta de destino no existe.".into());
    }
    let primera = destino.join(nombre);
    if !primera.exists() {
        return Ok(primera);
    }
    (2..1000)
        .map(|n| destino.join(format!("{nombre} ({n})")))
        .find(|r| !r.exists())
        .ok_or_else(|| "Hay demasiadas carpetas con ese nombre.".into())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::audio::guia::Banco;

    fn sinteticas() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../samples/sinteticas")
    }

    fn pedido(destino: &Path, velocidad: f64, semitonos: f32) -> Pedido {
        Pedido {
            destino: destino.to_path_buf(),
            carpeta: "Prueba: 120bpm".into(),
            proyecto: "Prueba".into(),
            pistas: vec![
                PistaExport { nombre: "Bateria".into(), archivo: "pista1.flac".into(), desfase: 2.0, volumen: 1.0 },
                PistaExport { nombre: "Bajo".into(), archivo: "pista2.flac".into(), desfase: 2.0, volumen: 0.5 },
            ],
            click: Some(ClickExport { bpm: 120.0, tiempos: 4, inicio: 2.0, conteo: 1, volumen: 0.8 }),
            guia: None,
            volumen_guia: 0.9,
            bpm: 120.0,
            tiempos: 4,
            secciones: vec![SeccionExport { nombre: "Intro".into(), inicio: 0.0, fin: 10.0 }],
            duracion: 10.0,
            velocidad,
            semitonos,
        }
    }

    fn exportar_prueba(velocidad: f64, semitonos: f32) -> (PathBuf, PathBuf) {
        let sello = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let destino = std::env::temp_dir().join(format!("desglose-export-{sello}"));
        fs::create_dir_all(&destino).unwrap();
        let carpeta = exportar(
            &pedido(&destino, velocidad, semitonos),
            |archivo| Ok(sinteticas().join(archivo)),
            |avisos| Guia::new(&Banco::default(), avisos),
            &AtomicBool::new(false),
            |_| {},
        )
        .unwrap();
        (destino, carpeta)
    }

    fn cuadros(ruta: &Path) -> u32 {
        hound::WavReader::open(ruta).unwrap().duration()
    }

    // Todos los archivos duran lo mismo: 10 s de línea a 44,1 kHz.
    #[test]
    fn todos_los_wav_duran_lo_mismo_y_el_rpp_los_nombra() {
        let (destino, carpeta) = exportar_prueba(1.0, 0.0);
        assert!(carpeta.ends_with("Prueba 120bpm"), "quita los dos puntos del nombre");
        let esperado = 441_000;
        for archivo in ["01 CLICK.wav", "02 Bateria.wav", "03 Bajo.wav"] {
            assert_eq!(cuadros(&carpeta.join(archivo)), esperado, "{archivo}");
        }
        let rpp = fs::read_to_string(carpeta.join("Prueba.RPP")).unwrap();
        assert!(rpp.contains("TEMPO 120 4 4"));
        assert!(rpp.contains("FILE \"01 CLICK.wav\""));
        assert!(rpp.contains("MARKER 1 0 \"Intro\" 1"));
        fs::remove_dir_all(destino).unwrap();
    }

    // A 80%: los archivos duran 10 / 0,8 = 12,5 s, el tempo baja y la región se estira.
    #[test]
    fn a_otra_velocidad_se_reajustan_duracion_tempo_y_regiones() {
        let (destino, carpeta) = exportar_prueba(0.8, 2.0);
        for archivo in ["01 CLICK.wav", "02 Bateria.wav", "03 Bajo.wav"] {
            assert_eq!(cuadros(&carpeta.join(archivo)), 551_250, "{archivo}");
        }
        let rpp = fs::read_to_string(carpeta.join("Prueba.RPP")).unwrap();
        assert!(rpp.contains("TEMPO 96 4 4"));
        assert!(rpp.contains("MARKER 1 12.5 \"\" 1"));
        fs::remove_dir_all(destino).unwrap();
    }

    // El click exportado: el compás de conteo empieza en 0 y el primer tiempo cae en 2 s.
    #[test]
    fn el_click_exportado_cae_a_tiempo() {
        let (destino, carpeta) = exportar_prueba(1.0, 0.0);
        let mut lector = hound::WavReader::open(carpeta.join("01 CLICK.wav")).unwrap();
        let muestras: Vec<i32> = lector.samples::<i32>().map(|m| m.unwrap()).collect();
        let primero = muestras.iter().position(|m| m.abs() > 1000).unwrap();
        // Primer tiempo en 2 s y un compás de conteo (2 s a 120 BPM en 4/4): suena desde 0.
        assert!(primero < 50, "el conteo empieza en el cuadro 0, no en {primero}");
        let en_el_uno = muestras[88_200..88_300].iter().any(|m| m.abs() > 1000);
        assert!(en_el_uno, "suena en el primer tiempo (2 s)");
        fs::remove_dir_all(destino).unwrap();
    }

    // Dónde empieza cada golpe (después de al menos 0,1 s de silencio).
    fn golpes(muestras: &[i32], canales: usize, umbral: i32) -> Vec<usize> {
        let mut lista = Vec::new();
        let mut silencio = usize::MAX / 2;
        for (cuadro, muestra) in muestras.chunks(canales).map(|c| c[0]).enumerate() {
            if muestra.abs() > umbral {
                if silencio > 4410 {
                    lista.push(cuadro);
                }
                silencio = 0;
            } else {
                silencio += 1;
            }
        }
        lista
    }

    // Lo más delicado: a 80% y +2 semitonos, la pista (estirada) sigue cayendo junto
    // al click (generado). Las pistas de prueba tienen un golpe cada 0,5 s, como el click.
    #[test]
    fn a_otra_velocidad_la_pista_sigue_junto_al_click() {
        for velocidad in [1.0, 0.8, 1.2] {
            let (destino, carpeta) = exportar_prueba(velocidad, 2.0);
            let leer = |archivo: &str| -> Vec<i32> {
                hound::WavReader::open(carpeta.join(archivo)).unwrap().samples::<i32>().map(|m| m.unwrap()).collect()
            };
            let click = golpes(&leer("01 CLICK.wav"), 1, 200_000);
            let pista = golpes(&leer("02 Bateria.wav"), 2, 200_000);
            // La pista empieza a sonar en el segundo 2 de la canción.
            let desde = (2.0 / velocidad * 44_100.0) as usize;
            // El último golpe puede caer justo en el borde: su click quedaría fuera del archivo.
            let fin = (10.0 / velocidad * 44_100.0) as usize - 441;
            let pista: Vec<usize> = pista.into_iter().filter(|&c| c + 100 >= desde && c < fin).collect();
            assert!(pista.len() >= 10, "a {velocidad}: pocos golpes ({})", pista.len());
            for golpe in &pista {
                let mas_cerca = click.iter().map(|c| c.abs_diff(*golpe)).min().unwrap();
                // 10 ms: el estirador suaviza el ataque, pero no puede correrse un compás.
                assert!(mas_cerca < 441, "a {velocidad}: golpe en {golpe} lejos del click ({mas_cerca} cuadros)");
            }
            fs::remove_dir_all(destino).unwrap();
        }
    }

    #[test]
    fn el_tempo_de_6_8_se_escribe_en_negras() {
        assert_eq!(tempo_rpp(120.0, 6), (60.0, 8));
        assert_eq!(tempo_rpp(72.0, 4), (72.0, 4));
        assert_eq!(tempo_rpp(90.0, 3), (90.0, 4));
    }
}
