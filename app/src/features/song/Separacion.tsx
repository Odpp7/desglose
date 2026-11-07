import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Cancion } from "../../lib/db";
import type { PistaMotor } from "../../lib/engine";
import {
  cancelarSecuencia,
  crearSecuencia,
  filaMvsep,
  useAvance,
  type Avance,
  type Fila,
  type Modo,
} from "../../lib/secuencia";

// Piezas de "separar con MVSep" que usan la página de la canción y el editor:
// cómo está la fila, el avance por etapas y las separaciones opcionales.

/** Cómo está la fila gratis de MVSep ahora y cuánto podría tardar un trabajo. */
export function EstadoFila() {
  const [fila, setFila] = useState<Fila | null>(null);
  useEffect(() => {
    filaMvsep().then(setFila, () => setFila(null));
  }, []);

  if (!fila || fila.enFila === null) return null;
  const porTrabajo = fila.minutosPorTrabajo;
  const larga = porTrabajo !== null && porTrabajo > 30;
  const color = larga ? "bg-[#3a311a] text-[#ffe08a]" : "bg-ink-2 text-fg-2";

  return (
    <p className={`mt-4 rounded-lg px-4 py-3 leading-relaxed ${color}`}>
      Fila de MVSep ahora: <b className="font-semibold">{fila.enFila} trabajos</b>.
      {porTrabajo !== null && (
        <>
          {" "}
          Podría tardar <b className="font-semibold">{formatoMinutos(porTrabajo)}</b>.
        </>
      )}
      {larga && " Si no es urgente, puedes intentarlo más tarde."}
    </p>
  );
}

/** 45 → "unos 45 min"; 130 → "unas 2 h 10 min" */
export function formatoMinutos(minutos: number) {
  if (minutos < 60) return `unos ${Math.max(1, minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `unas ${h} h${m ? ` ${m} min` : ""}`;
}

export function FaltaClave() {
  return (
    <p className="mt-5 rounded-lg bg-ink-2 px-4 py-3 leading-relaxed text-fg-2">
      Para separar falta la clave de MVSep.{" "}
      <Link to="/ajustes" className="font-semibold text-accent hover:underline">
        Agrégala en Ajustes
      </Link>
      .
    </p>
  );
}

/** Las etapas de una separación con su avance. */
export function Progreso({ titulo, avance }: { titulo: string; avance: Avance | undefined }) {
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-[14px] font-semibold">{titulo}</h2>
        {avance && <TiempoTranscurrido desde={avance.desde} />}
      </div>
      {avance && avance.etapas.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {avance.etapas.map((nombre, i) => (
            <Etapa key={nombre} numero={i + 1} nombre={nombre} avance={avance} />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-fg-2">Empezando…</p>
      )}
    </>
  );
}

function Etapa({ numero, nombre, avance }: { numero: number; nombre: string; avance: Avance }) {
  const hecha = numero < avance.etapa;
  const enCurso = numero === avance.etapa;

  return (
    <li className={`flex items-start gap-3 rounded-lg px-3 py-2 ${enCurso ? "bg-ink-2" : ""}`}>
      <span
        className={`mt-0.5 grid size-5 flex-none place-items-center rounded-full text-[10px] font-semibold ${
          hecha
            ? "bg-[#173a33] text-[#7fe0c8]"
            : enCurso
              ? "animate-pulse bg-accent text-accent-ink"
              : "border border-line-2 text-fg-3"
        }`}
      >
        {hecha ? "✓" : numero}
      </span>
      <div className="min-w-0">
        <div className={hecha || enCurso ? "text-fg" : "text-fg-3"}>{nombre}</div>
        {enCurso && <div className="mt-0.5 text-[12px] text-fg-2">{avance.detalle}</div>}
      </div>
    </li>
  );
}

/** "1:02:41" o "2:41". Se actualiza cada segundo, solo este texto. */
function TiempoTranscurrido({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = Math.max(0, Math.floor((ahora - desde) / 1000));
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = String(segundos % 60).padStart(2, "0");
  return (
    <span className="font-mono text-fg-3">{h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`}</span>
  );
}

/**
 * Separaciones opcionales: qué pista dividen, cuántos trabajos son y qué pista
 * aparece cuando ya se hicieron.
 */
const OPCIONALES: {
  modo: Modo;
  pista: string;
  hecha: string;
  titulo: string;
  explicacion: string;
  trabajos: number;
}[] = [
  {
    modo: "voces",
    pista: "voz",
    hecha: "voz-lider",
    titulo: "Voz líder y coros",
    explicacion: "Divide la voz en voz líder y coros",
    trabajos: 1,
  },
  {
    modo: "guitarras",
    pista: "guitarra",
    hecha: "guitarra-acustica",
    titulo: "Guitarras",
    explicacion: "Divide la guitarra en acústica, lead y rítmica",
    trabajos: 2,
  },
  {
    modo: "synth",
    pista: "otros",
    hecha: "synth",
    titulo: "Synth",
    explicacion: "Saca el synth de \"otros\"",
    trabajos: 1,
  },
];

/**
 * Los botones "Separar" de la barra de arriba (como "Extraer" en la captura de
 * referencia). Cada uno es una separación opcional que el encargado decide hacer.
 * Muestran si ya se hizo (✓), si no aplica (la pista no existe o casi no suena)
 * o si se puede hacer. Mientras una corre, se ve su avance en una línea.
 */
export function BotonesSeparar({
  cancion,
  pistas,
  hayClave,
}: {
  cancion: Cancion;
  pistas: PistaMotor[];
  hayClave: boolean;
}) {
  const avance = useAvance(cancion.id);
  const tiene = (instrumento: string, sonando = false) =>
    pistas.some((p) => p.instrumento === instrumento && (!sonando || !p.vacia));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Separar</span>
        {OPCIONALES.map((o) => {
          const hecha = tiene(o.hecha);
          const aplica = tiene(o.pista, true);
          const corriendo = avance?.modo === o.modo;
          const deshabilitado = hecha || !aplica || !!avance || !hayClave;
          const titulo = hecha
            ? "Ya está separada"
            : !aplica
              ? `Esta canción casi no tiene ${o.pista === "otros" ? "\"otros\"" : o.pista}`
              : !hayClave
                ? "Falta la clave de MVSep (Ajustes)"
                : `${o.explicacion}. ${o.trabajos === 1 ? "1 trabajo" : `${o.trabajos} trabajos`} en la fila de MVSep.`;
          return (
            <button
              key={o.modo}
              disabled={deshabilitado}
              title={titulo}
              onClick={() => crearSecuencia(cancion.id, o.modo)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${
                corriendo
                  ? "animate-pulse border-accent bg-[#22305e] text-accent"
                  : hecha
                    ? "border-[#2a5a4f] bg-[#173a33] text-[#7fe0c8]"
                    : !aplica || !hayClave
                      ? "border-line text-fg-3 opacity-50"
                      : "border-line-2 bg-ink-2 text-fg hover:border-accent/70 disabled:opacity-50"
              }`}
            >
              {hecha && "✓ "}
              {o.titulo}
            </button>
          );
        })}
      </div>

      {avance ? (
        <AvanceCorto avance={avance} />
      ) : cancion.error ? (
        <p className="m-0 text-[12px] text-[#ffb3bd]">La última separación falló: {cancion.error}</p>
      ) : !hayClave ? (
        <p className="m-0 text-[12px] text-fg-3">
          Para separar más falta la clave de MVSep.{" "}
          <Link to="/ajustes" className="text-accent hover:underline">
            Ajustes
          </Link>
        </p>
      ) : (
        <p className="m-0 text-[12px] text-fg-3">Opcional: cada una hace la fila de MVSep aparte.</p>
      )}
    </div>
  );
}

/**
 * "Cancelar": avisa a Rust y queda en "Cancelando…" hasta que la separación
 * termina de verdad (un instante, o lo que tarde en bajar un archivo).
 */
export function BotonCancelar() {
  const [cancelando, setCancelando] = useState(false);
  return (
    <button
      disabled={cancelando}
      onClick={() => {
        setCancelando(true);
        cancelarSecuencia().catch(() => setCancelando(false));
      }}
      className="flex-none rounded-md border border-line-2 px-2.5 py-1 text-[12px] font-semibold text-fg-2 hover:border-[#7b3a45] hover:text-[#ffb3bd] disabled:opacity-60"
    >
      {cancelando ? "Cancelando…" : "Cancelar"}
    </button>
  );
}

/** "Separando · 1/3 Separar la guitarra acústica · En fila 120 de 400 · 12:03" */
function AvanceCorto({ avance }: { avance: Avance }) {
  const nombre = avance.etapas[avance.etapa - 1] ?? "Empezando";
  return (
    <p className="m-0 flex min-w-0 items-center gap-2 text-[12px] text-fg-2">
      <span className="size-2 flex-none animate-pulse rounded-full bg-accent" />
      <span className="truncate">
        {avance.etapa > 0 && `${avance.etapa}/${avance.etapas.length} · `}
        {nombre} · {avance.detalle}
      </span>
      <TiempoTranscurrido desde={avance.desde} />
      <BotonCancelar />
    </p>
  );
}
