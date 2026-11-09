// Voz guía: hace sonar frases cortas ("Coro", "2", "3", "4") en segundos exactos
// de la canción.
//
// - `Banco`: las frases grabadas (`recursos/voz/*.wav`, 22 050 Hz, mono). Se leen
//   UNA vez al abrir la app y quedan en memoria (1,3 MB en total).
// - `Guia`: qué frase suena y en qué segundo. La arma la interfaz
//   (`src/lib/guia.ts`) y se la pasa al motor con la orden `guia`.
//
// Como el click, cada muestra se calcula desde la posición en la canción: no se
// corre con los minutos y sigue en su lugar después de un salto. A otra velocidad
// la frase cae donde toca en la canción, pero su sonido no se estira ni cambia de
// tono: "Coro" se oye igual a 75% que a 100%.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Frecuencia de las frases grabadas con Piper.
const RATE_FRASES: f64 = 22_050.0;
/// Por debajo de esto se considera silencio al recortar los extremos.
const UMBRAL_SILENCIO: f32 = 400.0 / 32_768.0;
const VOLUMEN: f32 = 0.9;
const MAX_BYTES: usize = 4 * 1024 * 1024;
const MAX_SEGUNDOS: u32 = 10;

/// Las frases disponibles, por nombre ("Coro 1", "2", "Última vez").
#[derive(Default)]
pub struct Banco {
    nombres: HashMap<String, usize>,
    clips: Vec<Vec<f32>>,
    originales: HashSet<String>,
    propias: HashSet<String>,
}

impl Banco {
    /// Lee todos los WAV de la carpeta. El nombre de la frase es el del archivo.
    pub fn cargar(carpeta: &Path) -> Result<Self, String> {
        let mut banco = Banco::default();
        let archivos = fs::read_dir(carpeta)
            .map_err(|e| format!("No se encontraron las frases de la voz guía: {e}"))?;
        for archivo in archivos.flatten() {
            let ruta = archivo.path();
            if ruta.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }
            let Some(nombre) = ruta.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let clip = leer_recortado(&ruta)?;
            banco.originales.insert(nombre.to_owned());
            banco.poner(nombre, clip);
        }
        Ok(banco)
    }

    fn poner(&mut self, nombre: &str, clip: Vec<f32>) {
        if let Some(&indice) = self.nombres.get(nombre) {
            self.clips[indice] = clip;
        } else {
            self.nombres.insert(nombre.to_owned(), self.clips.len());
            self.clips.push(clip);
        }
    }

    pub fn cargar_propias(&mut self, carpeta: &Path) {
        let Ok(archivos) = fs::read_dir(carpeta) else { return };
        for archivo in archivos.flatten() {
            let ruta = archivo.path();
            if ruta.extension().and_then(|e| e.to_str()) != Some("wav") {
                continue;
            }
            let Some(nombre) = ruta.file_stem().and_then(|s| s.to_str()).and_then(decodificar_nombre) else {
                continue;
            };
            match leer_propia(&ruta) {
                Ok(clip) => {
                    self.poner(&nombre, clip);
                    self.propias.insert(nombre);
                }
                Err(error) => eprintln!("No se pudo cargar la frase {nombre}: {error}"),
            }
        }
    }

    pub fn restaurables(&self) -> Vec<String> {
        self.originales.intersection(&self.propias).cloned().collect()
    }

    pub fn guardar_propia(&mut self, carpeta: &Path, nombre: &str, wav: &[u8]) -> Result<(), String> {
        let ruta = ruta_propia(carpeta, nombre)?;
        if !self.propias.contains(nombre) && self.propias.len() >= 100 {
            return Err("Ya tienes 100 frases propias.".into());
        }
        let clip = preparar_wav(wav)?;
        fs::create_dir_all(carpeta).map_err(error_guardado)?;
        let temporal = ruta.with_extension("tmp");
        fs::write(&temporal, wav).map_err(error_guardado)?;
        fs::rename(&temporal, &ruta).map_err(error_guardado)?;
        self.poner(nombre, clip);
        self.propias.insert(nombre.to_owned());
        Ok(())
    }

    pub fn restaurar(&mut self, carpeta: &Path, originales: &Path, nombre: &str) -> Result<(), String> {
        let ruta = ruta_propia(carpeta, nombre)?;
        if !self.originales.contains(nombre) || !self.propias.contains(nombre) {
            return Err("Esta frase no tiene una versión original para restaurar.".into());
        }
        let clip = leer_recortado(&originales.join(format!("{nombre}.wav")))?;
        fs::remove_file(ruta).map_err(error_guardado)?;
        self.poner(nombre, clip);
        self.propias.remove(nombre);
        Ok(())
    }

    /// Las frases (nombre y segundos que dura), en orden alfabético.
    pub fn frases(&self) -> Vec<(String, f64)> {
        let mut frases: Vec<(String, f64)> = self
            .nombres
            .iter()
            .map(|(nombre, &i)| (nombre.clone(), self.clips[i].len() as f64 / RATE_FRASES))
            .collect();
        frases.sort_by(|a, b| a.0.cmp(&b.0));
        frases
    }

    #[cfg(test)]
    fn de_prueba(frases: &[(&str, Vec<f32>)]) -> Self {
        let mut banco = Banco::default();
        for (nombre, clip) in frases {
            banco.nombres.insert(nombre.to_string(), banco.clips.len());
            banco.clips.push(clip.clone());
        }
        banco
    }
}

fn error_guardado(error: std::io::Error) -> String {
    format!("No se pudo guardar el cambio de voz guía: {error}")
}

// El nombre visible se codifica para que la ruta sea válida incluso con
// acentos y nombres reservados de Windows, y para distinguir mayúsculas.
fn ruta_propia(carpeta: &Path, nombre: &str) -> Result<PathBuf, String> {
    if nombre.is_empty() || nombre.len() > 100 || nombre.trim() != nombre || nombre.chars().any(char::is_control) {
        return Err("Escribe un nombre de frase válido de hasta 100 bytes.".into());
    }
    let codigo: String = nombre.bytes().map(|b| format!("{b:02x}")).collect();
    Ok(carpeta.join(format!("{codigo}.wav")))
}

fn decodificar_nombre(codigo: &str) -> Option<String> {
    if codigo.len() % 2 != 0 || !codigo.is_ascii() {
        return None;
    }
    let bytes = (0..codigo.len()).step_by(2)
        .map(|i| u8::from_str_radix(&codigo[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>().ok()?;
    String::from_utf8(bytes).ok()
}

fn leer_propia(ruta: &Path) -> Result<Vec<f32>, String> {
    if fs::metadata(ruta).map_err(error_guardado)?.len() > MAX_BYTES as u64 {
        return Err("El WAV debe pesar como máximo 4 MB.".into());
    }
    preparar_wav(&fs::read(ruta).map_err(error_guardado)?)
}

fn preparar_wav(wav: &[u8]) -> Result<Vec<f32>, String> {
    if wav.len() > MAX_BYTES {
        return Err("El WAV debe pesar como máximo 4 MB.".into());
    }
    let invalido = |e| format!("No se pudo leer el WAV: {e}");
    let mut lector = hound::WavReader::new(Cursor::new(wav)).map_err(invalido)?;
    let spec = lector.spec();
    if !(1..=2).contains(&spec.channels) || !(8_000..=192_000).contains(&spec.sample_rate) {
        return Err("Usa un WAV mono o estéreo entre 8 y 192 kHz.".into());
    }
    if lector.duration() > spec.sample_rate * MAX_SEGUNDOS {
        return Err("La frase debe durar como máximo 10 segundos.".into());
    }
    let muestras = match spec.sample_format {
        hound::SampleFormat::Int => {
            let escala = 2_f32.powi(i32::from(spec.bits_per_sample) - 1);
            lector.samples::<i32>().map(|m| m.map(|m| m as f32 / escala)).collect::<Result<Vec<_>, _>>()
        }
        hound::SampleFormat::Float => lector.samples::<f32>().collect::<Result<Vec<_>, _>>(),
    }.map_err(invalido)?;
    let canales = usize::from(spec.channels);
    let mono: Vec<_> = muestras.chunks_exact(canales).map(|cuadro| {
        cuadro.iter().copied().filter(|m| m.is_finite()).sum::<f32>() / canales as f32
    }).collect();
    let paso = f64::from(spec.sample_rate) / RATE_FRASES;
    let total = (mono.len() as f64 / paso).floor() as usize;
    let convertido: Vec<_> = (0..total)
        .map(|i| muestra_interpolada(&mono, i as f64 * paso).clamp(-1.0, 1.0))
        .collect();
    let clip = recortar(&convertido);
    if clip.len() < 2 {
        return Err("No se detectó audio en la frase. Prueba una grabación más fuerte.".into());
    }
    Ok(clip)
}

/// Lee un WAV de 16 bits mono y le quita el silencio de los extremos: la frase
/// tiene que empezar justo en el tiempo, no unos milisegundos después.
fn leer_recortado(ruta: &Path) -> Result<Vec<f32>, String> {
    let mut lector = hound::WavReader::open(ruta).map_err(|e| format!("No se pudo leer {ruta:?}: {e}"))?;
    let muestras: Vec<f32> = lector
        .samples::<i16>()
        .map(|m| m.map(|m| m as f32 / 32_768.0))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("No se pudo leer {ruta:?}: {e}"))?;
    Ok(recortar(&muestras))
}

fn recortar(muestras: &[f32]) -> Vec<f32> {
    let inicio = muestras.iter().position(|m| m.abs() > UMBRAL_SILENCIO).unwrap_or(0);
    let fin = muestras.iter().rposition(|m| m.abs() > UMBRAL_SILENCIO).map_or(inicio, |i| i + 1);
    muestras[inicio..fin].to_vec()
}

/// Qué frases suenan y cuándo, listo para sonar.
#[derive(Default)]
pub struct Guia {
    /// (segundo de la canción, índice de la frase en `clips`), ordenados.
    eventos: Vec<(f64, usize)>,
    clips: Vec<Vec<f32>>,
    /// Lo más largo que dura una frase, en segundos: hasta ahí atrás se busca.
    mayor: f64,
}

impl Guia {
    /// Arma la guía con los avisos `(segundo, frase)`. Las frases que no están en
    /// el banco se saltan (la interfaz ya elige solo las que existen).
    pub fn new(banco: &Banco, avisos: &[(f64, String)]) -> Self {
        let mut usadas: HashMap<usize, usize> = HashMap::new();
        let mut clips = Vec::new();
        let mut eventos = Vec::new();
        for (segundo, frase) in avisos {
            let Some(&original) = banco.nombres.get(frase) else {
                continue;
            };
            // Cada frase se copia una sola vez aunque se use muchas veces.
            let indice = *usadas.entry(original).or_insert_with(|| {
                clips.push(banco.clips[original].clone());
                clips.len() - 1
            });
            eventos.push((*segundo, indice));
        }
        eventos.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mayor = clips.iter().map(|c| c.len() as f64 / RATE_FRASES).fold(0.0, f64::max);
        Self { eventos, clips, mayor }
    }

    /// La muestra de la guía en `posicion` (cuadros de la canción a `rate`).
    /// `velocidad`: la de estudio; la frase dura lo mismo aunque la canción vaya lenta.
    pub fn muestra_en(&self, posicion: f64, rate: u32, velocidad: f64) -> f32 {
        if self.eventos.is_empty() {
            return 0.0;
        }
        let segundo = posicion / rate as f64;
        // Primer evento que todavía no empieza; se mira hacia atrás los que siguen sonando.
        let hasta = self.eventos.partition_point(|(inicio, _)| *inicio <= segundo);
        let mut suma = 0.0;
        for &(inicio, clip) in self.eventos[..hasta].iter().rev() {
            // Lo que lleva sonando la frase, en segundos reales (sin estirar).
            let dentro = (segundo - inicio) / velocidad;
            if dentro > self.mayor {
                break;
            }
            suma += muestra_interpolada(&self.clips[clip], dentro * RATE_FRASES);
        }
        suma * VOLUMEN
    }
}

/// La frase está a 22 050 Hz y la salida suele ir a 48 000: se toma el punto
/// intermedio entre dos muestras. Para una voz hablada alcanza y sobra.
fn muestra_interpolada(clip: &[f32], indice: f64) -> f32 {
    let i = indice.floor() as usize;
    if i + 1 >= clip.len() {
        return 0.0;
    }
    let fraccion = (indice - i as f64) as f32;
    clip[i] * (1.0 - fraccion) + clip[i + 1] * fraccion
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // Una "frase" de prueba: 0,1 s de un valor fijo, fácil de reconocer.
    fn banco() -> Banco {
        Banco::de_prueba(&[("Coro", vec![0.5; 2205]), ("2", vec![0.25; 2205])])
    }

    #[test]
    fn suena_en_el_segundo_indicado_y_nada_antes() {
        let guia = Guia::new(&banco(), &[(2.0, "Coro".into()), (2.5, "2".into())]);
        let rate = 48_000;
        assert_eq!(guia.muestra_en(1.99 * rate as f64, rate, 1.0), 0.0);
        assert!((guia.muestra_en(2.01 * rate as f64, rate, 1.0) - 0.5 * VOLUMEN).abs() < 1e-4);
        // Entre las dos frases (la primera dura 0,1 s), silencio.
        assert_eq!(guia.muestra_en(2.3 * rate as f64, rate, 1.0), 0.0);
        assert!((guia.muestra_en(2.55 * rate as f64, rate, 1.0) - 0.25 * VOLUMEN).abs() < 1e-4);
    }

    #[test]
    fn a_otra_velocidad_cae_igual_y_dura_lo_mismo() {
        let guia = Guia::new(&banco(), &[(2.0, "Coro".into())]);
        let rate = 48_000;
        // A 50%, la canción avanza la mitad: 0,08 s reales de frase son 0,04 s de canción.
        assert!(guia.muestra_en(2.04 * rate as f64, rate, 0.5) > 0.0);
        // A los 0,06 s de canción ya pasaron 0,12 s reales: la frase (0,1 s) terminó.
        assert_eq!(guia.muestra_en(2.06 * rate as f64, rate, 0.5), 0.0);
    }

    #[test]
    fn salta_las_frases_que_no_existen() {
        let guia = Guia::new(&banco(), &[(1.0, "Coro 7".into()), (2.0, "Coro".into())]);
        assert_eq!(guia.eventos.len(), 1);
    }

    #[test]
    fn carga_las_frases_de_la_app() {
        let carpeta = Path::new(env!("CARGO_MANIFEST_DIR")).join("recursos/voz");
        let banco = Banco::cargar(&carpeta).unwrap();
        assert_eq!(banco.frases().len(), 34);
        for frase in ["Coro 1", "Pre-coro", "Última vez", "4"] {
            let clip = &banco.clips[banco.nombres[frase]];
            // Recortada: empieza con voz y dura menos de 2 segundos.
            assert!(clip[0].abs() > UMBRAL_SILENCIO, "{frase}");
            assert!((clip.len() as f64 / RATE_FRASES) < 2.0, "{frase}");
        }
    }

    #[test]
    fn reemplaza_recarga_y_restaura_una_frase() {
        let originales = Path::new(env!("CARGO_MANIFEST_DIR")).join("recursos/voz");
        let sello = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let carpeta = std::env::temp_dir().join(format!("desglose-guia-{}-{sello}", std::process::id()));
        let mut bytes = Cursor::new(Vec::new());
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut wav = hound::WavWriter::new(&mut bytes, spec).unwrap();
        for _ in 0..4_800 {
            wav.write_sample(8_192_i16).unwrap();
            wav.write_sample(24_576_i16).unwrap();
        }
        wav.finalize().unwrap();
        let mut banco = Banco::cargar(&originales).unwrap();
        let duracion_original = banco.frases().into_iter().find(|(n, _)| n == "Coro").unwrap().1;
        banco.guardar_propia(&carpeta, "Coro", bytes.get_ref()).unwrap();
        banco.guardar_propia(&carpeta, "Coro", bytes.get_ref()).unwrap();
        banco.guardar_propia(&carpeta, "Sólo teclado", bytes.get_ref()).unwrap();
        assert!(banco.guardar_propia(&carpeta, "Coro", b"wav invalido").is_err());

        let mut recargado = Banco::cargar(&originales).unwrap();
        recargado.cargar_propias(&carpeta);
        let guia = Guia::new(&recargado, &[(1.0, "Coro".into()), (2.0, "Sólo teclado".into())]);
        assert!((guia.muestra_en(50_400.0, 48_000, 1.0) - 0.5 * VOLUMEN).abs() < 1e-5);
        assert!((guia.muestra_en(98_400.0, 48_000, 1.0) - 0.5 * VOLUMEN).abs() < 1e-5);
        assert_eq!(recargado.restaurables(), ["Coro"]);
        recargado.restaurar(&carpeta, &originales, "Coro").unwrap();
        assert!(recargado.restaurables().is_empty());
        assert_eq!(recargado.frases().into_iter().find(|(n, _)| n == "Coro").unwrap().1, duracion_original);
        fs::remove_file(ruta_propia(&carpeta, "Sólo teclado").unwrap()).unwrap();
        fs::remove_dir(carpeta).unwrap();
    }
}
