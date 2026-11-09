// La voz guía: dónde dice qué ("Coro, 2, 3, 4" un compás antes del coro).
//
// Son funciones puras: reciben las secciones, el click y las frases que existen,
// y devuelven la lista de avisos. Rust solo hace sonar esa lista (`motor.guia`);
// la misma lista se exporta en el paso 8: lo que se escucha es lo que se exporta.
//
// Reglas (docs/voces-guia.md):
//   - El aviso de cada sección va 1 compás antes: el nombre en el tiempo 1 y el
//     conteo en los demás ("Coro, 2, 3, 4"). Con 2 compases, el nombre en el
//     primero y "1, 2, 3, 4" en el segundo.
//   - Automático: 1 compás, o 2 si el compás dura menos de 1,6 s (canciones rápidas).
//   - La primera sección se anuncia en el compás de conteo, antes del primer tiempo.
//   - Si el nombre es largo, se saltan los números que lo pisarían ("Instrumental… 3, 4").
//   - 3/4 cuenta "Coro, 2, 3"; 6/8 cuenta en 2 ("Coro, 2"); 12/8 en 4.
//   - Las secciones de menos de un compás no llevan aviso.
//   - Si no existe la frase "Coro 4", dice "Coro"; si no existe ni eso (Break,
//     Sección), solo cuenta.

import { segundosPorCompas, type Click } from "./click";
import type { AvisoLibre } from "./db";
import { nombres, type Seccion } from "./secciones";

/** Frases disponibles: nombre → segundos que dura. */
export type Frases = Map<string, number>;

/** Lo que se dibuja en la franja GUÍA: un aviso de sección o uno libre. */
export type Marca =
  | {
      clase: "seccion";
      indice: number;
      /** Segundo donde empieza a hablar. */
      inicio: number;
      /** Segundo donde empieza la sección. */
      fin: number;
      /** Lo que dice, para mostrarlo: "Coro 1 · 2 3 4". */
      texto: string;
      /** Compases de anticipación que usa. */
      compases: number;
      /** El encargado le quitó el aviso: se dibuja tenue, para poder volver a ponerlo. */
      apagada: boolean;
    }
  | { clase: "libre"; aviso: AvisoLibre };

/** Una frase que suena en un segundo de la canción: lo que recibe el motor. */
export type Evento = [segundo: number, frase: string];

/** Si un compás dura menos que esto, se avisa con 2 compases. */
const COMPAS_CORTO = 1.6;
/** Margen para que un número no se monte sobre el final del nombre. */
const MARGEN = 0.05;

/** Cada cuántos tiempos se cuenta: 6/8 y 12/8 se cuentan de a 3 corcheas. */
export function pasoDeConteo(compas: number) {
  return compas > 3 && compas % 3 === 0 ? 3 : 1;
}

/** Compases de anticipación de la canción (si no la eligió el encargado). */
export function anticipacionAutomatica(click: Click) {
  return segundosPorCompas(click) < COMPAS_CORTO ? 2 : 1;
}

/** La frase que se dice para una sección, o null si no hay ninguna grabada. */
export function fraseDeSeccion(seccion: Seccion, nombre: string, frases: Frases): string | null {
  const pedida = seccion.aviso ?? nombre;
  if (frases.has(pedida)) return pedida;
  // "Coro 4" no está grabada: se dice "Coro".
  if (frases.has(seccion.tipo)) return seccion.tipo;
  return null;
}

/**
 * Calcula la guía completa. Devuelve los eventos para el motor y las marcas para
 * dibujar. Sin BPM no hay guía (no sabe dónde contar).
 */
export function calcularGuia(
  secciones: Seccion[],
  libres: AvisoLibre[],
  click: Click,
  duracion: number,
  frases: Frases,
): { eventos: Evento[]; marcas: Marca[] } {
  const eventos: Evento[] = [];
  const marcas: Marca[] = [];
  if (!click.bpm || frases.size === 0) return { eventos, marcas };

  const tiempo = 60 / click.bpm;
  const compas = tiempo * click.compas;
  const paso = pasoDeConteo(click.compas);
  const cuentas = click.compas / paso; // números por compás: 4/4 → 4, 6/8 → 2
  const porDefecto = click.anticipacion ?? anticipacionAutomatica(click);
  const etiquetas = nombres(secciones);

  secciones.forEach((seccion, i) => {
    const fin = secciones[i + 1]?.inicio ?? duracion;
    // La primera se anuncia antes del primer tiempo del click, no en el segundo 0.
    const empieza = i === 0 ? Math.max(seccion.inicio, click.inicio) : seccion.inicio;
    if (fin - empieza < compas) return; // menos de un compás: sin aviso

    const compases = seccion.anticipacion ?? porDefecto;
    const inicio = empieza - compases * compas;
    const frase = fraseDeSeccion(seccion, etiquetas[i], frases);
    const apagada = !!seccion.sin_aviso;

    // Lo que se dice: el nombre al principio y el conteo en el último compás.
    const dichos: Evento[] = [];
    if (frase) dichos.push([inicio, frase]);
    const ocupadoHasta = frase ? inicio + (frases.get(frase) ?? 0) + MARGEN : -Infinity;
    const ultimo = empieza - compas;
    for (let n = 1; n <= cuentas; n++) {
      // Con 1 compás, el "1" es el nombre. Con 2, el último compás cuenta desde 1.
      if (n === 1 && compases === 1 && frase) continue;
      const segundo = ultimo + (n - 1) * paso * tiempo;
      if (segundo < ocupadoHasta) continue; // el nombre largo pisa este número
      if (frases.has(String(n))) dichos.push([segundo, String(n)]);
    }

    const validos = dichos.filter(([s]) => s >= 0);
    if (!apagada) eventos.push(...validos);
    marcas.push({
      clase: "seccion",
      indice: i,
      inicio: Math.max(0, inicio),
      fin: empieza,
      texto: textoDe(validos, frase),
      compases,
      apagada,
    });
  });

  for (const aviso of libres) {
    if (frases.has(aviso.frase)) eventos.push([aviso.segundo, aviso.frase]);
    marcas.push({ clase: "libre", aviso });
  }

  eventos.sort((a, b) => a[0] - b[0]);
  return { eventos, marcas };
}

/** "Coro 1 · 2 3 4": el nombre y los números que se dicen. */
function textoDe(dichos: Evento[], frase: string | null) {
  const numeros = dichos.filter(([, f]) => f !== frase).map(([, f]) => f);
  if (!frase) return numeros.join(" ") || "—";
  return numeros.length ? `${frase} · ${numeros.join(" ")}` : frase;
}

/** Pega un segundo al tiempo (pulso) más cercano del click. */
export function alTiempo(segundo: number, click: Click) {
  if (!click.bpm) return segundo;
  const tiempo = 60 / click.bpm;
  return Math.max(0, click.inicio + Math.round((segundo - click.inicio) / tiempo) * tiempo);
}
