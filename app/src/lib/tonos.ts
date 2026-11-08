// Los tonos en cifrado americano y cómo transponerlos.
// Se escriben como los suelen escribir los músicos: Bb y no A#, F# y no Gb.

export const MAYORES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MENORES = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

/**
 * El tono que queda al subir o bajar `semitonos`.
 * transponer("A", 2) → "B"; transponer("Em", -2) → "Dm"; transponer(null, 1) → null.
 */
export function transponer(tono: string | null, semitonos: number): string | null {
  if (!tono) return null;
  const lista = MAYORES.includes(tono) ? MAYORES : MENORES.includes(tono) ? MENORES : null;
  if (!lista) return tono;
  const i = lista.indexOf(tono);
  return lista[(((i + semitonos) % 12) + 12) % 12];
}

/** 2 → "+2", -1 → "−1", 0 → "0" */
export function formatoSemitonos(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}
