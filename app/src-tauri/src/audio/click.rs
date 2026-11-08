// Metrónomo: genera el click desde el BPM y los tiempos del compás. No es audio grabado.
// Cada muestra se calcula directo desde la posición en la canción, sin ir sumando tiempos.
// Por eso no se corre con los minutos y sigue en su lugar después de un salto.
//
// Conteo de entrada: el click empieza a sonar unos compases ANTES del primer tiempo,
// para que el equipo entre a tiempo. Son compases enteros, así que el acento sigue
// cayendo en el 1. Si antes del primer tiempo no hay lugar, suena lo que alcance.

use std::f64::consts::TAU;

const SEGUNDOS_SONIDO: f64 = 0.03;
const CAIDA: f64 = 120.0; // qué tan rápido se apaga cada click
const VOLUMEN: f64 = 0.8;
const HZ_TIEMPO: f64 = 1000.0;
const HZ_ACENTO: f64 = 1600.0; // el primer tiempo de cada compás suena más agudo

#[derive(Clone, Copy)]
pub struct Click {
    cuadros_por_tiempo: f64,
    tiempos_por_compas: u64,
    rate: f64,
    inicio: f64, // cuadro donde cae el primer tiempo de la canción
    desde: f64,  // cuadro donde empieza a sonar: el inicio menos el conteo de entrada
}

impl Click {
    // `bpm` cuenta el pulso del compás: en 6/8 son corcheas, seis por compás.
    // `conteo` son los compases de entrada que suenan antes del primer tiempo.
    pub fn new(bpm: f32, tiempos_por_compas: u32, rate: u32, inicio_segundos: f32, conteo: u32) -> Self {
        let rate = rate as f64;
        let cuadros_por_tiempo = rate * 60.0 / bpm.max(1.0) as f64;
        let tiempos_por_compas = tiempos_por_compas.max(1) as u64;
        let inicio = inicio_segundos.max(0.0) as f64 * rate;
        Self {
            cuadros_por_tiempo,
            tiempos_por_compas,
            rate,
            inicio,
            desde: inicio - (conteo as u64 * tiempos_por_compas) as f64 * cuadros_por_tiempo,
        }
    }

    // Devuelve la muestra del click en un cuadro de la canción (0 = inicio).
    #[cfg(test)]
    pub fn muestra(&self, cuadro: u64) -> f32 {
        self.muestra_en(cuadro as f64, 1.0)
    }

    // Igual, pero a otra velocidad. El click cae donde toca en la canción, y su sonido
    // no se estira: dura lo mismo y suena igual aunque la canción vaya lenta.
    pub fn muestra_en(&self, posicion: f64, velocidad: f64) -> f32 {
        if posicion < self.desde {
            return 0.0;
        }

        // Antes del primer tiempo (en el conteo) `tiempo` es negativo: -4, -3, -2, -1.
        let posicion = posicion - self.inicio;
        let tiempo = (posicion / self.cuadros_por_tiempo).floor();
        let inicio = tiempo * self.cuadros_por_tiempo;
        let segundos = (posicion - inicio) / self.rate / velocidad;
        if segundos >= SEGUNDOS_SONIDO {
            return 0.0;
        }

        let hz = if (tiempo as i64).rem_euclid(self.tiempos_por_compas as i64) == 0 {
            HZ_ACENTO
        } else {
            HZ_TIEMPO
        };
        (VOLUMEN * (TAU * hz * segundos).sin() * (-CAIDA * segundos).exp()) as f32
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // Devuelve los cuadros donde empieza cada click.
    fn inicios(click: &Click, cuadros: u64) -> Vec<u64> {
        let mut encontrados = Vec::new();
        let mut silencio = u64::MAX / 2;
        for cuadro in 0..cuadros {
            if click.muestra(cuadro).abs() > 0.0 {
                if silencio > 100 {
                    encontrados.push(cuadro);
                }
                silencio = 0;
            } else {
                silencio += 1;
            }
        }
        encontrados
    }

    // Un tempo que no da cuadros enteros: si se fuera corriendo, al final se notaría.
    #[test]
    fn no_se_corre_en_cinco_minutos() {
        let (bpm, rate) = (97.3f32, 48000u32);
        let click = Click::new(bpm, 4, rate, 0.0, 0);
        let lista = inicios(&click, 300 * rate as u64);

        assert_eq!(lista.len(), (300.0 * bpm as f64 / 60.0).ceil() as usize);
        for (numero, &cuadro) in lista.iter().enumerate() {
            let ideal = numero as f64 * 60.0 / bpm as f64 * rate as f64;
            assert!((cuadro as f64 - ideal).abs() <= 2.0, "click {numero}");
        }
    }

    // Antes del inicio no suena nada, y el primer tiempo cae exacto en el inicio.
    #[test]
    fn empieza_en_el_punto_elegido() {
        let click = Click::new(120.0, 4, 48000, 1.5, 0);
        let lista = inicios(&click, 48000 * 5);

        assert_eq!(lista[0].abs_diff(72000), 1);
        assert!(es_acento(&click, lista[0]));
        assert_eq!(lista.len(), 7);
    }

    // Cuenta cruces por cero para saber qué tan agudo suena cada click.
    fn es_acento(click: &Click, inicio: u64) -> bool {
        let muestras: Vec<f32> = (inicio..inicio + 1000).map(|c| click.muestra(c)).collect();
        let cruces = muestras.windows(2).filter(|p| p[0] * p[1] < 0.0).count();
        cruces > 50
    }

    #[test]
    fn acentua_el_primer_tiempo_de_cada_compas() {
        for tiempos in [4u32, 3, 6, 12] {
            let click = Click::new(120.0, tiempos, 48000, 0.0, 0);
            let lista = inicios(&click, 48000 * 20);
            for (numero, &cuadro) in lista.iter().enumerate() {
                let esperado = numero as u32 % tiempos == 0;
                assert_eq!(es_acento(&click, cuadro), esperado, "compás de {tiempos}");
            }
        }
    }

    // Con 1 compás de conteo en 3/4 a 120 BPM y el primer tiempo en 2 s, el click
    // empieza 1,5 s antes (en 0,5 s), acentúa su 1 y sigue igual después.
    #[test]
    fn suena_el_conteo_antes_del_primer_tiempo() {
        let rate = 48000u32;
        let click = Click::new(120.0, 3, rate, 2.0, 1);
        let lista = inicios(&click, rate as u64 * 4);

        assert_eq!(lista[0].abs_diff(24000), 1, "empieza 1 compás antes");
        assert_eq!(lista.len(), 7, "3 del conteo y 4 de la canción");
        for (numero, &cuadro) in lista.iter().enumerate() {
            assert_eq!(es_acento(&click, cuadro), numero % 3 == 0, "tiempo {numero}");
        }
    }

    // Si no hay lugar para el conteo completo, suena lo que alcance desde el 0.
    #[test]
    fn el_conteo_se_corta_si_no_hay_lugar() {
        let rate = 48000u32;
        let click = Click::new(120.0, 4, rate, 0.5, 2);
        let lista = inicios(&click, rate as u64);

        assert!(lista[0] <= 1, "el tiempo que cae justo en el 0 suena");
        assert_eq!(lista[1].abs_diff(24000), 1);
        assert!(es_acento(&click, lista[1]), "el primer tiempo sigue acentuado");
    }
}
