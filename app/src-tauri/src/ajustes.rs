// La clave de MVSep.
//
// Se guarda en un archivo de texto dentro de la carpeta de la app:
//   %APPDATA%\com.desglose.app\clave-mvsep.txt
// No va en SQLite ni en el código. La interfaz puede guardarla o borrarla,
// pero nunca leerla: solo pregunta si ya hay una. Así la clave no se muestra
// en pantalla ni puede salir de la PC por un error de la interfaz.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn ruta_clave(app: &AppHandle) -> Result<PathBuf, String> {
    let carpeta = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se encontró la carpeta de la app: {e}"))?;
    Ok(carpeta.join("clave-mvsep.txt"))
}

/// La clave guardada, o `None` si todavía no hay.
pub fn leer_clave_mvsep(app: &AppHandle) -> Result<Option<String>, String> {
    let ruta = ruta_clave(app)?;
    if !ruta.exists() {
        return Ok(None);
    }
    let clave = fs::read_to_string(&ruta).map_err(|e| format!("No se pudo leer la clave: {e}"))?;
    let clave = clave.trim().to_string();
    Ok((!clave.is_empty()).then_some(clave))
}

/// Guarda la clave. Si llega vacía, la borra.
#[tauri::command]
pub fn guardar_clave_mvsep(app: AppHandle, clave: String) -> Result<(), String> {
    let ruta = ruta_clave(&app)?;
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

#[tauri::command]
pub fn hay_clave_mvsep(app: AppHandle) -> Result<bool, String> {
    Ok(leer_clave_mvsep(&app)?.is_some())
}
