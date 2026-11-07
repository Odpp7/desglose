// Órdenes al motor de audio en Rust.
// `invoke` llama a una función de `src-tauri/src/commands.rs` por su nombre;
// `listen` recibe los avisos que el motor manda solo (aquí, "estado").
// Ningún componente llama a `invoke` directamente: todo pasa por este archivo.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Lo que el motor avisa unas 30 veces por segundo. */
export type EstadoMotor = {
  reproduciendo: boolean;
  terminado: boolean;
  /** Veces que la tarjeta se quedó sin audio. Debe ser 0. */
  cortes: number;
  /** Segundos. */
  posicion: number;
  /** Segundos. */
  duracion: number;
};

export const motor = {
  /** Abre todos los FLAC y WAV de una carpeta. Devuelve sus nombres en orden. */
  cargarCarpeta: (carpeta: string) => invoke<string[]>("cargar_carpeta", { carpeta }),
  play: () => invoke<void>("play"),
  pausa: () => invoke<void>("pausa"),
  buscar: (segundos: number) => invoke<void>("buscar", { segundos }),
  /** El click es una pista más, con índice = cantidad de pistas. */
  click: (bpm: number, tiempos: number, inicio: number) =>
    invoke<void>("click", { bpm, tiempos, inicio }),
  estudio: (velocidad: number, semitonos: number) =>
    invoke<void>("estudio", { velocidad, semitonos }),
  exportar: () => invoke<string>("exportar"),
  volumen: (indice: number, valor: number) => invoke<void>("volumen", { indice, valor }),
  mute: (indice: number, valor: boolean) => invoke<void>("mute", { indice, valor }),
  solo: (indice: number, valor: boolean) => invoke<void>("solo", { indice, valor }),
};

/** Escucha el estado del motor. Devuelve la función para dejar de escuchar. */
export function escucharEstado(alRecibir: (estado: EstadoMotor) => void): Promise<UnlistenFn> {
  return listen<EstadoMotor>("estado", (evento) => alRecibir(evento.payload));
}

export function formatoTiempo(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  const resto = Math.floor(segundos % 60);
  const decima = Math.floor((segundos * 10) % 10);
  return `${minutos}:${String(resto).padStart(2, "0")}.${decima}`;
}
