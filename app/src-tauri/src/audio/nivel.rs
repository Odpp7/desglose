// ¿Esta pista suena de verdad o está casi vacía?
//
// MVSep siempre devuelve las 10 pistas, aunque la canción no tenga piano o synth:
// en ese caso la pista es silencio con algún ruido suelto. Aquí se mide segundo
// a segundo cuánto suena, y si casi ningún segundo pasa el umbral, la pista se
// marca como vacía para ocultarla (el encargado puede volver a mostrarla).

use std::path::Path;

use super::track;

/// Un segundo "suena" si su nivel promedio (RMS) pasa de -40 dB.
const UMBRAL: f64 = 0.01; // 10^(-40/20)

/// La pista está vacía si suena menos del 2% de sus segundos
/// (en 5 minutos: menos de 6 segundos con sonido).
const PROPORCION_MINIMA: f64 = 0.02;

/// Fracción de segundos con sonido, de 0 a 1.
pub fn proporcion_con_sonido(ruta: &Path) -> Result<f64, String> {
    let lector = track::abrir(ruta)?;
    let cuadros_por_ventana = lector.rate() as usize;

    let mut suma = 0.0f64;
    let mut cuadros = 0usize;
    let mut ventanas = 0usize;
    let mut con_sonido = 0usize;

    lector.recorrer(|muestras, canales| {
        for cuadro in muestras.chunks_exact(canales) {
            let energia: f32 = cuadro.iter().map(|m| m * m).sum::<f32>() / canales as f32;
            suma += energia as f64;
            cuadros += 1;
            if cuadros == cuadros_por_ventana {
                ventanas += 1;
                if (suma / cuadros as f64).sqrt() > UMBRAL {
                    con_sonido += 1;
                }
                suma = 0.0;
                cuadros = 0;
            }
        }
    });

    if ventanas == 0 {
        return Ok(0.0);
    }
    Ok(con_sonido as f64 / ventanas as f64)
}

pub fn esta_vacia(ruta: &Path) -> Result<bool, String> {
    Ok(proporcion_con_sonido(ruta)? < PROPORCION_MINIMA)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::path::PathBuf;

    fn pista(nombre: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../samples/cancion2/mvsep/final")
            .join(format!("{nombre}.flac"))
    }

    // Muestra cuánto suena cada pista de la canción de prueba: sirve para ajustar el umbral.
    // cargo test nivel -- --nocapture
    #[test]
    fn las_pistas_principales_suenan() {
        for nombre in [
            "voz-lider",
            "coros",
            "bateria",
            "bajo",
            "piano",
            "guitarra-acustica",
            "guitarra-lead",
            "guitarra-ritmica",
            "synth",
            "otros",
        ] {
            let p = proporcion_con_sonido(&pista(nombre)).unwrap();
            println!("{nombre:>18}: suena {:.0}% de los segundos", p * 100.0);
        }
        // En esta canción la voz, los coros y el piano suenan casi todo el tiempo,
        // y "otros" es solo residuo (1%): debe quedar oculta.
        for nombre in ["voz-lider", "coros", "piano"] {
            assert!(
                !esta_vacia(&pista(nombre)).unwrap(),
                "{nombre} no debería estar vacía"
            );
        }
        assert!(
            esta_vacia(&pista("otros")).unwrap(),
            "otros debería estar vacía"
        );
    }
}
