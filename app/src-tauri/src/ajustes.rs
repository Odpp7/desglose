// Las claves de los servicios: MVSep (separar) y Modal (proponer secciones).
//
// Cada una se guarda en un archivo de texto dentro de la carpeta de la app:
//   %APPDATA%\com.desglose.app\clave-mvsep.txt
//   %APPDATA%\com.desglose.app\clave-modal.txt
// No van en SQLite ni en el código. La interfaz puede guardarlas o borrarlas,
// pero nunca leerlas: solo pregunta si ya hay una. Así una clave no se muestra
// en pantalla ni puede salir de la PC por un error de la interfaz.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const MVSEP: &str = "clave-mvsep.txt";
const MODAL: &str = "clave-modal.txt";

fn ruta(app: &AppHandle, archivo: &str) -> Result<PathBuf, String> {
    let carpeta = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se encontró la carpeta de la app: {e}"))?;
    Ok(carpeta.join(archivo))
}

/// La clave guardada en ese archivo, o `None` si todavía no hay.
fn leer(app: &AppHandle, archivo: &str) -> Result<Option<String>, String> {
    let ruta = ruta(app, archivo)?;
    if !ruta.exists() {
        return Ok(None);
    }
    let clave = fs::read_to_string(&ruta).map_err(|e| format!("No se pudo leer la clave: {e}"))?;
    let clave = clave.trim().to_string();
    Ok((!clave.is_empty()).then_some(clave))
}

/// Guarda la clave. Si llega vacía, la borra.
fn guardar(app: &AppHandle, archivo: &str, clave: &str) -> Result<(), String> {
    let ruta = ruta(app, archivo)?;
    let clave = clave.trim();
    if clave.is_empty() {
        if ruta.exists() {
            fs::remove_file(&ruta).map_err(|e| format!("No se pudo borrar la clave: {e}"))?;
        }
        return Ok(());
    }
    if let Some(carpeta) = ruta.parent() {
        fs::create_dir_all(carpeta).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    }
    fs::write(&ruta, clave).map_err(|e| format!("No se pudo guardar la clave: {e}"))
}

// ---------- MVSep ----------

pub fn leer_clave_mvsep(app: &AppHandle) -> Result<Option<String>, String> {
    leer(app, MVSEP)
}

#[tauri::command]
pub fn guardar_clave_mvsep(app: AppHandle, clave: String) -> Result<(), String> {
    guardar(&app, MVSEP, &clave)
}

#[tauri::command]
pub fn hay_clave_mvsep(app: AppHandle) -> Result<bool, String> {
    Ok(leer(&app, MVSEP)?.is_some())
}

// ---------- Modal ----------

pub fn leer_clave_modal(app: &AppHandle) -> Result<Option<String>, String> {
    leer(app, MODAL)
}

#[tauri::command]
pub fn guardar_clave_modal(app: AppHandle, clave: String) -> Result<(), String> {
    guardar(&app, MODAL, &clave)
}

#[tauri::command]
pub fn hay_clave_modal(app: AppHandle) -> Result<bool, String> {
    Ok(leer(&app, MODAL)?.is_some())
}
