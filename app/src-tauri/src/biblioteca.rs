// Archivos de la biblioteca: copiar una canción a su carpeta y borrarla.
//
// Cada canción vive en su propia carpeta, con el id que le dio SQLite:
//   %LOCALAPPDATA%\com.desglose.app\canciones\7\original.mp3
// Se copia (no solo se recuerda dónde estaba) para que siga funcionando
// aunque el encargado mueva o borre el archivo original.
// En el paso 3, las pistas separadas van en esa misma carpeta.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::audio::track;
use crate::secuencia::Separacion;

const FORMATOS: [&str; 4] = ["mp3", "wav", "flac", "m4a"];

/// Lo que la interfaz recibe al copiar. `rename_all` cambia los nombres
/// al estilo de TypeScript: `duracion_ms` llega como `duracionMs`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancionCopiada {
    archivo: String,
    duracion_ms: u64,
}

pub fn carpeta_cancion(app: &AppHandle, id: i64) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("No se encontró la carpeta de la app: {e}"))?;
    Ok(base.join("canciones").join(id.to_string()))
}

/// Devuelve la extensión en minúsculas si es un formato que aceptamos.
fn formato(ruta: &Path) -> Option<String> {
    let extension = ruta.extension()?.to_str()?.to_ascii_lowercase();
    FORMATOS.contains(&extension.as_str()).then_some(extension)
}

/// Mide la duración abriendo el archivo con el mismo lector del motor.
fn medir_duracion_ms(ruta: &Path) -> Result<u64, String> {
    let lector = track::abrir(ruta)?;
    Ok((lector.duracion() * 1000.0).round() as u64)
}

/// Copia la canción a su carpeta y devuelve el nombre del archivo y su duración.
/// Primero comprueba que se pueda leer: así no se copia un archivo dañado.
/// `async` la saca del hilo principal: la ventana no se congela al copiar.
#[tauri::command(async)]
pub fn copiar_cancion(app: AppHandle, id: i64, origen: String) -> Result<CancionCopiada, String> {
    let origen = PathBuf::from(origen);
    let extension =
        formato(&origen).ok_or("Ese archivo no es una canción. Usa un MP3, WAV, FLAC o M4A.")?;
    let duracion_ms = medir_duracion_ms(&origen)?;

    let carpeta = carpeta_cancion(&app, id)?;
    fs::create_dir_all(&carpeta).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;

    let archivo = format!("original.{extension}");
    fs::copy(&origen, carpeta.join(&archivo))
        .map_err(|e| format!("No se pudo copiar la canción: {e}"))?;

    Ok(CancionCopiada {
        archivo,
        duracion_ms,
    })
}

/// Borra la carpeta de la canción con todo lo que tenga adentro.
#[tauri::command(async)]
pub fn borrar_cancion(app: AppHandle, id: i64) -> Result<(), String> {
    // Si MVSep está trabajando en ella, borrarla rompería la separación a mitad.
    if app.state::<Separacion>().en_curso() == Some(id) {
        return Err("Esta canción se está separando. Espera a que termine para borrarla.".into());
    }
    let carpeta = carpeta_cancion(&app, id)?;
    if carpeta.exists() {
        fs::remove_dir_all(&carpeta).map_err(|e| format!("No se pudo borrar la canción: {e}"))?;
    }
    Ok(())
}

/// Carpeta con las pistas separadas de una canción. La usa el editor de prueba
/// para cargarlas en el motor; en el paso 4 el editor las cargará por su cuenta.
#[tauri::command]
pub fn carpeta_pistas(app: AppHandle, id: i64) -> Result<String, String> {
    let carpeta = carpeta_cancion(&app, id)?.join("pistas");
    Ok(carpeta.to_string_lossy().into_owned())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn muestra(nombre: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../samples")
            .join(nombre)
    }

    #[test]
    fn acepta_solo_canciones() {
        assert_eq!(formato(Path::new("a/Hay Libertad.MP3")), Some("mp3".into()));
        assert_eq!(formato(Path::new("b.m4a")), Some("m4a".into()));
        assert_eq!(formato(Path::new("c.pdf")), None);
        assert_eq!(formato(Path::new("sin_extension")), None);
    }

    #[test]
    fn mide_mp3_m4a_y_flac() {
        // Las tres son la misma canción (el M4A se crea con FFmpeg desde el MP3,
        // ver app/README.md): deben durar casi lo mismo.
        let mp3 = medir_duracion_ms(&muestra("cancion1/original.mp3")).unwrap();
        let m4a = medir_duracion_ms(&muestra("cancion1/original.m4a")).unwrap();
        let flac = medir_duracion_ms(&muestra("cancion1/original.flac")).unwrap();
        assert!(mp3 > 60_000, "el MP3 debe durar más de un minuto: {mp3} ms");
        assert!(mp3.abs_diff(flac) < 1_000, "MP3 {mp3} ms y FLAC {flac} ms");
        assert!(mp3.abs_diff(m4a) < 1_000, "MP3 {mp3} ms y M4A {m4a} ms");
    }

    #[test]
    fn sintetica_dura_cinco_minutos() {
        assert_eq!(
            medir_duracion_ms(&muestra("sinteticas/pista1.flac")).unwrap(),
            300_000
        );
    }
}
