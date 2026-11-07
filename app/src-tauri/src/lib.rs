mod audio;
mod biblioteca;
mod commands;
mod db;

use std::thread;
use std::time::Duration;

use audio::engine::Motor;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(db::BASE, db::migraciones())
                .build(),
        )
        .manage(Motor::default())
        .setup(|app| {
            // Avisa a la interfaz la posición y el estado unas 30 veces por segundo.
            let app = app.handle().clone();
            thread::spawn(move || {
                loop {
                    let _ = app.emit("estado", app.state::<Motor>().estado());
                    thread::sleep(Duration::from_millis(33));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cargar_carpeta,
            commands::play,
            commands::pausa,
            commands::buscar,
            commands::click,
            commands::estudio,
            commands::exportar,
            commands::volumen,
            commands::mute,
            commands::solo,
            biblioteca::copiar_cancion,
            biblioteca::borrar_cancion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
