// El click de la canción abierta: lo que define el encargado (BPM, compás, primer
// tiempo, conteo de entrada) y cómo suena (volumen, encendido). También cómo suena
// la voz guía (encendida, volumen, anticipación), que cuenta sobre el mismo compás.
//
// Vive en la página de la canción, porque lo usan dos partes: el panel del BPM
// (en la fila de datos) y el editor (rejilla, marcador "1" y transporte).
// Cada cambio se ve al momento y se guarda en SQLite un instante después.

import { useEffect, useRef, useState } from "react";
import { guardarClick, type Cancion } from "./db";

export type Click = {
  /** `null`: la canción todavía no tiene click. */
  bpm: number | null;
  /** Tiempos por compás. El BPM cuenta esos tiempos: en 6/8, corcheas. */
  compas: number;
  /** Segundo donde cae el primer tiempo (el 1). */
  inicio: number;
  /** Compases de entrada que suenan antes del primer tiempo. */
  conteo: number;
  /** 1 = volumen normal. */
  volumen: number;
  activo: boolean;
  /** La voz guía va con el click: sin BPM no sabe dónde contar. */
  guiaActiva: boolean;
  guiaVolumen: number;
  /** Compases antes de cada sección; null = automático (1, o 2 si el compás es corto). */
  anticipacion: number | null;
};

/** Los compases que se ofrecen: nombre y tiempos. */
export const COMPASES = [
  { nombre: "2/4", tiempos: 2 },
  { nombre: "3/4", tiempos: 3 },
  { nombre: "4/4", tiempos: 4 },
  { nombre: "6/8", tiempos: 6 },
  { nombre: "12/8", tiempos: 12 },
];

export function nombreCompas(tiempos: number) {
  return COMPASES.find((c) => c.tiempos === tiempos)?.nombre ?? `${tiempos}/4`;
}

/** Segundos que dura un compás. */
export function segundosPorCompas(click: Click) {
  return click.bpm ? (60 / click.bpm) * click.compas : 0;
}

const ESPERA_GUARDAR_MS = 400;

function desdeCancion(c: Cancion): Click {
  return {
    bpm: c.bpm,
    compas: c.compas,
    inicio: c.inicio_click,
    conteo: c.conteo,
    volumen: c.click_volumen,
    activo: !!c.click_activo,
    guiaActiva: !!c.guia_activa,
    guiaVolumen: c.guia_volumen,
    anticipacion: c.anticipacion,
  };
}

/** El click de la canción y la función para cambiarlo. */
export function useClick(cancion: Cancion | null | undefined) {
  // Se guarda junto con el id: al abrir otra canción no se ve el click de la anterior.
  const [estado, setEstado] = useState<{ id: number; click: Click } | null>(null);
  // Una espera por canción: cambiar de canción no corta el guardado de la anterior.
  const esperas = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const id = cancion?.id;
  useEffect(() => {
    if (cancion) setEstado({ id: cancion.id, click: desdeCancion(cancion) });
    // Solo al cambiar de canción: después manda la copia local.
  }, [id]);

  const click = estado && estado.id === id ? estado.click : cancion ? desdeCancion(cancion) : null;

  function cambiar(cambio: Partial<Click>) {
    if (!click || id === undefined) return;
    const nuevo = { ...click, ...cambio };
    setEstado({ id, click: nuevo });
    // El fader y "tocar el tempo" mandan muchos cambios: se guarda solo el último.
    clearTimeout(esperas.current.get(id));
    esperas.current.set(id, setTimeout(() => {
      guardarClick(id, {
        bpm: nuevo.bpm,
        compas: nuevo.compas,
        inicio_click: nuevo.inicio,
        conteo: nuevo.conteo,
        click_volumen: nuevo.volumen,
        click_activo: nuevo.activo ? 1 : 0,
        guia_activa: nuevo.guiaActiva ? 1 : 0,
        guia_volumen: nuevo.guiaVolumen,
        anticipacion: nuevo.anticipacion,
      }).catch((e) => console.error("No se pudo guardar el click", e));
    }, ESPERA_GUARDAR_MS));
  }

  return [click, cambiar] as const;
}
