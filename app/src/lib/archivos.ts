// Órdenes a Rust para los archivos de cada canción (`src-tauri/src/biblioteca.rs`).

import { invoke } from "@tauri-apps/api/core";

export const FORMATOS = ["mp3", "wav", "flac", "m4a"];

/** Copia la canción a su carpeta. Devuelve el nombre del archivo y cuánto dura. */
export function copiarCancion(id: number, origen: string) {
  return invoke<{ archivo: string; duracionMs: number }>("copiar_cancion", { id, origen });
}

/** Copia un archivo propio a la carpeta `propias/` de la canción. */
export function copiarPistaPropia(id: number, origen: string) {
  return invoke<{ archivo: string; duracionMs: number }>("copiar_pista_propia", { id, origen });
}

/** Borra el archivo de una pista propia. */
export function borrarPistaPropia(id: number, archivo: string) {
  return invoke<void>("borrar_pista_propia", { id, archivo });
}

/** Borra la carpeta de la canción con todo su audio. */
export function borrarCarpetaCancion(id: number) {
  return invoke<void>("borrar_cancion", { id });
}

/** "C:\Música\Hay Libertad.mp3" → "Hay Libertad.mp3" */
export function nombreArchivo(ruta: string) {
  return ruta.split(/[\\/]/).pop() ?? ruta;
}

/** "Hay Libertad.mp3" → "mp3" */
export function extension(ruta: string) {
  const nombre = nombreArchivo(ruta);
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
}

/** "C:\Música\Hay Libertad.mp3" → "Hay Libertad" */
export function sinExtension(ruta: string) {
  const nombre = nombreArchivo(ruta);
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? nombre.slice(0, punto) : nombre;
}
