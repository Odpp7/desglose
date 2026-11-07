// La clave de MVSep (`src-tauri/src/ajustes.rs`).
// La interfaz puede guardarla o borrarla, pero nunca leerla: solo saber si hay una.

import { invoke } from "@tauri-apps/api/core";

export function hayClaveMvsep() {
  return invoke<boolean>("hay_clave_mvsep");
}

/** Una clave vacía la borra. */
export function guardarClaveMvsep(clave: string) {
  return invoke<void>("guardar_clave_mvsep", { clave });
}
