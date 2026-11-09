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

use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Frecuencia de las frases grabadas con Piper.
const RATE_FRASES: f64 = 22_050.0;
/// Por debajo de esto se considera silencio al recortar los extremos.
const UMBRAL_SILENCIO: f32 = 400.0 / 32_768.0;
const VOLUMEN: f32 = 0.9;

/// Las frases disponibles, por nombre ("Coro 1", "2", "Última vez").
#[derive(Default)]
pub struct Banco {
    nombres: HashMap<String, usize>,
    clips: Vec<Vec<f32>>,
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
            banco.nombres.insert(nombre.to_string(), banco.clips.len());
            banco.clips.push(clip);
        }
        Ok(banco)
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

/// Lee un WAV de 16 bits mono y le quita el silencio de los extremos: la frase
/// tiene que empezar justo en el tiempo, no unos milisegundos después.
fn leer_recortado(ruta: &Path) -> Result<Vec<f32>, String> {
    let mut lector = hound::WavReader::open(ruta).map_err(|e| format!("No se pudo leer {ruta:?}: {e}"))?;
    let muestras: Vec<f32> = lector
        .samples::<i16>()
        .map(|m| m.map(|m| m as f32 / 32_768.0))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("No se pudo leer {ruta:?}: {e}"))?;
    let inicio = muestras.iter().position(|m| m.abs() > UMBRAL_SILENCIO).unwrap_or(0);
    let fin = muestras.iter().rposition(|m| m.abs() > UMBRAL_SILENCIO).map_or(inicio, |i| i + 1);
    Ok(muestras[inicio..fin].to_vec())
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
}
