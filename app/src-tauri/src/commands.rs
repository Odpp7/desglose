// Órdenes del motor de audio que la interfaz llama con `invoke`.
// Casi todas solo pasan el pedido al motor.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};

use crate::audio::engine::Motor;
use crate::audio::ondas;
use crate::biblioteca;

/// Una pista para cargar: su archivo dentro de la carpeta de la canción
/// ("pistas/voz-lider.flac", "propias/1731.wav") y cuántos milisegundos está
/// corrida (0 para las separadas; las propias se pueden alinear).
#[derive(Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PistaParaCargar {
    archivo: String,
    desfase_ms: i64,
}

/// Qué canción tiene cargada el motor y con qué pistas. Sirve para que, al volver
/// al editor, la canción siga ahí (sonando o en el mismo punto) sin recargarla.
#[derive(Default)]
pub struct CancionCargada(Mutex<Option<(i64, Vec<PistaParaCargar>)>>);

/// Carga las pistas de una canción en el motor, en ese orden: el índice de cada
/// una es el que usan `volumen`, `mute` y `solo`, y el click va después de todas.
/// Si ya estaban cargadas exactamente así, no hace nada y devuelve `true`: el motor
/// sigue en el mismo punto y con su mezcla. Si cambió algo (una pista nueva, un
/// desfase), las vuelve a abrir.
#[tauri::command(async)]
pub fn cargar_cancion(
    app: AppHandle,
    id: i64,
    pistas: Vec<PistaParaCargar>,
) -> Result<bool, String> {
    if pistas.is_empty() {
        return Err("Esta canción todavía no tiene pistas".into());
    }
    let cargada = app.state::<CancionCargada>();
    let mut actual = cargada.0.lock().unwrap();
    if actual.as_ref() == Some(&(id, pistas.clone())) {
        return Ok(true);
    }

    let rutas = pistas
        .iter()
        .map(|p| biblioteca::ruta_en_cancion(&app, id, &p.archivo))
        .collect::<Result<Vec<_>, _>>()?;
    let desfases: Vec<f64> = pistas
        .iter()
        .map(|p| p.desfase_ms as f64 / 1000.0)
        .collect();
    app.state::<Motor>().cargar(&rutas, &desfases)?;
    *actual = Some((id, pistas));
    Ok(false)
}

/// La forma de onda de una pista (ver `audio/ondas.rs`). Llega a la interfaz como
/// bytes, sin pasar por texto: 100 por segundo, de 0 a 255.
#[tauri::command(async)]
pub fn ondas_pista(app: AppHandle, id: i64, archivo: String) -> Result<Response, String> {
    let ruta = biblioteca::ruta_en_cancion(&app, id, &archivo)?;
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
pub fn click(
    bpm: f32,
    tiempos: u32,
    inicio: f32,
    conteo: u32,
    motor: State<'_, Motor>,
) -> Result<(), String> {
    motor.click(bpm, tiempos, inicio, conteo)
}

/// La voz guía: qué frase suena en qué segundo de la canción (la arma la interfaz).
#[tauri::command]
pub fn guia(avisos: Vec<(f64, String)>, motor: State<'_, Motor>) -> Result<(), String> {
    motor.guia(&avisos)
}

/// Las frases de la voz guía ("Coro 1", "2", "Última vez"...) y cuánto dura cada una.
#[tauri::command]
pub fn frases_guia(motor: State<'_, Motor>) -> Vec<(String, f64)> {
    motor.frases_guia()
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
