// Escribe un proyecto de REAPER (.RPP). Es texto plano, así que no hace falta ninguna librería.
// Las rutas de los WAV son relativas: el proyecto va en la misma carpeta que ellos.

use std::fmt::Write;

pub struct Pista {
    pub nombre: String,
    pub archivo: String,
    pub duracion: f64,
}

// Cada sección se vuelve una región de REAPER.
pub struct Seccion {
    pub nombre: String,
    pub inicio: f64,
    pub fin: f64,
}

// Un punto del mapa de tempo: desde `inicio` (segundos) rigen este BPM y este compás.
pub struct Tempo {
    pub inicio: f64,
    pub bpm: f64,
    pub tiempos: u32,
    pub figura: u32,
}

pub struct Proyecto {
    pub rate: u32,
    pub tempos: Vec<Tempo>, // el primero debe empezar en 0
    pub secciones: Vec<Seccion>,
    pub pistas: Vec<Pista>,
}

// REAPER acepta tres tipos de comillas; se usa una que no aparezca en el texto.
fn citar(texto: &str) -> String {
    for comilla in ['"', '\'', '`'] {
        if !texto.contains(comilla) {
            return format!("{comilla}{texto}{comilla}");
        }
    }
    format!("\"{}\"", texto.replace('"', "'"))
}

pub fn escribir(proyecto: &Proyecto) -> String {
    let inicial = &proyecto.tempos[0];
    let mut rpp = String::new();

    writeln!(rpp, "<REAPER_PROJECT 0.1 \"7.0/x64\" 0").unwrap();
    writeln!(rpp, "  SAMPLERATE {} 0 0", proyecto.rate).unwrap();
    writeln!(
        rpp,
        "  TEMPO {} {} {}",
        inicial.bpm, inicial.tiempos, inicial.figura
    )
    .unwrap();

    // Una región son dos líneas con el mismo número: la del inicio y la del fin.
    for (indice, seccion) in proyecto.secciones.iter().enumerate() {
        let numero = indice + 1;
        let nombre = citar(&seccion.nombre);
        writeln!(rpp, "  MARKER {numero} {} {nombre} 1", seccion.inicio).unwrap();
        writeln!(rpp, "  MARKER {numero} {} \"\" 1", seccion.fin).unwrap();
    }

    // Con un solo tempo basta la línea TEMPO; los cambios van en su propia envolvente.
    if proyecto.tempos.len() > 1 {
        writeln!(rpp, "  <TEMPOENVEX").unwrap();
        writeln!(rpp, "    ACT 1 -1").unwrap();
        writeln!(rpp, "    VIS 1 0 1").unwrap();
        writeln!(rpp, "    DEFSHAPE 1 -1 -1").unwrap();
        for tempo in &proyecto.tempos {
            // El compás va en un solo número: tiempos abajo, figura arriba.
            let compas = tempo.tiempos + (tempo.figura << 16);
            writeln!(rpp, "    PT {} {} 1 {compas} 0 1", tempo.inicio, tempo.bpm).unwrap();
        }
        writeln!(rpp, "  >").unwrap();
    }

    for pista in &proyecto.pistas {
        writeln!(rpp, "  <TRACK").unwrap();
        writeln!(rpp, "    NAME {}", citar(&pista.nombre)).unwrap();
        writeln!(rpp, "    <ITEM").unwrap();
        writeln!(rpp, "      POSITION 0").unwrap();
        writeln!(rpp, "      LENGTH {}", pista.duracion).unwrap();
        writeln!(rpp, "      NAME {}", citar(&pista.archivo)).unwrap();
        writeln!(rpp, "      <SOURCE WAVE").unwrap();
        writeln!(rpp, "        FILE {}", citar(&pista.archivo)).unwrap();
        writeln!(rpp, "      >").unwrap();
        writeln!(rpp, "    >").unwrap();
        writeln!(rpp, "  >").unwrap();
    }

    writeln!(rpp, ">").unwrap();
    rpp
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn proyecto(tempos: Vec<Tempo>) -> Proyecto {
        Proyecto {
            rate: 44100,
            tempos,
            secciones: vec![
                Seccion { nombre: "Intro".into(), inicio: 0.0, fin: 16.0 },
                Seccion { nombre: "Coro 1".into(), inicio: 16.0, fin: 48.5 },
            ],
            pistas: vec![Pista {
                nombre: "CLICK".into(),
                archivo: "01 CLICK.wav".into(),
                duracion: 300.0,
            }],
        }
    }

    fn tempo(inicio: f64, bpm: f64, tiempos: u32, figura: u32) -> Tempo {
        Tempo { inicio, bpm, tiempos, figura }
    }

    #[test]
    fn escribe_tempo_regiones_y_pistas() {
        let rpp = escribir(&proyecto(vec![tempo(0.0, 72.5, 4, 4)]));

        assert!(rpp.contains("TEMPO 72.5 4 4\n"));
        assert!(rpp.contains("MARKER 1 0 \"Intro\" 1\n"));
        assert!(rpp.contains("MARKER 1 16 \"\" 1\n"));
        assert!(rpp.contains("MARKER 2 16 \"Coro 1\" 1\n"));
        assert!(rpp.contains("MARKER 2 48.5 \"\" 1\n"));
        assert!(rpp.contains("NAME \"CLICK\"\n"));
        assert!(rpp.contains("FILE \"01 CLICK.wav\"\n"));
        assert!(!rpp.contains("TEMPOENVEX"));
    }

    #[test]
    fn los_cambios_de_tempo_van_en_la_envolvente() {
        let rpp = escribir(&proyecto(vec![tempo(0.0, 120.0, 4, 4), tempo(160.0, 90.0, 3, 4)]));

        assert!(rpp.contains("TEMPO 120 4 4\n"));
        assert!(rpp.contains("PT 0 120 1 262148 0 1\n"));
        assert!(rpp.contains("PT 160 90 1 262147 0 1\n"));
    }

    // Cada bloque abierto con < debe cerrarse con >.
    #[test]
    fn los_bloques_quedan_cerrados() {
        let rpp = escribir(&proyecto(vec![tempo(0.0, 120.0, 4, 4), tempo(160.0, 90.0, 3, 4)]));

        let abiertos = rpp.lines().filter(|l| l.trim_start().starts_with('<')).count();
        let cerrados = rpp.lines().filter(|l| l.trim() == ">").count();
        assert_eq!(abiertos, cerrados);
    }

    #[test]
    fn usa_otra_comilla_si_el_nombre_trae_comillas() {
        assert_eq!(citar("Coro"), "\"Coro\"");
        assert_eq!(citar("El \"Gran\" Yo Soy"), "'El \"Gran\" Yo Soy'");
    }
}
