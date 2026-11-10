// Actualización automática (plugin "updater" de Tauri).
//
// Al abrir la app se pregunta a GitHub si hay una versión nueva (el archivo
// latest.json de la página Releases). NUNCA se instala sola: la interfaz muestra
// un aviso y el encargado elige cuándo, para no cortar un ensayo.
// Al aceptar: baja la versión (con avance), la instala y reinicia la app.
// Las canciones, la base y las claves viven aparte (AppData): no se tocan.
//
// La versión viene firmada: la app solo acepta lo firmado con la clave de Oscar
// (la pública está en tauri.conf.json → plugins → updater → pubkey).

import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/** La versión nueva, o null si no hay (o no hay internet: no se avisa nada). */
export async function buscarVersionNueva(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    // Sin internet, GitHub caído o en modo desarrollo: se sigue igual, en silencio.
    console.warn("No se pudo buscar una versión nueva:", e);
    return null;
  }
}

/** Baja, instala y reinicia. `alAvanzar` recibe de 0 a 1 (o null si no se sabe el tamaño). */
export async function instalar(version: Update, alAvanzar: (fraccion: number | null) => void) {
  let total = 0;
  let bajado = 0;
  await version.downloadAndInstall((evento) => {
    if (evento.event === "Started") {
      total = evento.data.contentLength ?? 0;
      alAvanzar(total ? 0 : null);
    } else if (evento.event === "Progress") {
      bajado += evento.data.chunkLength;
      alAvanzar(total ? Math.min(1, bajado / total) : null);
    } else if (evento.event === "Finished") {
      alAvanzar(1);
    }
  });
  // En Windows el instalador cierra la app solo; esto cubre el caso en que no.
  await relaunch();
}
