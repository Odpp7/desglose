import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { EstadoCancion } from "../../components/EstadoCancion";
import { IconoAtras } from "../../components/icons";
import { hayClaveMvsep } from "../../lib/ajustes";
import { listarPistas, obtenerCancion, type Cancion, type Pista } from "../../lib/db";
import { instrumento } from "../../lib/instrumentos";
import {
  crearSecuencia,
  filaMvsep,
  useAvance,
  useVersionSecuencias,
  type Avance,
  type Fila,
  type Modo,
} from "../../lib/secuencia";
import { formatoDuracion } from "../library/FilaCancion";

// Página de una canción. Según su estado muestra:
//   nueva      → explicación, cómo está la fila de MVSep y "Crear secuencia" (1 trabajo).
//   separando  → el avance de la separación base.
//   error      → qué pasó y "Reintentar".
//   lista      → las pistas y, aparte, las separaciones opcionales que el
//                encargado decide hacer (voz líder y coros, guitarras, synth).
// En el paso 4 esta página se convierte en el editor.

export function CancionPage() {
  const id = Number(useParams().id);
  const [cancion, setCancion] = useState<Cancion | null | undefined>(undefined);
  const [pistas, setPistas] = useState<Pista[]>([]);
  const [hayClave, setHayClave] = useState(true);
  const version = useVersionSecuencias();

  // Se vuelve a leer cuando una separación termina.
  useEffect(() => {
    obtenerCancion(id).then(setCancion, () => setCancion(null));
    listarPistas(id).then(setPistas, () => setPistas([]));
    hayClaveMvsep().then(setHayClave, () => setHayClave(false));
  }, [id, version]);

  if (cancion === undefined) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <Link
          to="/"
          aria-label="Volver a la biblioteca"
          className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-ink-3 hover:text-fg"
        >
          <IconoAtras />
        </Link>
        <h1 className="m-0 min-w-0 truncate font-display text-lg font-semibold tracking-tight">
          {cancion?.titulo ?? "Canción no encontrada"}
        </h1>
        {cancion && (
          <>
            <span className="font-mono text-fg-3">{formatoDuracion(cancion.duracion_ms)}</span>
            <EstadoCancion cancionId={cancion.id} estado={cancion.estado} />
          </>
        )}
      </header>

      <div className="flex-1 overflow-auto">
        {cancion?.estado === "nueva" && <SinSecuencia id={id} hayClave={hayClave} />}
        {cancion?.estado === "separando" && <ProgresoBase id={id} />}
        {cancion?.estado === "error" && <Fallo id={id} mensaje={cancion.error} hayClave={hayClave} />}
        {cancion?.estado === "lista" && <Pistas cancion={cancion} pistas={pistas} hayClave={hayClave} />}
      </div>
    </div>
  );
}

function SinSecuencia({ id, hayClave }: { id: number; hayClave: boolean }) {
  return (
    <section className="mx-auto max-w-md px-6 py-16 text-center">
      <h2 className="m-0 font-display text-base font-semibold">Todavía no tiene secuencia</h2>
      <p className="mt-2 leading-relaxed text-fg-3">
        Desglose sube la canción a MVSep y la separa en voz, batería, bajo, piano, guitarra y otros. Después
        puedes separar más (voz líder y coros, guitarras, synth) solo si lo necesitas. Necesita internet.
      </p>
      {hayClave ? (
        <>
          <EstadoFila trabajos={1} />
          <button
            onClick={() => crearSecuencia(id)}
            className="mt-5 rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:brightness-110"
          >
            Crear secuencia
          </button>
        </>
      ) : (
        <FaltaClave />
      )}
    </section>
  );
}

/**
 * Cómo está la fila gratis de MVSep ahora y cuánto podría tardar.
 * Cada trabajo hace la fila completa, por eso se multiplica por `trabajos`.
 */
function EstadoFila({ trabajos }: { trabajos: number }) {
  const [fila, setFila] = useState<Fila | null>(null);
  useEffect(() => {
    filaMvsep().then(setFila, () => setFila(null));
  }, []);

  if (!fila || fila.enFila === null) return null;
  const porTrabajo = fila.minutosPorTrabajo;
  const larga = porTrabajo !== null && porTrabajo > 30;

  return (
    <p
      className={`mt-4 rounded-lg px-4 py-3 leading-relaxed ${
        larga ? "bg-[#3a311a] text-[#ffe08a]" : "bg-ink-2 text-fg-2"
      }`}
    >
      Fila de MVSep ahora: <b className="font-semibold">{fila.enFila} trabajos</b>.
      {porTrabajo !== null && (
        <>
          {" "}
          Cada trabajo podría tardar <b className="font-semibold">{formatoMinutos(porTrabajo)}</b>
          {trabajos > 1 && ` (este son ${trabajos})`}.
        </>
      )}
      {larga && " Si no es urgente, puedes intentarlo más tarde."}
    </p>
  );
}

/** 45 → "unos 45 min"; 130 → "unas 2 h 10 min" */
function formatoMinutos(minutos: number) {
  if (minutos < 60) return `unos ${Math.max(1, minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `unas ${h} h${m ? ` ${m} min` : ""}`;
}

function FaltaClave() {
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

function ProgresoBase({ id }: { id: number }) {
  const avance = useAvance(id);
  return (
    <section className="mx-auto max-w-lg px-6 py-12">
      <Progreso titulo="Creando la secuencia" avance={avance} />
      <p className="mt-6 leading-relaxed text-fg-3">
        MVSep atiende a todos los usuarios gratis en una sola fila. Puedes ir a la biblioteca o a otra canción: el
        trabajo sigue y el resultado se guarda solo. Si cierras la app se detiene, pero al reintentar se retoma el
        lugar en la fila.
      </p>
    </section>
  );
}

function Progreso({ titulo, avance }: { titulo: string; avance: Avance | undefined }) {
  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="m-0 font-display text-base font-semibold">{titulo}</h2>
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
    <li className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${enCurso ? "bg-ink-2" : ""}`}>
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

function Fallo({ id, mensaje, hayClave }: { id: number; mensaje: string | null; hayClave: boolean }) {
  return (
    <section className="mx-auto max-w-md px-6 py-16 text-center">
      <h2 className="m-0 font-display text-base font-semibold">No se pudo crear la secuencia</h2>
      <p className="mt-3 rounded-lg bg-[#3a1d24] px-4 py-3 leading-relaxed text-[#ffb3bd]">
        {mensaje ?? "Falló sin explicación."}
      </p>
      {hayClave ? (
        <>
          <button
            onClick={() => crearSecuencia(id)}
            className="mt-5 rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-accent-ink hover:brightness-110"
          >
            Reintentar
          </button>
          <p className="mt-2 text-[12px] text-fg-3">Lo que ya se separó no se repite.</p>
        </>
      ) : (
        <FaltaClave />
      )}
    </section>
  );
}

/** Separaciones opcionales: qué pista dividen, en qué, y cuántos trabajos son. */
const OPCIONALES: { modo: Modo; pista: string; titulo: string; texto: string; trabajos: number }[] = [
  {
    modo: "voces",
    pista: "voz",
    titulo: "Voz líder y coros",
    texto: "Divide la voz en voz líder y coros.",
    trabajos: 1,
  },
  {
    modo: "guitarras",
    pista: "guitarra",
    titulo: "Guitarras",
    texto: "Divide la guitarra en acústica, lead y rítmica.",
    trabajos: 2,
  },
  {
    modo: "synth",
    pista: "otros",
    titulo: "Synth",
    texto: "Saca el synth de \"otros\".",
    trabajos: 1,
  },
];

function Pistas({ cancion, pistas, hayClave }: { cancion: Cancion; pistas: Pista[]; hayClave: boolean }) {
  const avance = useAvance(cancion.id);
  const suenan = pistas.filter((p) => !p.vacia);
  const vacias = pistas.filter((p) => p.vacia);

  // Una opción sirve si su pista existe y suena (y, para el synth, si aún no se sacó).
  const disponibles = OPCIONALES.filter((o) => {
    if (o.modo === "synth" && pistas.some((p) => p.instrumento === "synth")) return false;
    return suenan.some((p) => p.instrumento === o.pista);
  });

  return (
    <section className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="m-0 font-display text-base font-semibold">{suenan.length} pistas</h2>
        <Link
          to={`/editor?cancion=${cancion.id}`}
          className="rounded-lg border border-line-2 bg-ink-3 px-3 py-1.5 font-semibold hover:text-fg"
        >
          Escuchar en el editor de prueba
        </Link>
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 p-0">
        {suenan.map((p) => (
          <FilaPista key={p.id} pista={p} />
        ))}
      </ul>

      {vacias.length > 0 && (
        <p className="mt-3 text-[12px] text-fg-3">
          Ocultas porque casi no suenan: {vacias.map((p) => instrumento(p.instrumento).nombre).join(", ")}.
        </p>
      )}

      {avance && (
        <div className="mt-8 rounded-xl border border-line-2 bg-ink-1 p-4">
          <Progreso titulo="Separando" avance={avance} />
          <p className="mt-3 mb-0 text-[12px] text-fg-3">
            Mientras tanto puedes usar las pistas que ya tienes. Si cierras la app, al volver a pulsar el botón se
            retoma el lugar en la fila.
          </p>
        </div>
      )}

      {!avance && disponibles.length > 0 && hayClave && (
        <div className="mt-8">
          <h3 className="m-0 font-display text-[14px] font-semibold">Separar más (opcional)</h3>
          <p className="mt-1 mb-0 leading-relaxed text-fg-3">
            Cada trabajo hace la fila de MVSep aparte. Haz solo lo que necesites.
          </p>
          {cancion.error && (
            <p className="mt-3 rounded-lg bg-[#3a1d24] px-3 py-2 text-[#ffb3bd]">La última vez falló: {cancion.error}</p>
          )}
          <EstadoFila trabajos={1} />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {disponibles.map((o) => (
              <div key={o.modo} className="flex flex-col rounded-xl border border-line bg-ink-1 p-4">
                <h4 className="m-0 font-semibold">{o.titulo}</h4>
                <p className="mt-1 mb-3 flex-1 text-[12px] leading-relaxed text-fg-3">
                  {o.texto} {o.trabajos === 1 ? "1 trabajo." : `${o.trabajos} trabajos.`}
                </p>
                <button
                  onClick={() => crearSecuencia(cancion.id, o.modo)}
                  className="rounded-lg border border-line-2 bg-ink-3 px-3 py-1.5 font-semibold hover:text-fg"
                >
                  Separar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FilaPista({ pista }: { pista: Pista }) {
  const { nombre, color } = instrumento(pista.instrumento);
  return (
    <li className="flex items-center gap-3 border-b border-line py-2.5">
      <span className="size-2.5 flex-none rounded-full" style={{ background: color }} />
      <span className="font-semibold">{nombre}</span>
    </li>
  );
}
