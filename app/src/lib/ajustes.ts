// Las claves de MVSep y de Modal (`src-tauri/src/ajustes.rs`).
// La interfaz puede guardarlas o borrarlas, pero nunca leerlas: solo saber si hay una.

import { invoke } from "@tauri-apps/api/core";

export function hayClaveMvsep() {
  return invoke<boolean>("hay_clave_mvsep");
}

/** Una clave vacía la borra. */
export function guardarClaveMvsep(clave: string) {
  return invoke<void>("guardar_clave_mvsep", { clave });
}

export function hayClaveModal() {
  return invoke<boolean>("hay_clave_modal");
}

/** Una clave vacía la borra. */
export function guardarClaveModal(clave: string) {
  return invoke<void>("guardar_clave_modal", { clave });
}
