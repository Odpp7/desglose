import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { EstadoCancion } from "../../components/EstadoCancion";
import { IconoNota } from "../../components/icons";
import { hayClaveMvsep } from "../../lib/ajustes";
import { extension } from "../../lib/archivos";
import { useVersion } from "../../lib/cambios";
import { listarPistas, obtenerCancion, type Cancion } from "../../lib/db";
import type { PistaMotor } from "../../lib/engine";
import { formatoDuracion } from "../../lib/formato";
import { crearSecuencia, useAvance } from "../../lib/secuencia";
import { recordarCancion } from "../../lib/sesion";
import { Editor } from "../editor/Editor";
import { BotonCancelar, BotonesSeparar, EstadoFila, FaltaClave, Progreso } from "./Separacion";

// La canción abierta, a la derecha de la biblioteca (como en la captura de referencia):
//
//   ┌ SEPARAR [Voz líder y coros] [Guitarras] [Synth] ─────┬ CANCIÓN ─────────┐
//   │ Opcional: cada una hace la fila aparte                │ Yo soy la ofrenda │
//   └──────────────────────────────────────────────────────┴──────────────────┘
//   TONALIDAD —  │  BPM —  │  DURACIÓN 4:55  │  PISTAS 7  │   ✓ Separar · 2 Click …
//   (editor: pistas, ondas y transporte)
//
// Si la canción todavía no está separada, debajo va "Crear secuencia", el
// avance o el error. Al abrirla queda como "última canción".

export function CancionPage() {
  const id = Number(useParams().id);
  const [cancion, setCancion] = useState<Cancion | null | undefined>(undefined);
  const [pistas, setPistas] = useState<PistaMotor[]>([]);
  const [hayClave, setHayClave] = useState(true);
  const version = useVersion();

  // Se vuelve a leer si algo cambia en la biblioteca (renombrar, terminar de separar...).
  useEffect(() => {
    obtenerCancion(id).then(
      (c) => {
        setCancion(c);
        recordarCancion(c ? c.id : null);
      },
      () => setCancion(null),
    );
    listarPistas(id).then(
      (p) => setPistas(p.map((x) => ({ instrumento: x.instrumento, archivo: x.archivo, vacia: !!x.vacia }))),
      () => setPistas([]),
    );
    hayClaveMvsep().then(setHayClave, () => setHayClave(false));
  }, [id, version]);

  if (cancion === undefined) return null;
  if (cancion === null) {
    return <p className="p-8 text-center text-fg-3">Esta canción ya no existe. Elige otra en la biblioteca.</p>;
  }

  const lista = cancion.estado === "lista";
  const suenan = pistas.filter((p) => !p.vacia).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="m-3 mb-0 flex gap-3 rounded-xl border border-line bg-ink-0 p-3">
        <div className="flex min-w-0 flex-1 items-center">
          {lista ? (
            <BotonesSeparar cancion={cancion} pistas={pistas} hayClave={hayClave} />
          ) : (
            <p className="m-0 text-fg-3">Primero hay que crear la secuencia: separar los instrumentos.</p>
          )}
        </div>
        <div className="flex w-[340px] flex-none items-center gap-3 rounded-lg border border-line bg-ink-1 px-3 py-2">
          <span className="relative grid size-10 flex-none place-items-center rounded-md border border-line-2 bg-ink-2 text-fg-3">
            <IconoNota size={17} />
            <span className="absolute -bottom-1 rounded-sm bg-accent px-1 font-mono text-[8.5px] font-semibold text-accent-ink uppercase">
              {extension(cancion.archivo) || "?"}
            </span>
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-wider text-fg-3 uppercase">Canción</div>
            <h1 className="m-0 truncate font-display text-[14.5px] font-semibold" title={cancion.titulo}>
              {cancion.titulo}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-fg-3">
              <span className="font-mono">{formatoDuracion(cancion.duracion_ms)}</span>
              {lista && <span>· {suenan} pistas</span>}
              <EstadoCancion cancionId={cancion.id} estado={cancion.estado} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-stretch overflow-hidden border-b border-line">
        <Dato titulo="Tonalidad" valor="—" ayuda="La escribe el encargado (paso 4b)" />
        <Dato titulo="BPM" valor="—" ayuda="Se define en el paso 5 (Click)" />
        <Dato titulo="Duración" valor={formatoDuracion(cancion.duracion_ms)} />
        <Dato titulo="Pistas" valor={lista ? String(suenan) : "—"} />
        <Pasos lista={lista} />
      </div>

      {lista ? (
        <Editor cancion={cancion} instrumentos={pistas.map((p) => p.instrumento).join(",")} />
      ) : (
        <div className="flex-1 overflow-auto">
          {cancion.estado === "nueva" && <SinSecuencia id={id} hayClave={hayClave} />}
          {cancion.estado === "separando" && <ProgresoBase id={id} />}
          {cancion.estado === "error" && <Fallo id={id} mensaje={cancion.error} hayClave={hayClave} />}
        </div>
      )}
    </div>
  );
}

/** Un dato de la fila de abajo de la barra: título chico y valor grande. */
function Dato({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda?: string }) {
  return (
    <div title={ayuda} className="min-w-[120px] border-r border-line px-4 py-2">
      <div className="text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{titulo}</div>
      <div className={`font-mono text-[17px] font-semibold ${valor === "—" ? "text-fg-3" : ""}`}>{valor}</div>
    </div>
  );
}

/**
 * Los pasos para dejar lista una secuencia. Por ahora solo "Separar" se puede
 * completar; los demás llegan en los pasos 5 a 8 de la Fase 1.
 * El nombre de cada uno aparece al pasar el mouse.
 */
function Pasos({ lista }: { lista: boolean }) {
  const pasos = ["Separar", "Click", "Secciones", "Voz guía", "Exportar"];
  return (
    <ol aria-label="Pasos de la secuencia" className="m-0 ml-auto flex list-none items-center gap-1 px-4 py-0">
      {pasos.map((paso, i) => {
        const hecho = i === 0 && lista;
        const actual = (i === 0 && !lista) || (i === 1 && lista);
        return (
          <li key={paso} title={paso} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-3 bg-line-2" />}
            <span
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium whitespace-nowrap ${
                actual ? "bg-ink-3 text-fg" : hecho ? "text-fg-2" : "text-fg-3"
              }`}
            >
              <span
                className={`grid size-[17px] place-items-center rounded-full text-[9.5px] ${
                  hecho ? "bg-ink-3 text-[#4fc8b1]" : actual ? "bg-accent text-accent-ink" : "border border-line-2"
                }`}
              >
                {hecho ? "✓" : i + 1}
              </span>
              {/* Para que quepa en pantallas chicas, solo se nombran el hecho y el actual. */}
              {(hecho || actual) && paso}
            </span>
          </li>
        );
      })}
    </ol>
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
          <EstadoFila />
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

function ProgresoBase({ id }: { id: number }) {
  const avance = useAvance(id);
  return (
    <section className="mx-auto max-w-lg px-6 py-12">
      <Progreso titulo="Creando la secuencia" avance={avance} />
      <div className="mt-4 flex justify-end">
        <BotonCancelar />
      </div>
      <p className="mt-4 leading-relaxed text-fg-3">
        MVSep atiende a todos los usuarios gratis en una sola fila. Puedes abrir otra canción mientras tanto: el
        trabajo sigue y el resultado se guarda solo. Si cierras la app se detiene, pero al reintentar se retoma el
        lugar en la fila.
      </p>
    </section>
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
