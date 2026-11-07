// Órdenes del motor de audio que la interfaz llama con `invoke`.
// Casi todas solo pasan el pedido al motor.

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};

use crate::audio::engine::Motor;
use crate::audio::ondas;
use crate::biblioteca;
use crate::secuencia;

/// Qué canción tiene cargada el motor y con qué pistas. Sirve para que, al volver
/// al editor, la canción siga ahí (sonando o en el mismo punto) sin recargarla.
#[derive(Default)]
pub struct CancionCargada(Mutex<Option<(i64, Vec<String>)>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cargada {
    /// Las pistas en el orden en que las tiene el motor: el índice de cada una
    /// es el que usan `volumen`, `mute` y `solo`. El click va después de todas.
    pistas: Vec<secuencia::PistaLista>,
    /// `true` si ya estaba cargada: el motor conserva su posición y su mezcla.
    ya_estaba: bool,
}

/// Carga las pistas de una canción en el motor. Si ya estaban cargadas (y no se
/// pide `forzar`), no hace nada. `forzar` se usa cuando las pistas cambiaron,
/// por ejemplo al terminar de separar voz líder y coros.
#[tauri::command(async)]
pub fn cargar_cancion(app: AppHandle, id: i64, forzar: bool) -> Result<Cargada, String> {
    let pistas = secuencia::leer_lista(&app, id)?.ok_or("Esta canción todavía no tiene pistas")?;
    let instrumentos: Vec<String> = pistas.iter().map(|p| p.instrumento.clone()).collect();

    let cargada = app.state::<CancionCargada>();
    let mut actual = cargada.0.lock().unwrap();
    if !forzar && actual.as_ref() == Some(&(id, instrumentos.clone())) {
        return Ok(Cargada {
            pistas,
            ya_estaba: true,
        });
    }

    let carpeta = biblioteca::carpeta_cancion(&app, id)?;
    let rutas: Vec<_> = pistas.iter().map(|p| carpeta.join(&p.archivo)).collect();
    app.state::<Motor>().cargar(&rutas)?;
    *actual = Some((id, instrumentos));
    Ok(Cargada {
        pistas,
        ya_estaba: false,
    })
}

/// La forma de onda de una pista (ver `audio/ondas.rs`). Llega a la interfaz como
/// bytes, sin pasar por texto: 100 por segundo, de 0 a 255.
#[tauri::command(async)]
pub fn ondas_pista(app: AppHandle, id: i64, instrumento: String) -> Result<Response, String> {
    // El nombre arma una ruta: solo se aceptan letras y guiones ("voz-lider").
    if instrumento.is_empty()
        || !instrumento
            .chars()
            .all(|c| c.is_ascii_lowercase() || c == '-')
    {
        return Err("Nombre de pista no válido".into());
    }
    let ruta = biblioteca::carpeta_cancion(&app, id)?
        .join("pistas")
        .join(format!("{instrumento}.flac"));
    Ok(Response::new(ondas::picos(&ruta)?))
}

#[tauri::command]
pub fn play(motor: State<'_, Motor>) -> Result<(), String> {
    motor.play()
}

#[tauri::command]
pub fn pausa(motor: State<'_, Motor>) -> Result<(), String> {
    motor.pausa()
}

#[tauri::command]
pub fn buscar(segundos: f64, motor: State<'_, Motor>) -> Result<(), String> {
    motor.buscar(segundos)
}

#[tauri::command]
pub fn click(bpm: f32, tiempos: u32, inicio: f32, motor: State<'_, Motor>) -> Result<(), String> {
    motor.click(bpm, tiempos, inicio)
}

#[tauri::command]
pub fn estudio(velocidad: f32, semitonos: f32, motor: State<'_, Motor>) -> Result<(), String> {
    motor.estudio(velocidad, semitonos)
}

// `async` la saca del hilo principal: la ventana no se congela mientras exporta.
#[tauri::command(async)]
pub fn exportar(motor: State<'_, Motor>) -> Result<String, String> {
    let destino = motor.exportar()?;
    Ok(destino.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn volumen(indice: usize, valor: f32, motor: State<'_, Motor>) -> Result<(), String> {
    motor.volumen(indice, valor)
}

#[tauri::command]
pub fn mute(indice: usize, valor: bool, motor: State<'_, Motor>) -> Result<(), String> {
    motor.mute(indice, valor)
}

#[tauri::command]
pub fn solo(indice: usize, valor: bool, motor: State<'_, Motor>) -> Result<(), String> {
    motor.solo(indice, valor)
}
