// Lo que la app recuerda mientras está abierta (y un poco más):
//   - la última canción abierta, para que "Editor" vuelva a ella;
//   - la mezcla de cada canción (volumen, mute, solo), para que al volver al
//     editor todo siga como estaba. En el paso 4b la mezcla pasa a SQLite.

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
    // Sin almacenamiento, "Editor" simplemente no recuerda la canción.
  }
}

export type EstadoPista = { volumen: number; mute: boolean; solo: boolean };

const mezclas = new Map<number, Map<string, EstadoPista>>();

export const PISTA_NUEVA: EstadoPista = { volumen: 1, mute: false, solo: false };

/** La mezcla de una canción: por instrumento. */
export function mezclaDe(cancionId: number) {
  let mezcla = mezclas.get(cancionId);
  if (!mezcla) {
    mezcla = new Map();
    mezclas.set(cancionId, mezcla);
  }
  return mezcla;
}
