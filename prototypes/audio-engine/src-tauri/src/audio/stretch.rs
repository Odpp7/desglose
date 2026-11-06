// Velocidad y tono para estudiar: cambia la duración sin cambiar el tono, o al revés.
// Solo se usa cuando hace falta; a velocidad y tono normales el audio no pasa por aquí.

use signalsmith_stretch::Stretch;

pub struct Estirador {
    stretch: Stretch,
    semitonos: f32,
    pub entrada: Vec<f32>, // estéreo intercalado, igual que las colas
    pub salida: Vec<f32>,
}

impl Estirador {
    pub fn new(rate: u32) -> Self {
        Self {
            stretch: Stretch::preset_default(2, rate),
            semitonos: 0.0,
            entrada: Vec::new(),
            salida: Vec::new(),
        }
    }

    pub fn reiniciar(&mut self) {
        self.stretch.reset();
    }

    pub fn ajustar_tono(&mut self, semitonos: f32) {
        if semitonos != self.semitonos {
            self.semitonos = semitonos;
            self.stretch.set_transpose_factor_semitones(semitonos, None);
        }
    }

    // Cuadros de la canción que van de retraso entre lo que entra y lo que se oye.
    pub fn latencia(&self, velocidad: f64) -> f64 {
        self.stretch.input_latency() as f64 + self.stretch.output_latency() as f64 * velocidad
    }

    // Convierte `entrada` en `cuadros` de salida. La relación entre ambos da la velocidad.
    pub fn estirar(&mut self, cuadros: usize) {
        self.salida.resize(cuadros * 2, 0.0);
        self.stretch.process(&self.entrada, &mut self.salida);
    }
}
