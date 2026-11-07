// Formatos de números para mostrar.

/** 290000 → "4:50" */
export function formatoDuracion(ms: number) {
  if (!ms) return "—";
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/** Volumen (1 = normal) a decibeles: 1 → "0.0", 0.84 → "-1.5", 0 → "-∞". */
export function formatoDb(volumen: number) {
  if (volumen <= 0.0001) return "-∞";
  const db = 20 * Math.log10(volumen);
  return `${db > 0.05 ? "+" : ""}${db.toFixed(1)}`;
}

/** Minúsculas y sin tildes: "Canción" y "cancion" se encuentran igual. */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
