// Órdenes que la interfaz llama con `invoke`. Solo pasan el pedido al motor.

use tauri::State;

use crate::audio::engine::{Estado, Motor};

#[tauri::command]
pub fn cargar(ruta: String, motor: State<'_, Motor>) -> Result<(), String> {
    motor.cargar(&ruta)
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
pub fn estado(motor: State<'_, Motor>) -> Estado {
    motor.estado()
}
