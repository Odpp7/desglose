mod audio;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(audio::engine::Motor::default())
        .invoke_handler(tauri::generate_handler![
            commands::cargar,
            commands::play,
            commands::pausa,
            commands::estado
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
