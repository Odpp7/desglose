// Las secciones de la canción (Intro, Verso 1, Coro 1...).
//
// Van una tras otra y cubren toda la canción, como las regiones de REAPER: cada
// una empieza en `inicio` y termina donde empieza la siguiente (la última, al
// final de la canción). La primera siempre empieza en 0.
//
// Solo se guarda el TIPO ("Verso"); el número se calcula al mostrarla, en orden:
// si hay dos versos son "Verso 1" y "Verso 2"; si hay un solo puente, "Puente".
//
// Arriba van funciones puras (reciben la lista y devuelven una nueva); abajo, el
// hook `useSecciones`, que las guarda en SQLite y permite deshacer y rehacer.

import { useEffect, useRef, useState } from "react";
import { guardarSecciones, listarSecciones, type FilaSeccion } from "./db";

export type Seccion = FilaSeccion;

/** Los tipos que se ofrecen, con su color. "Sección" es la recién cortada, sin nombre aún. */
export const TIPOS = [
  { tipo: "Intro", color: "#5d6880" },
  { tipo: "Verso", color: "#9583f2" },
  { tipo: "Pre-coro", color: "#e2a65a" },
  { tipo: "Coro", color: "#4fc8b1" },
  { tipo: "Post-coro", color: "#3fa0c8" },
  { tipo: "Puente", color: "#e682a8" },
  { tipo: "Instrumental", color: "#c8b04f" },
  { tipo: "Solo", color: "#e07a5f" },
  { tipo: "Break", color: "#8a94a8" },
  { tipo: "Final", color: "#5d6880" },
];
export const SIN_NOMBRE = "Sección";

export function colorDe(tipo: string) {
  return TIPOS.find((t) => t.tipo === tipo)?.color ?? "#4a5266";
}

/** Una sección no puede durar menos que esto (al cortar o al mover un borde). */
export const MINIMO_SEGUNDOS = 1;

/** Los nombres para mostrar, en el mismo orden: "Verso 1", "Coro 1", "Puente"... */
export function nombres(secciones: Seccion[]): string[] {
  const total = new Map<string, number>();
  for (const s of secciones) total.set(s.tipo, (total.get(s.tipo) ?? 0) + 1);
  const visto = new Map<string, number>();
  return secciones.map((s) => {
    const n = (visto.get(s.tipo) ?? 0) + 1;
    visto.set(s.tipo, n);
    return total.get(s.tipo)! > 1 ? `${s.tipo} ${n}` : s.tipo;
  });
}

/** Dónde termina cada sección. */
export function fin(secciones: Seccion[], indice: number, duracion: number) {
  return secciones[indice + 1]?.inicio ?? duracion;
}

/** Índice de la sección que suena en `segundos`. */
export function indiceEn(secciones: Seccion[], segundos: number) {
  let indice = 0;
  secciones.forEach((s, i) => {
    if (s.inicio <= segundos) indice = i;
  });
  return indice;
}

/** Empieza a mano: una sola sección que cubre toda la canción. */
export function empezar(): Seccion[] {
  return [{ inicio: 0, tipo: "Intro", origen: "manual" }];
}

/**
 * Corta en `segundos`: la sección que suena se parte en dos y la nueva queda
 * "Sección" (sin nombre) para nombrarla después. Si queda muy cerca de un
 * borde, no hace nada (devuelve la misma lista).
 */
export function dividir(secciones: Seccion[], segundos: number, duracion: number): Seccion[] {
  if (secciones.length === 0) return secciones;
  const i = indiceEn(secciones, segundos);
  if (segundos - secciones[i].inicio < MINIMO_SEGUNDOS) return secciones;
  if (fin(secciones, i, duracion) - segundos < MINIMO_SEGUNDOS) return secciones;
  const nueva: Seccion = { inicio: redondear(segundos), tipo: SIN_NOMBRE, origen: "manual" };
  return [...secciones.slice(0, i + 1), nueva, ...secciones.slice(i + 1)];
}

/** Mueve el borde donde empieza la sección `indice` (no la primera: esa empieza en 0). */
export function moverBorde(secciones: Seccion[], indice: number, segundos: number, duracion: number): Seccion[] {
  if (indice <= 0 || indice >= secciones.length) return secciones;
  const minimo = secciones[indice - 1].inicio + MINIMO_SEGUNDOS;
  const maximo = fin(secciones, indice, duracion) - MINIMO_SEGUNDOS;
  const inicio = redondear(Math.min(maximo, Math.max(minimo, segundos)));
  return secciones.map((s, i) => (i === indice ? { ...s, inicio, origen: "manual" } : s));
}

export function renombrar(secciones: Seccion[], indice: number, tipo: string): Seccion[] {
  return secciones.map((s, i) => (i === indice ? { ...s, tipo, origen: "manual" } : s));
}

/** Une la sección con la siguiente: queda una sola, con el nombre de la primera. */
export function unirConSiguiente(secciones: Seccion[], indice: number): Seccion[] {
  if (indice + 1 >= secciones.length) return secciones;
  return secciones.filter((_, i) => i !== indice + 1);
}

/**
 * Borra la sección: su tiempo pasa a la anterior. Si es la primera, a la
 * siguiente (que pasa a empezar en 0). Si era la única, no quedan secciones.
 */
export function borrar(secciones: Seccion[], indice: number): Seccion[] {
  if (secciones.length <= 1) return [];
  if (indice === 0) return secciones.slice(1).map((s, i) => (i === 0 ? { ...s, inicio: 0 } : s));
  return secciones.filter((_, i) => i !== indice);
}

/**
 * Pega un tiempo a la línea de compás más cercana del click. Así las secciones
 * empiezan justo en un compás, como en una secuencia hecha a mano.
 */
export function alCompas(segundos: number, inicioClick: number, segundosPorCompas: number) {
  if (segundosPorCompas <= 0) return segundos;
  const n = Math.round((segundos - inicioClick) / segundosPorCompas);
  return Math.max(0, inicioClick + n * segundosPorCompas);
}

function redondear(segundos: number) {
  return Math.round(segundos * 1000) / 1000;
}

// ---------- Hook: guardar, deshacer y rehacer ----------

const ESPERA_GUARDAR_MS = 300;
const PASOS_DESHACER = 100;

/**
 * Las secciones de la canción. `cambiar(nueva)` muestra el cambio al momento, lo
 * anota para deshacer y lo guarda en SQLite un instante después.
 * `undefined` mientras se leen de la base.
 */
export function useSecciones(cancionId: number) {
  const [secciones, setSecciones] = useState<Seccion[] | undefined>(undefined);
  const pasado = useRef<Seccion[][]>([]);
  const futuro = useRef<Seccion[][]>([]);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, setVersion] = useState(0); // para que los botones Deshacer/Rehacer se actualicen

  useEffect(() => {
    let vigente = true;
    listarSecciones(cancionId).then(
      (filas) => vigente && setSecciones(filas),
      () => vigente && setSecciones([]),
    );
    return () => {
      vigente = false;
    };
  }, [cancionId]);

  function guardar(lista: Seccion[]) {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      guardarSecciones(cancionId, lista).catch((e) => console.error("No se pudieron guardar las secciones", e));
    }, ESPERA_GUARDAR_MS);
  }

  function cambiar(nueva: Seccion[]) {
    if (!secciones || nueva === secciones) return;
    pasado.current = [...pasado.current, secciones].slice(-PASOS_DESHACER);
    futuro.current = [];
    setSecciones(nueva);
    guardar(nueva);
  }

  function deshacer() {
    const anterior = pasado.current[pasado.current.length - 1] as Seccion[] | undefined;
    if (!anterior || !secciones) return;
    pasado.current = pasado.current.slice(0, -1);
    futuro.current = [...futuro.current, secciones];
    setSecciones(anterior);
    guardar(anterior);
    setVersion((v) => v + 1);
  }

  function rehacer() {
    const siguiente = futuro.current[futuro.current.length - 1] as Seccion[] | undefined;
    if (!siguiente || !secciones) return;
    futuro.current = futuro.current.slice(0, -1);
    pasado.current = [...pasado.current, secciones];
    setSecciones(siguiente);
    guardar(siguiente);
    setVersion((v) => v + 1);
  }

  return {
    secciones,
    cambiar,
    deshacer,
    rehacer,
    puedeDeshacer: pasado.current.length > 0,
    puedeRehacer: futuro.current.length > 0,
  };
}
