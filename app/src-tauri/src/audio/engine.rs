// Salida de audio: Windows pide sonido cientos de veces por segundo y aquí se mezclan las pistas.
// Esa función nunca lee del disco ni espera a nadie; si se demora, se oye un corte.
//
// Reloj único: en cada cuadro se saca exactamente una muestra de cada pista, o de ninguna.
// Por eso las pistas no pueden desfasarse, aunque una se demore en leer del disco.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig};
use rtrb::{Consumer, RingBuffer};
use serde::Serialize;

use super::click::Click;
use super::render;
use super::stretch::Estirador;
use super::track;

// Segundos de audio que cada cola guarda por adelantado.
const SEGUNDOS_EN_COLA: usize = 5;

// Tiempo que tarda un cambio de volumen en completarse. Evita los chasquidos.
const SEGUNDOS_RAMPA: f32 = 0.01;

// Audio que debe tener cada cola antes de empezar a sonar, para que no arranque con un corte.
const SEGUNDOS_ANTES_DE_SONAR: f32 = 0.25;

// Controles de una pista. Son atómicos: se leen y escriben sin bloquear,
// porque la salida de audio no puede quedarse esperando a la interfaz.
pub(super) struct ControlPista {
    volumen: AtomicU32, // f32 guardado como bits: no existe un f32 atómico
    pub(super) mute: AtomicBool,
    solo: AtomicBool,
}

impl ControlPista {
    fn new() -> Self {
        Self {
            volumen: AtomicU32::new(1.0f32.to_bits()),
            mute: AtomicBool::new(false),
            solo: AtomicBool::new(false),
        }
    }

    fn volumen(&self) -> f32 {
        f32::from_bits(self.volumen.load(Ordering::Relaxed))
    }
}

// Datos que comparten la interfaz y la salida de audio.
pub(super) struct Compartido {
    reproduciendo: AtomicBool,
    pub(super) terminado: AtomicBool,
    callando: AtomicBool, // baja todo a cero antes de un salto, para que no suene un golpe
    cortes: AtomicU64,
    cuadros_sonados: AtomicU64, // el reloj: cuadros que ya salieron desde el último salto
    bpm: AtomicU32,             // f32 guardado como bits, igual que el volumen
    tiempos_por_compas: AtomicU32,
    inicio_click: AtomicU32, // f32 como bits: segundo donde cae el primer tiempo
    velocidad: AtomicU32,    // f32 como bits; 1 = normal. Es solo para estudiar, no se exporta
    semitonos: AtomicU32,    // f32 como bits; 0 = tono original. Tampoco se exporta
    pub(super) pistas: Vec<ControlPista>, // las pistas y, al final, el click
}

impl Compartido {
    pub(super) fn new(total_pistas: usize) -> Self {
        let mut pistas: Vec<ControlPista> =
            (0..total_pistas).map(|_| ControlPista::new()).collect();
        let click = ControlPista::new();
        click.volumen.store(0.0f32.to_bits(), Ordering::Relaxed);
        pistas.push(click);

        Self {
            reproduciendo: AtomicBool::new(false),
            terminado: AtomicBool::new(false),
            callando: AtomicBool::new(false),
            cortes: AtomicU64::new(0),
            cuadros_sonados: AtomicU64::new(0),
            bpm: AtomicU32::new(120.0f32.to_bits()),
            tiempos_por_compas: AtomicU32::new(4),
            inicio_click: AtomicU32::new(0.0f32.to_bits()),
            velocidad: AtomicU32::new(1.0f32.to_bits()),
            semitonos: AtomicU32::new(0.0f32.to_bits()),
            pistas,
        }
    }

    pub(super) fn fijar_volumen(&self, indice: usize, valor: f32) {
        self.pistas[indice]
            .volumen
            .store(valor.to_bits(), Ordering::Relaxed);
    }

    pub(super) fn fijar_click(&self, bpm: f32, tiempos_por_compas: u32, inicio: f32) {
        self.bpm.store(bpm.to_bits(), Ordering::Relaxed);
        self.inicio_click.store(inicio.to_bits(), Ordering::Relaxed);
        self.tiempos_por_compas
            .store(tiempos_por_compas, Ordering::Relaxed);
    }

    fn fijar_estudio(&self, velocidad: f32, semitonos: f32) {
        self.velocidad.store(velocidad.to_bits(), Ordering::Relaxed);
        self.semitonos.store(semitonos.to_bits(), Ordering::Relaxed);
    }

    // Copia solo los controles, para exportar sin tocar lo que está sonando.
    fn copiar_controles(&self) -> Self {
        let copia = Self::new(self.pistas.len() - 1);
        copia.fijar_click(
            f32::from_bits(self.bpm.load(Ordering::Relaxed)),
            self.tiempos_por_compas.load(Ordering::Relaxed),
            f32::from_bits(self.inicio_click.load(Ordering::Relaxed)),
        );
        for (indice, pista) in self.pistas.iter().enumerate() {
            copia.fijar_volumen(indice, pista.volumen());
            copia.pistas[indice]
                .mute
                .store(pista.mute.load(Ordering::Relaxed), Ordering::Relaxed);
            copia.pistas[indice]
                .solo
                .store(pista.solo.load(Ordering::Relaxed), Ordering::Relaxed);
        }
        copia
    }
}

// Lo que tiene abierto el motor mientras hay pistas cargadas.
struct Sesion {
    rutas: Vec<PathBuf>,
    rate: u32,
    inicio: f64, // segundo de la canción desde el que se empezó a leer
    duracion: f64,
    stream: Stream,
    compartido: Arc<Compartido>,
    parar: Arc<AtomicBool>,
    lectores: Vec<JoinHandle<()>>,
}

impl Sesion {
    // Abre las pistas en `inicio` y deja la salida corriendo. Los controles vienen en `compartido`.
    fn abrir(rutas: &[PathBuf], compartido: Arc<Compartido>, inicio: f64) -> Result<Self, String> {
        let lectores = rutas
            .iter()
            .map(|ruta| track::abrir(ruta))
            .collect::<Result<Vec<_>, _>>()?;
        let duracion = lectores.iter().map(|l| l.duracion()).fold(0.0, f64::max);

        let dispositivo = cpal::default_host()
            .default_output_device()
            .ok_or("No hay salida de audio en esta PC")?;
        let soportada = dispositivo
            .default_output_config()
            .map_err(|e| format!("No se pudo leer la salida de audio: {e}"))?;
        let formato = soportada.sample_format();
        let config: StreamConfig = soportada.into();
        let rate = config.sample_rate;

        let parar = Arc::new(AtomicBool::new(false));
        let mut colas = Vec::new();
        let mut hilos = Vec::new();
        for lector in lectores {
            let (productor, consumidor) =
                RingBuffer::<f32>::new(rate as usize * 2 * SEGUNDOS_EN_COLA);
            colas.push(consumidor);
            let parar_lector = parar.clone();
            hilos.push(thread::spawn(move || {
                lector.leer(inicio, rate, productor, parar_lector)
            }));
        }
        esperar_audio(&colas, rate);

        let mezclador = Mezclador::new(colas, compartido.clone(), rate, inicio);
        let stream = match formato {
            SampleFormat::F32 => abrir_salida::<f32>(&dispositivo, config, mezclador),
            SampleFormat::I16 => abrir_salida::<i16>(&dispositivo, config, mezclador),
            SampleFormat::I32 => abrir_salida::<i32>(&dispositivo, config, mezclador),
            otro => Err(format!("Formato de salida no soportado: {otro}")),
        }?;
        stream
            .play()
            .map_err(|e| format!("No se pudo iniciar la salida de audio: {e}"))?;

        Ok(Self {
            rutas: rutas.to_vec(),
            rate,
            inicio,
            duracion,
            stream,
            compartido,
            parar,
            lectores: hilos,
        })
    }

    fn posicion(&self) -> f64 {
        let cuadros = self.compartido.cuadros_sonados.load(Ordering::Relaxed);
        (self.inicio + cuadros as f64 / self.rate as f64).min(self.duracion)
    }

    fn cerrar(self) {
        self.parar.store(true, Ordering::Relaxed);
        drop(self.stream);
        for lector in self.lectores {
            let _ = lector.join();
        }
    }
}

#[derive(Serialize, Clone)]
pub struct Estado {
    pub reproduciendo: bool,
    pub terminado: bool,
    pub cortes: u64,
    pub posicion: f64,
    pub duracion: f64,
}

#[derive(Default)]
pub struct Motor {
    sesion: Mutex<Option<Sesion>>,
}

impl Motor {
    // Cierra lo anterior, abre las pistas nuevas y deja la salida lista, en pausa.
    pub fn cargar(&self, rutas: &[PathBuf]) -> Result<(), String> {
        let mut sesion = self.sesion.lock().unwrap();
        if let Some(anterior) = sesion.take() {
            anterior.cerrar();
        }

        let compartido = Arc::new(Compartido::new(rutas.len()));
        *sesion = Some(Sesion::abrir(rutas, compartido, 0.0)?);
        Ok(())
    }

    // Salta a un punto: cierra la lectura actual y vuelve a abrir todas las pistas ahí,
    // así ninguna puede quedar en otro lugar. Si estaba sonando, sigue sonando.
    pub fn buscar(&self, segundos: f64) -> Result<(), String> {
        let mut sesion = self.sesion.lock().unwrap();
        let anterior = sesion.take().ok_or("Primero carga las pistas")?;
        let compartido = anterior.compartido.clone();
        let rutas = anterior.rutas.clone();
        let destino = segundos.clamp(0.0, anterior.duracion);

        let sonaba = compartido.reproduciendo.load(Ordering::Relaxed);
        if sonaba {
            compartido.callando.store(true, Ordering::Relaxed);
            thread::sleep(Duration::from_millis(30));
        }
        compartido.reproduciendo.store(false, Ordering::Relaxed);
        anterior.cerrar();

        compartido.callando.store(false, Ordering::Relaxed);
        compartido.terminado.store(false, Ordering::Relaxed);
        compartido.cuadros_sonados.store(0, Ordering::Relaxed);

        *sesion = Some(Sesion::abrir(&rutas, compartido.clone(), destino)?);
        compartido.reproduciendo.store(sonaba, Ordering::Relaxed);
        Ok(())
    }

    pub fn play(&self) -> Result<(), String> {
        self.con_compartido(|c| c.reproduciendo.store(true, Ordering::Relaxed))
    }

    pub fn pausa(&self) -> Result<(), String> {
        self.con_compartido(|c| c.reproduciendo.store(false, Ordering::Relaxed))
    }

    pub fn click(&self, bpm: f32, tiempos_por_compas: u32, inicio: f32) -> Result<(), String> {
        self.con_compartido(|c| c.fijar_click(bpm, tiempos_por_compas, inicio))
    }

    pub fn estudio(&self, velocidad: f32, semitonos: f32) -> Result<(), String> {
        self.con_compartido(|c| c.fijar_estudio(velocidad, semitonos))
    }

    // Exporta junto a la carpeta de las pistas y devuelve la ruta del archivo.
    // No se guarda dentro de esa carpeta, porque se cargaría como una pista más.
    pub fn exportar(&self) -> Result<PathBuf, String> {
        let (rutas, controles) = {
            let sesion = self.sesion.lock().unwrap();
            let sesion = sesion.as_ref().ok_or("Primero carga las pistas")?;
            (sesion.rutas.clone(), sesion.compartido.copiar_controles())
        };

        let carpeta = rutas[0]
            .parent()
            .ok_or("La carpeta de las pistas no es válida")?;
        let nombre = carpeta.file_name().unwrap_or_default().to_string_lossy();
        let destino = carpeta.with_file_name(format!("{nombre}-mezcla.wav"));

        render::exportar(&rutas, controles, &destino)?;
        Ok(destino)
    }

    pub fn volumen(&self, indice: usize, valor: f32) -> Result<(), String> {
        self.con_pista(indice, |p| {
            p.volumen.store(valor.to_bits(), Ordering::Relaxed)
        })
    }

    pub fn mute(&self, indice: usize, valor: bool) -> Result<(), String> {
        self.con_pista(indice, |p| p.mute.store(valor, Ordering::Relaxed))
    }

    pub fn solo(&self, indice: usize, valor: bool) -> Result<(), String> {
        self.con_pista(indice, |p| p.solo.store(valor, Ordering::Relaxed))
    }

    fn con_compartido(&self, accion: impl FnOnce(&Compartido)) -> Result<(), String> {
        let sesion = self.sesion.lock().unwrap();
        let sesion = sesion.as_ref().ok_or("Primero carga las pistas")?;
        accion(&sesion.compartido);
        Ok(())
    }

    fn con_pista(&self, indice: usize, accion: impl FnOnce(&ControlPista)) -> Result<(), String> {
        let sesion = self.sesion.lock().unwrap();
        let sesion = sesion.as_ref().ok_or("Primero carga las pistas")?;
        let pista = sesion
            .compartido
            .pistas
            .get(indice)
            .ok_or("Esa pista no existe")?;
        accion(pista);
        Ok(())
    }

    pub fn estado(&self) -> Estado {
        let sesion = self.sesion.lock().unwrap();
        match sesion.as_ref() {
            Some(sesion) => Estado {
                reproduciendo: sesion.compartido.reproduciendo.load(Ordering::Relaxed),
                terminado: sesion.compartido.terminado.load(Ordering::Relaxed),
                cortes: sesion.compartido.cortes.load(Ordering::Relaxed),
                posicion: sesion.posicion(),
                duracion: sesion.duracion,
            },
            None => Estado {
                reproduciendo: false,
                terminado: false,
                cortes: 0,
                posicion: 0.0,
                duracion: 0.0,
            },
        }
    }
}

// Suma las pistas aplicando volumen, mute y solo. Vive dentro de la salida de audio.
pub(super) struct Mezclador {
    colas: Vec<Consumer<f32>>,
    compartido: Arc<Compartido>,
    pub(super) ganancias: Vec<f32>, // volumen que suena ahora; se acerca poco a poco al objetivo
    pub(super) objetivos: Vec<f32>,
    paso_rampa: f32,
    rate: u32,
    cuadro: u64, // cuadro de la canción que va a sonar; de aquí sale el click
    click: Click,
    estirador: Estirador,
    velocidad: f32,
    en_estudio: bool, // true cuando hay que pasar por el estirador
    resto: f64,       // fracción de cuadro que quedó del bloque anterior
}

impl Mezclador {
    pub(super) fn new(
        colas: Vec<Consumer<f32>>,
        compartido: Arc<Compartido>,
        rate: u32,
        inicio: f64,
    ) -> Self {
        let total = compartido.pistas.len();
        Self {
            colas,
            compartido,
            ganancias: vec![0.0; total],
            objetivos: vec![0.0; total],
            paso_rampa: 1.0 / (SEGUNDOS_RAMPA * rate as f32),
            rate,
            cuadro: (inicio * rate as f64).round() as u64,
            click: Click::new(120.0, 4, rate, 0.0),
            estirador: Estirador::new(rate),
            velocidad: 1.0,
            en_estudio: false,
            resto: 0.0,
        }
    }

    // Lee los controles una vez por bloque, no en cada muestra.
    pub(super) fn leer_controles(&mut self) {
        let bpm = f32::from_bits(self.compartido.bpm.load(Ordering::Relaxed));
        let tiempos = self.compartido.tiempos_por_compas.load(Ordering::Relaxed);
        let inicio = f32::from_bits(self.compartido.inicio_click.load(Ordering::Relaxed));
        self.click = Click::new(bpm, tiempos, self.rate, inicio);

        self.velocidad = f32::from_bits(self.compartido.velocidad.load(Ordering::Relaxed));
        let semitonos = f32::from_bits(self.compartido.semitonos.load(Ordering::Relaxed));
        let en_estudio = self.velocidad != 1.0 || semitonos != 0.0;
        if en_estudio && !self.en_estudio {
            self.estirador.reiniciar();
            self.resto = 0.0;
        }
        self.en_estudio = en_estudio;
        self.estirador.ajustar_tono(semitonos);

        let pistas = &self.compartido.pistas;
        let callando = self.compartido.callando.load(Ordering::Relaxed);
        let hay_solo = pistas.iter().any(|p| p.solo.load(Ordering::Relaxed));

        for (objetivo, pista) in self.objetivos.iter_mut().zip(pistas) {
            let callada = callando
                || pista.mute.load(Ordering::Relaxed)
                || (hay_solo && !pista.solo.load(Ordering::Relaxed));
            *objetivo = if callada { 0.0 } else { pista.volumen() };
        }
    }

    // Devuelve el siguiente cuadro con pistas y click, o None si alguna pista aún no tiene audio.
    pub(super) fn siguiente_cuadro(&mut self) -> Option<(f32, f32)> {
        let posicion = self.cuadro as f64;
        let (izquierda, derecha) = self.siguiente_pistas()?;
        let click = self.siguiente_click(posicion, 1.0);
        Some((izquierda + click, derecha + click))
    }

    // El click va en la última posición de los controles.
    fn siguiente_click(&mut self, posicion: f64, velocidad: f64) -> f32 {
        let indice = self.colas.len();
        let ganancia = &mut self.ganancias[indice];
        *ganancia += (self.objetivos[indice] - *ganancia).clamp(-self.paso_rampa, self.paso_rampa);
        self.click.muestra_en(posicion, velocidad) * *ganancia
    }

    // Suma las pistas, sin el click. Avanza un cuadro en la canción.
    fn siguiente_pistas(&mut self) -> Option<(f32, f32)> {
        let mut quedan_pistas = false;
        for cola in &self.colas {
            if cola.slots() >= 2 {
                quedan_pistas = true;
            } else if !cola.is_abandoned() {
                // Esta pista se atrasó: no se saca de ninguna para no desfasarlas.
                return None;
            }
        }

        if !quedan_pistas {
            // Todos los lectores terminaron y no queda audio: la canción acabó.
            self.compartido
                .reproduciendo
                .store(false, Ordering::Relaxed);
            self.compartido.terminado.store(true, Ordering::Relaxed);
            return Some((0.0, 0.0));
        }

        let mut izquierda = 0.0;
        let mut derecha = 0.0;
        for (indice, cola) in self.colas.iter_mut().enumerate() {
            let ganancia = &mut self.ganancias[indice];
            *ganancia +=
                (self.objetivos[indice] - *ganancia).clamp(-self.paso_rampa, self.paso_rampa);

            if cola.slots() >= 2 {
                izquierda += cola.pop().unwrap_or(0.0) * *ganancia;
                derecha += cola.pop().unwrap_or(0.0) * *ganancia;
            }
        }

        self.cuadro += 1;
        Some((izquierda, derecha))
    }

    // Llena el bloque que pide Windows. En pausa escribe silencio y no toca las colas,
    // así al volver a Play sigue exactamente donde iba.
    fn escribir<T>(&mut self, datos: &mut [T], canales: usize)
    where
        T: Sample + FromSample<f32>,
    {
        self.leer_controles();
        if self.en_estudio && self.compartido.reproduciendo.load(Ordering::Relaxed) {
            self.escribir_estudio(datos, canales);
            return;
        }

        let mut hubo_corte = false;
        let mut sonados = 0;

        for cuadro in datos.chunks_mut(canales) {
            let (izquierda, derecha) = if self.compartido.reproduciendo.load(Ordering::Relaxed) {
                match self.siguiente_cuadro() {
                    Some(mezcla) => {
                        sonados += 1;
                        mezcla
                    }
                    None => {
                        hubo_corte = true;
                        (0.0, 0.0)
                    }
                }
            } else {
                (0.0, 0.0)
            };

            poner_cuadro(cuadro, izquierda, derecha);
        }

        self.anotar_bloque(sonados, hubo_corte);
    }

    // Igual que `escribir`, pero las pistas pasan por el estirador. A velocidad lenta se piden
    // menos cuadros de la canción que los que salen. El click se suma después, sin estirarse.
    fn escribir_estudio<T>(&mut self, datos: &mut [T], canales: usize)
    where
        T: Sample + FromSample<f32>,
    {
        let cuadros = datos.len() / canales;
        let velocidad = self.velocidad as f64;

        let exacto = cuadros as f64 * velocidad + self.resto;
        let pedir = exacto.floor() as usize;
        self.resto = exacto - pedir as f64;

        // Lo que se oye va atrasado por el estirador: el click se atrasa igual para ir junto.
        let posicion = self.cuadro as f64 - self.estirador.latencia(velocidad);

        let mut hubo_corte = false;
        let mut sonados = 0;
        self.estirador.entrada.clear();
        for _ in 0..pedir {
            let Some((izquierda, derecha)) = self.siguiente_pistas() else {
                hubo_corte = true;
                break;
            };
            if !self.compartido.reproduciendo.load(Ordering::Relaxed) {
                break;
            }
            self.estirador.entrada.push(izquierda);
            self.estirador.entrada.push(derecha);
            sonados += 1;
        }
        self.estirador.estirar(cuadros);

        for (numero, cuadro) in datos.chunks_mut(canales).enumerate() {
            let click = self.siguiente_click(posicion + numero as f64 * velocidad, velocidad);
            let izquierda = self.estirador.salida[numero * 2] + click;
            let derecha = self.estirador.salida[numero * 2 + 1] + click;
            poner_cuadro(cuadro, izquierda, derecha);
        }

        self.anotar_bloque(sonados, hubo_corte);
    }

    fn anotar_bloque(&self, sonados: u64, hubo_corte: bool) {
        self.compartido
            .cuadros_sonados
            .fetch_add(sonados, Ordering::Relaxed);
        if hubo_corte {
            self.compartido.cortes.fetch_add(1, Ordering::Relaxed);
        }
    }
}

// Escribe un cuadro en el formato de la tarjeta; los canales de más quedan en silencio.
fn poner_cuadro<T>(cuadro: &mut [T], izquierda: f32, derecha: f32)
where
    T: Sample + FromSample<f32>,
{
    for (canal, muestra) in cuadro.iter_mut().enumerate() {
        let valor = match canal {
            0 => izquierda,
            1 => derecha,
            _ => 0.0,
        };
        *muestra = T::from_sample(valor.clamp(-1.0, 1.0));
    }
}

// Espera a que todas las pistas tengan audio listo. Si un archivo tarda demasiado, sigue igual:
// el mezclador sostiene a las demás pistas hasta que llegue.
fn esperar_audio(colas: &[Consumer<f32>], rate: u32) {
    let minimo = (rate as f32 * 2.0 * SEGUNDOS_ANTES_DE_SONAR) as usize;
    let limite = Instant::now() + Duration::from_secs(2);

    while Instant::now() < limite {
        if colas
            .iter()
            .all(|c| c.slots() >= minimo || c.is_abandoned())
        {
            return;
        }
        thread::sleep(Duration::from_millis(2));
    }
}

// `T` es el tipo de muestra que pide la tarjeta (casi siempre f32).
fn abrir_salida<T>(
    dispositivo: &Device,
    config: StreamConfig,
    mut mezclador: Mezclador,
) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let canales = config.channels as usize;
    dispositivo
        .build_output_stream(
            config,
            move |datos: &mut [T], _: &cpal::OutputCallbackInfo| {
                mezclador.escribir(datos, canales);
            },
            |error| eprintln!("Error en la salida de audio: {error}"),
            None,
        )
        .map_err(|e| format!("No se pudo abrir la salida de audio: {e}"))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn rutas_sinteticas() -> Vec<PathBuf> {
        (1..=8)
            .map(|i| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join(format!("../../samples/sinteticas/pista{i}.flac"))
            })
            .collect()
    }

    // Prueba de cancelación: las 8 pistas son idénticas, y 4 se suman y 4 se restan.
    // Si todas van alineadas el resultado es silencio total. Con un solo cuadro de desfase
    // en cualquier pista aparecería sonido. Las colas son diminutas a propósito,
    // para que las pistas se atrasen todo el tiempo y el reloj único tenga que sostenerlas.
    fn comprobar_alineacion(inicio: f64, cuadros_a_medir: u64) {
        let rate = 48000;
        let compartido = Arc::new(Compartido::new(8));
        let parar = Arc::new(AtomicBool::new(false));

        let mut colas = Vec::new();
        let mut hilos = Vec::new();
        for (indice, ruta) in rutas_sinteticas().iter().enumerate() {
            let lector = track::abrir(ruta).expect("falta correr scripts/generar-pistas.ps1");
            let (productor, consumidor) = RingBuffer::<f32>::new(512 + indice * 300);
            colas.push(consumidor);
            let parar_lector = parar.clone();
            hilos.push(thread::spawn(move || {
                lector.leer(inicio, rate, productor, parar_lector)
            }));

            let signo: f32 = if indice % 2 == 0 { 1.0 } else { -1.0 };
            compartido.pistas[indice]
                .volumen
                .store(signo.to_bits(), Ordering::Relaxed);
        }

        let mut mezclador = Mezclador::new(colas, compartido.clone(), rate, inicio);
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        let mut bloque = vec![0.0f32; 960];
        let mut pico = 0.0f32;
        while !compartido.terminado.load(Ordering::Relaxed)
            && compartido.cuadros_sonados.load(Ordering::Relaxed) < cuadros_a_medir
        {
            mezclador.escribir(&mut bloque, 2);
            pico = bloque.iter().fold(pico, |p, m| p.max(m.abs()));
        }
        parar.store(true, Ordering::Relaxed);
        for hilo in hilos {
            hilo.join().unwrap();
        }

        let cortes = compartido.cortes.load(Ordering::Relaxed);
        println!("inicio {inicio}: pico {pico}, bloques con pistas atrasadas {cortes}");
        assert_eq!(pico, 0.0);
        assert!(cortes > 0, "la prueba no llegó a forzar atrasos");
    }

    #[test]
    fn las_pistas_no_se_desfasan() {
        comprobar_alineacion(0.0, u64::MAX);
    }

    // Después de saltar a un punto cualquiera, las 8 pistas siguen exactamente juntas.
    #[test]
    fn las_pistas_siguen_juntas_al_saltar() {
        for inicio in [0.123, 57.321, 123.4567, 299.0] {
            comprobar_alineacion(inicio, 48000 * 10);
        }
    }

    // Devuelve dónde empieza cada click, escuchando solo la pista o solo el generado.
    fn inicios_de_clicks(inicio: f64, cuadros_a_medir: u64, escuchar_generado: bool) -> Vec<u64> {
        let rate = 48000;
        let compartido = Arc::new(Compartido::new(1));
        let parar = Arc::new(AtomicBool::new(false));

        let lector = track::abrir(&rutas_sinteticas()[0]).unwrap();
        let (productor, consumidor) = RingBuffer::<f32>::new(rate as usize * 2);
        let parar_lector = parar.clone();
        let hilo = thread::spawn(move || lector.leer(inicio, rate, productor, parar_lector));

        let (pista, click) = if escuchar_generado {
            (0.0f32, 1.0f32)
        } else {
            (1.0, 0.0)
        };
        compartido.pistas[0]
            .volumen
            .store(pista.to_bits(), Ordering::Relaxed);
        compartido.pistas[1]
            .volumen
            .store(click.to_bits(), Ordering::Relaxed);

        let mut mezclador = Mezclador::new(vec![consumidor], compartido.clone(), rate, inicio);
        // Las ganancias arrancan ya en su valor para no perder el primer click en la rampa.
        mezclador.ganancias = vec![pista, click];
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        // Se pide cuadro por cuadro: si el lector va atrasado se reintenta sin avanzar,
        // así la cuenta de cuadros es exacta aunque esta prueba corra más rápido que el disco.
        mezclador.leer_controles();
        let fin_de_cancion = ((300.0 - inicio) * rate as f64) as u64;
        let mut inicios = Vec::new();
        let mut silencio = 1_000_000u64;
        let mut cuadro = 0u64;
        while cuadro < cuadros_a_medir.min(fin_de_cancion) {
            let Some((izquierda, _)) = mezclador.siguiente_cuadro() else {
                continue;
            };
            if izquierda.abs() > 0.05 {
                if silencio > 1000 {
                    inicios.push(cuadro);
                }
                silencio = 0;
            } else {
                silencio += 1;
            }
            cuadro += 1;
        }
        parar.store(true, Ordering::Relaxed);
        hilo.join().unwrap();
        inicios
    }

    // A 120 BPM el click generado debe caer junto al click de la pista de prueba.
    fn comprobar_click_a_tiempo(inicio: f64, cuadros_a_medir: u64) {
        let pista = inicios_de_clicks(inicio, cuadros_a_medir, false);
        let generado = inicios_de_clicks(inicio, cuadros_a_medir, true);

        assert!(pista.len() > 10);
        assert_eq!(pista.len(), generado.len());
        let mayor = pista
            .iter()
            .zip(&generado)
            .map(|(a, b)| a.abs_diff(*b))
            .max()
            .unwrap();
        println!(
            "inicio {inicio}: {} clicks, diferencia máxima {mayor} cuadros",
            pista.len()
        );
        assert!(mayor <= 8);
    }

    #[test]
    fn el_click_cae_a_tiempo_toda_la_cancion() {
        comprobar_click_a_tiempo(0.0, u64::MAX);
    }

    #[test]
    fn el_click_sigue_a_tiempo_despues_de_saltar() {
        for inicio in [0.123, 57.321, 123.4567] {
            comprobar_click_a_tiempo(inicio, 48000 * 20);
        }
    }

    // Reproduce por el camino real, por bloques, y devuelve el lado izquierdo de lo que sale.
    fn sonido_de_estudio(mezclador: &mut Mezclador, segundos: f64, rate: u32) -> Vec<f32> {
        let mut salida = Vec::new();
        let mut bloque = vec![0.0f32; 960];
        while (salida.len() as f64) < segundos * rate as f64 {
            // La prueba corre más rápido que el disco: espera a que haya audio de sobra.
            while mezclador
                .colas
                .iter()
                .any(|c| c.slots() < 4000 && !c.is_abandoned())
            {
                thread::yield_now();
            }
            mezclador.escribir(&mut bloque, 2);
            salida.extend(bloque.chunks(2).map(|cuadro| cuadro[0]));
        }
        salida
    }

    fn inicios_en(muestras: &[f32], umbral: f32) -> Vec<usize> {
        let mut inicios = Vec::new();
        let mut silencio = usize::MAX / 2;
        for (cuadro, muestra) in muestras.iter().enumerate() {
            if muestra.abs() > umbral {
                if silencio > 4000 {
                    inicios.push(cuadro);
                }
                silencio = 0;
            } else {
                silencio += 1;
            }
        }
        inicios
    }

    // Saca el sonido de una pista de clicks o del click generado, a otra velocidad.
    fn clicks_a_velocidad(velocidad: f32, escuchar_generado: bool) -> Vec<usize> {
        let rate = 48000;
        let compartido = Arc::new(Compartido::new(1));
        let parar = Arc::new(AtomicBool::new(false));

        let lector = track::abrir(&rutas_sinteticas()[0]).unwrap();
        let (productor, consumidor) = RingBuffer::<f32>::new(rate as usize * 2);
        let parar_lector = parar.clone();
        let hilo = thread::spawn(move || lector.leer(0.0, rate, productor, parar_lector));

        let (pista, click) = if escuchar_generado {
            (0.0f32, 1.0f32)
        } else {
            (1.0, 0.0)
        };
        compartido.fijar_volumen(0, pista);
        compartido.fijar_volumen(1, click);
        compartido.fijar_estudio(velocidad, 0.0);

        let mut mezclador = Mezclador::new(vec![consumidor], compartido.clone(), rate, 0.0);
        mezclador.ganancias = vec![pista, click];
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        let salida = sonido_de_estudio(&mut mezclador, 30.0, rate);
        parar.store(true, Ordering::Relaxed);
        drop(mezclador);
        hilo.join().unwrap();
        inicios_en(&salida, 0.02)
    }

    // A cualquier velocidad, el click generado debe ir junto a las pistas estiradas.
    #[test]
    fn click_y_pistas_siguen_juntos_a_otra_velocidad() {
        let rate = 48000.0;
        for velocidad in [0.5f32, 0.75, 1.25] {
            let pista = clicks_a_velocidad(velocidad, false);
            let generado = clicks_a_velocidad(velocidad, true);

            let separacion = 0.5 * rate / velocidad as f64;
            for par in generado.windows(2) {
                assert!(((par[1] - par[0]) as f64 - separacion).abs() <= 4.0);
            }

            // El primero se salta: al arrancar, el estirador todavía se está llenando.
            let mut mayor = 0.0f64;
            for cuadro in pista.iter().skip(1) {
                let cercano = generado
                    .iter()
                    .map(|g| (*g as f64 - *cuadro as f64).abs())
                    .fold(f64::MAX, f64::min);
                mayor = mayor.max(cercano);
            }
            let milisegundos = mayor / rate * 1000.0;
            println!(
                "velocidad {velocidad}: {} clicks, mayor diferencia {milisegundos:.1} ms",
                pista.len()
            );
            assert!(pista.len() > 20);
            assert!(milisegundos < 15.0);
        }
    }

    // Da la frecuencia que sale al pasar un tono puro por el estirador.
    fn frecuencia_de_salida(velocidad: f32, semitonos: f32) -> f64 {
        let rate = 48000u32;
        let compartido = Arc::new(Compartido::new(1));
        compartido.fijar_estudio(velocidad, semitonos);

        let (mut productor, consumidor) = RingBuffer::<f32>::new(rate as usize * 2 * 8);
        for cuadro in 0..rate as usize * 8 {
            let muestra =
                (std::f64::consts::TAU * 440.0 * cuadro as f64 / rate as f64).sin() as f32;
            productor.push(muestra * 0.5).unwrap();
            productor.push(muestra * 0.5).unwrap();
        }

        let mut mezclador = Mezclador::new(vec![consumidor], compartido.clone(), rate, 0.0);
        compartido.reproduciendo.store(true, Ordering::Relaxed);
        let salida = sonido_de_estudio(&mut mezclador, 3.0, rate);

        let ultimo_segundo = &salida[salida.len() - rate as usize..];
        let cruces = ultimo_segundo
            .windows(2)
            .filter(|par| par[0] <= 0.0 && par[1] > 0.0)
            .count();
        cruces as f64
    }

    #[test]
    fn la_velocidad_no_cambia_el_tono_y_el_tono_sube_o_baja() {
        let casos = [
            (0.75f32, 0.0f32, 440.0f64),
            (0.5, 0.0, 440.0),
            (1.0, 2.0, 493.88),
            (0.75, 2.0, 493.88),
            (1.0, -3.0, 369.99),
        ];
        for (velocidad, semitonos, esperada) in casos {
            let frecuencia = frecuencia_de_salida(velocidad, semitonos);
            println!("velocidad {velocidad}, semitonos {semitonos}: {frecuencia} Hz");
            assert!((frecuencia - esperada).abs() < esperada * 0.01);
        }
    }

    // Mute, solo y volumen: comprueba cuánto suena la mezcla en cada caso.
    #[test]
    fn mute_solo_y_volumen() {
        let compartido = Arc::new(Compartido::new(2));
        let mut colas = Vec::new();
        let mut productores = Vec::new();
        for _ in 0..2 {
            let (productor, consumidor) = RingBuffer::<f32>::new(40000);
            productores.push(productor);
            colas.push(consumidor);
        }
        let mut mezclador = Mezclador::new(colas, compartido.clone(), 1000, 0.0);
        compartido.reproduciendo.store(true, Ordering::Relaxed);

        // Toda la señal vale 1: lo que sale es la suma de las ganancias.
        let mut medir = |mezclador: &mut Mezclador| {
            for productor in productores.iter_mut() {
                for _ in 0..200 {
                    productor.push(1.0).unwrap();
                }
            }
            let mut bloque = vec![0.0f32; 200];
            mezclador.escribir(&mut bloque, 2);
            *bloque.last().unwrap()
        };

        compartido.pistas[0]
            .volumen
            .store(0.25f32.to_bits(), Ordering::Relaxed);
        compartido.pistas[1]
            .volumen
            .store(0.5f32.to_bits(), Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.75);

        compartido.pistas[1].mute.store(true, Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.25);

        compartido.pistas[1].solo.store(true, Ordering::Relaxed);
        compartido.pistas[1].mute.store(false, Ordering::Relaxed);
        assert_eq!(medir(&mut mezclador), 0.5);
    }

    // Suena por la tarjeta real, así que no corre con `cargo test` normal:
    // cargo test -- --ignored reproduce_sin_cortes
    #[test]
    #[ignore]
    fn reproduce_sin_cortes() {
        let motor = Motor::default();
        motor.cargar(&rutas_sinteticas()).unwrap();

        motor.play().unwrap();
        thread::sleep(Duration::from_secs(5));
        motor.pausa().unwrap();
        thread::sleep(Duration::from_millis(500));
        motor.play().unwrap();
        thread::sleep(Duration::from_secs(2));

        let antes = Instant::now();
        motor.buscar(100.0).unwrap();
        println!("el salto tardó {:?}", antes.elapsed());
        thread::sleep(Duration::from_secs(3));

        let estado = motor.estado();
        println!("posición {}", estado.posicion);
        assert_eq!(estado.cortes, 0);
        assert!(estado.reproduciendo);
        assert_eq!(estado.duracion, 300.0);
        assert!((102.8..103.2).contains(&estado.posicion));
    }
}
