// Órdenes que la interfaz llama con `invoke`. Solo pasan el pedido al motor.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::audio::engine::Motor;

fn es_audio(ruta: &Path) -> bool {
    ruta.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("flac") || e.eq_ignore_ascii_case("wav"))
}

// Carga todos los FLAC y WAV de una carpeta y devuelve sus nombres en orden.
#[tauri::command]
pub fn cargar_carpeta(carpeta: String, motor: State<'_, Motor>) -> Result<Vec<String>, String> {
    let mut rutas: Vec<PathBuf> = fs::read_dir(&carpeta)
        .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))?
        .filter_map(|entrada| entrada.ok())
        .map(|entrada| entrada.path())
        .filter(|ruta| es_audio(ruta))
        .collect();
    rutas.sort();

    if rutas.is_empty() {
        return Err("La carpeta no tiene archivos FLAC ni WAV".into());
    }

    motor.cargar(&rutas)?;
    Ok(rutas
        .iter()
        .map(|ruta| {
            ruta.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        })
        .collect())
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
