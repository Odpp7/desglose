// La última canción abierta, para volver a ella al abrir la app.
// (La mezcla de cada pista se guarda en SQLite: ver `actualizarPista` en db.ts.)

const CLAVE_ULTIMA = "desglose.ultimaCancion";

/** La última canción abierta en el editor, o `null`. Sobrevive a cerrar la app. */
export function ultimaCancion(): number | null {
  try {
    const valor = Number(localStorage.getItem(CLAVE_ULTIMA));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

export function recordarCancion(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(CLAVE_ULTIMA);
    else localStorage.setItem(CLAVE_ULTIMA, String(id));
  } catch {
    // Sin almacenamiento, la app simplemente no recuerda la canción.
  }
}
