// "Tocar el tempo": el encargado toca al ritmo de la canción (clic o tecla T) y
// la app saca el BPM del promedio de los últimos toques.
//
// Son funciones puras (sin React): reciben los toques y devuelven el resultado.

/** Si pasa más que esto entre dos toques, se empieza a contar de nuevo. */
const PAUSA_REINICIO_MS = 2000;
/** Se promedian los últimos toques: los primeros suelen salir desparejos. */
const TOQUES_MAXIMOS = 9;

export const BPM_MINIMO = 30;
export const BPM_MAXIMO = 300;

/** Agrega un toque (en milisegundos, por ejemplo `performance.now()`). */
export function agregarToque(toques: number[], ahora: number): number[] {
  const ultimo = toques[toques.length - 1] as number | undefined;
  if (ultimo === undefined || ahora - ultimo > PAUSA_REINICIO_MS) return [ahora];
  return [...toques, ahora].slice(-TOQUES_MAXIMOS);
}

/**
 * El BPM de los toques, redondeado a entero (las canciones de estudio casi siempre
 * van a un BPM entero; se afina después con − y +). `null` con menos de 2 toques.
 */
export function bpmDeToques(toques: number[]): number | null {
  if (toques.length < 2) return null;
  const promedio = (toques[toques.length - 1] - toques[0]) / (toques.length - 1);
  return limitarBpm(Math.round(60000 / promedio));
}

export function limitarBpm(bpm: number) {
  return Math.min(BPM_MAXIMO, Math.max(BPM_MINIMO, bpm));
}
