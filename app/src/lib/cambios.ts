// Aviso de "algo cambió en la biblioteca" para toda la app.
//
// La biblioteca (a la izquierda) y la canción abierta (a la derecha) leen los
// mismos datos de SQLite. Cuando uno cambia algo (renombrar, mover, terminar
// una separación), llama a `avisarCambio()`, y los demás vuelven a leer.
// Es un contador con `useSyncExternalStore`: muy liviano.

import { useSyncExternalStore } from "react";

let version = 0;
const oyentes = new Set<() => void>();

export function avisarCambio() {
  version++;
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Cambia cada vez que alguien avisa un cambio: úsalo como dependencia para recargar. */
export function useVersion() {
  return useSyncExternalStore(suscribir, () => version);
}
