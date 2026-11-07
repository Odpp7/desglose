import type { EstadoCancion as Estado } from "../lib/db";
import { useAvance } from "../lib/secuencia";

// Etiqueta pequeña con el estado de la canción: Sin secuencia, Separando 1/2, Lista o Falló.

const ESTILOS: Record<Estado, string> = {
  nueva: "bg-ink-3 text-fg-2",
  separando: "bg-[#22305e] text-accent",
  lista: "bg-[#173a33] text-[#7fe0c8]",
  error: "bg-[#3a1d24] text-[#ffb3bd]",
};

export function EstadoCancion({ cancionId, estado }: { cancionId: number; estado: Estado }) {
  const avance = useAvance(cancionId);
  // Una parte opcional (voces, guitarras, synth) se separa con la canción ya lista.
  if (estado === "lista" && avance) estado = "separando";
  const texto = {
    nueva: "Sin secuencia",
    separando: avance && avance.etapa > 0 ? `Separando ${avance.etapa}/${avance.etapas.length}` : "Separando…",
    lista: "Lista",
    error: "Falló",
  }[estado];

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${ESTILOS[estado]}`}>{texto}</span>
  );
}
