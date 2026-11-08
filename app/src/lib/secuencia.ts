// "Crear secuencia" (`src-tauri/src/secuencia.rs`).
//
// Por partes, porque en MVSep gratis CADA trabajo hace la fila completa:
//   base:      1 trabajo  → voz, batería, bajo, piano, guitarra, otros. Es "Crear secuencia".
//   voces:     1 trabajo  → la voz se divide en voz líder y coros.     Opcional.
//   guitarras: 2 trabajos → la guitarra en acústica, lead y rítmica.   Opcional.
//   synth:     1 trabajo  → saca el synth de "otros".                  Opcional.
// Mientras se hace una parte opcional, la canción sigue "lista": sus pistas se pueden usar.
//
// Rust hace el trabajo en un hilo aparte y avisa con dos eventos:
//   "secuencia-avance": en qué etapa va ("En fila en MVSep: 120 de 403").
//   "secuencia-fin":    las pistas, o el error.
//
// Este archivo los escucha UNA sola vez para toda la app (desde main.tsx),
// no dentro de una pantalla: así, si el encargado se va a la biblioteca
// mientras se separa, el resultado igual se guarda en SQLite.
//
// Las pantallas leen el avance con `useAvance(id)`. Es una tienda mínima
// hecha con `useSyncExternalStore` de React: solo se vuelven a dibujar los
// componentes que miran esa canción, y solo cuando cambia algo.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { avisarCambio } from "./cambios";
import { cambiarEstado, guardarPistas, listarCanciones, listarPistas } from "./db";

export type Modo = "base" | "voces" | "guitarras" | "synth";

export type Avance = {
  modo: Modo;
  /** Nombres de las etapas de este modo (los manda Rust). */
  etapas: string[];
  /** De 1 a `etapas.length`. 0 mientras empieza. */
  etapa: number;
  detalle: string;
  /** Cuándo empezó (milisegundos), para mostrar el tiempo que lleva. */
  desde: number;
};

/** Cómo está la fila gratis de MVSep. Cualquier dato puede faltar. */
export type Fila = {
  enFila: number | null;
  porMinuto: number | null;
  minutosPorTrabajo: number | null;
};

type EventoAvance = { cancionId: number; etapas: string[]; etapa: number; detalle: string };
/** Una pista como la describe Rust (también es lo que guarda en `pistas/lista.json`). */
type PistaRust = { instrumento: string; archivo: string; vacia: boolean };
type EventoFin = { cancionId: number; pistas: PistaRust[] | null; error: string | null; cancelada: boolean };

const avances = new Map<number, Avance>();
const oyentes = new Set<() => void>();

function notificar() {
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** El avance de una canción mientras se separa, o `undefined`. */
export function useAvance(cancionId: number) {
  return useSyncExternalStore(suscribir, () => avances.get(cancionId));
}

/** Cambia cuando algo cambia en la biblioteca (por ejemplo, termina una separación). */
export { useVersion as useVersionSecuencias } from "./cambios";

/**
 * Cancela la separación en curso. La app le avisa a MVSep y borra lo que quedó
 * a medias. Si era la separación base, la canción vuelve a "Sin secuencia";
 * si era una opcional, la canción sigue con las pistas que ya tenía.
 */
export function cancelarSecuencia() {
  return invoke<void>("cancelar_secuencia");
}

export function filaMvsep() {
  return invoke<Fila>("fila_mvsep");
}

/**
 * Empieza a separar. Si no puede empezar, lo deja anotado en la canción:
 * la base pasa a "error"; una parte opcional deja la canción "lista"
 * (ya tiene sus pistas) y solo anota el error.
 */
export async function crearSecuencia(cancionId: number, modo: Modo = "base") {
  if (modo === "base") await cambiarEstado(cancionId, "separando");
  avances.set(cancionId, { modo, etapas: [], etapa: 0, detalle: "Empezando", desde: Date.now() });
  notificar();
  avisarCambio();
  try {
    await invoke("crear_secuencia", { id: cancionId, modo });
  } catch (e) {
    await terminarConError(cancionId, String(e));
  }
}

async function terminarConError(cancionId: number, error: string) {
  const modo = avances.get(cancionId)?.modo ?? "base";
  avances.delete(cancionId);
  await cambiarEstado(cancionId, modo === "base" ? "error" : "lista", error);
  notificar();
  avisarCambio();
}

let iniciado = false;

/** Se llama una vez al abrir la app. */
export async function iniciarSecuencias() {
  if (iniciado) return;
  iniciado = true;

  await listen<EventoAvance>("secuencia-avance", ({ payload }) => {
    const antes = avances.get(payload.cancionId);
    avances.set(payload.cancionId, {
      modo: antes?.modo ?? "base",
      etapas: payload.etapas,
      etapa: payload.etapa,
      detalle: payload.detalle,
      desde: antes?.desde ?? Date.now(),
    });
    notificar();
  });

  await listen<EventoFin>("secuencia-fin", async ({ payload }) => {
    const id = payload.cancionId;
    if (payload.cancelada) {
      const modo = avances.get(id)?.modo ?? "base";
      avances.delete(id);
      await cambiarEstado(id, modo === "base" ? "nueva" : "lista");
      notificar();
      avisarCambio();
      return;
    }
    if (!payload.pistas) {
      await terminarConError(id, payload.error ?? "Falló sin explicación");
      return;
    }
    await guardarPistas(id, payload.pistas);
    await cambiarEstado(id, "lista");
    avances.delete(id);
    notificar();
    avisarCambio();
  });

  await ponerAlDia();
  notificar();
  avisarCambio();
}

/**
 * Compara lo que hay en el disco con SQLite y corrige la base. Cubre dos casos:
 * - Una separación terminó pero el aviso "secuencia-fin" se perdió (la app se
 *   cerró justo en ese momento): Rust dejó `pistas/lista.json`, y de ahí se toman.
 * - La app se cerró a mitad de la separación base: la canción quedó "separando"
 *   para siempre. Pasa a "error" para reintentar (lo ya separado no se repite y,
 *   si MVSep todavía tiene el trabajo, se retoma sin volver a hacer la fila).
 */
async function ponerAlDia() {
  const enCurso = await invoke<number | null>("secuencia_en_curso");
  for (const cancion of await listarCanciones()) {
    if (cancion.id === enCurso || cancion.estado === "nueva") continue;

    const enDisco = await invoke<PistaRust[] | null>("pistas_guardadas", { id: cancion.id });
    if (enDisco && enDisco.length > 0) {
      // Se comparan solo las separadas: las propias no están en `lista.json`.
      const enBase = (await listarPistas(cancion.id)).filter((p) => !p.propia);
      const iguales = enBase.map((p) => p.instrumento).join() === enDisco.map((p) => p.instrumento).join();
      if (cancion.estado !== "lista" || !iguales) {
        await guardarPistas(cancion.id, enDisco);
        await cambiarEstado(cancion.id, "lista");
      }
    } else if (cancion.estado === "separando") {
      await cambiarEstado(
        cancion.id,
        "error",
        "Se interrumpió porque se cerró la app. Reintenta: lo ya separado no se repite y se retoma el lugar en la fila.",
      );
    }
  }
}
