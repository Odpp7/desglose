// Metrónomo: genera el click desde el BPM y los tiempos del compás. No es audio grabado.
// Cada muestra se calcula directo desde la posición en la canción, sin ir sumando tiempos.
// Por eso no se corre con los minutos y sigue en su lugar después de un salto.

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
}

impl Click {
    // `bpm` cuenta el pulso del compás: en 6/8 son corcheas, seis por compás.
    pub fn new(bpm: f32, tiempos_por_compas: u32, rate: u32) -> Self {
        let rate = rate as f64;
        Self {
            cuadros_por_tiempo: rate * 60.0 / bpm.max(1.0) as f64,
            tiempos_por_compas: tiempos_por_compas.max(1) as u64,
            rate,
        }
    }

    // Devuelve la muestra del click en un cuadro de la canción (0 = inicio).
    pub fn muestra(&self, cuadro: u64) -> f32 {
        let tiempo = (cuadro as f64 / self.cuadros_por_tiempo).floor();
        let inicio = tiempo * self.cuadros_por_tiempo;
        let segundos = (cuadro as f64 - inicio) / self.rate;
        if segundos >= SEGUNDOS_SONIDO {
            return 0.0;
        }

        let hz = if tiempo as u64 % self.tiempos_por_compas == 0 {
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
        let click = Click::new(bpm, 4, rate);
        let lista = inicios(&click, 300 * rate as u64);

        assert_eq!(lista.len(), (300.0 * bpm as f64 / 60.0).ceil() as usize);
        for (numero, &cuadro) in lista.iter().enumerate() {
            let ideal = numero as f64 * 60.0 / bpm as f64 * rate as f64;
            assert!((cuadro as f64 - ideal).abs() <= 2.0, "click {numero}");
        }
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
            let click = Click::new(120.0, tiempos, 48000);
            let lista = inicios(&click, 48000 * 20);
            for (numero, &cuadro) in lista.iter().enumerate() {
                let esperado = numero as u32 % tiempos == 0;
                assert_eq!(es_acento(&click, cuadro), esperado, "compás de {tiempos}");
            }
        }
    }
}
