// La forma de onda de cada pista, para dibujarla en el editor.
//
// Se calcula UNA sola vez por pista y se guarda al lado del audio:
//   pistas\voz-lider.flac  →  pistas\voz-lider.ondas
// Son 100 "picos" por segundo, un byte cada uno (0 = silencio, 255 = al máximo):
// una canción de 5 minutos ocupa 30 KB por pista. La interfaz los recibe como
// bytes, sin convertirlos a texto, y los dibuja en un canvas.
// Así la PC de la iglesia no vuelve a leer el audio completo cada vez que abre el editor.

use std::fs;
use std::path::{Path, PathBuf};

use super::track;

pub const PICOS_POR_SEGUNDO: u32 = 100;

/// Los picos de una pista: del archivo `.ondas` si ya existe y es más nuevo que
/// el audio; si no, los calcula y los guarda.
pub fn picos(audio: &Path) -> Result<Vec<u8>, String> {
    let guardado = ruta_ondas(audio);
    if es_mas_nuevo(&guardado, audio) {
        if let Ok(bytes) = fs::read(&guardado) {
            return Ok(bytes);
        }
    }
    let bytes = calcular(audio)?;
    // Si no se puede guardar, igual se devuelven: solo se calculará otra vez la próxima.
    let _ = fs::write(&guardado, &bytes);
    Ok(bytes)
}

fn ruta_ondas(audio: &Path) -> PathBuf {
    audio.with_extension("ondas")
}

/// ¿`a` existe y se modificó después de `b`?
fn es_mas_nuevo(a: &Path, b: &Path) -> bool {
    let fecha = |r: &Path| fs::metadata(r).and_then(|m| m.modified()).ok();
    matches!((fecha(a), fecha(b)), (Some(fa), Some(fb)) if fa >= fb)
}

/// Lee la pista completa y guarda, por cada centésima de segundo, el valor más
/// alto (en cualquiera de los dos canales).
fn calcular(audio: &Path) -> Result<Vec<u8>, String> {
    let lector = track::abrir(audio)?;
    let cuadros_por_pico = (lector.rate() / PICOS_POR_SEGUNDO).max(1) as usize;

    let mut picos = Vec::new();
    let mut maximo = 0.0f32;
    let mut cuadros = 0usize;

    lector.recorrer(|muestras, canales| {
        for cuadro in muestras.chunks_exact(canales) {
            for muestra in cuadro {
                maximo = maximo.max(muestra.abs());
            }
            cuadros += 1;
            if cuadros == cuadros_por_pico {
                picos.push((maximo.min(1.0) * 255.0).round() as u8);
                maximo = 0.0;
                cuadros = 0;
            }
        }
    });
    if cuadros > 0 {
        picos.push((maximo.min(1.0) * 255.0).round() as u8);
    }
    Ok(picos)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cien_picos_por_segundo_y_marca_los_clicks() {
        // La pista sintética dura 5 minutos y tiene un click corto cada medio segundo.
        let ruta =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples/sinteticas/pista1.flac");
        let picos = calcular(&ruta).unwrap();
        assert_eq!(picos.len(), 300 * PICOS_POR_SEGUNDO as usize);
        // Cada click cae al inicio de su medio segundo: ahí hay pico, y a mitad no.
        assert!(picos[0] > 10, "en el click debe haber pico: {}", picos[0]);
        assert!(picos[25] < 3, "entre clicks casi silencio: {}", picos[25]);
        assert!(picos[50] > 10, "el siguiente click: {}", picos[50]);
    }
}
