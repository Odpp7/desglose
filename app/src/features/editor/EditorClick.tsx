import { useEffect, useRef, useState } from "react";
import { COMPASES, nombreCompas, type Click } from "../../lib/click";
import { escucharEstado, formatoTiempo } from "../../lib/engine";
import { BPM_MAXIMO, BPM_MINIMO, agregarToque, bpmDeToques, limitarBpm } from "../../lib/tocarTempo";

// El dato "BPM" de la fila de datos. Un clic abre el panel del click:
//
//   BPM          [−]  [ 72 ]  [+]     [ Tocar el tempo (T) ]
//   COMPÁS       2/4  3/4  [4/4]  6/8  12/8
//   CONTEO       0  [1]  2  compases
//   PRIMER TIEMPO  0:01.240  [‹] [›]  [Aquí]
//
// Todo se oye al momento (si está sonando). El primer tiempo también se puede
// arrastrar sobre la onda: es el marcador "1" de la regla.

type Props = {
  click: Click;
  alCambiar: (cambio: Partial<Click>) => void;
};

/** Cuánto corren el primer tiempo los botones ‹ ›. */
const PASO_INICIO = 0.01;

export function DatoBpm({ click, alCambiar }: Props) {
  // Con `position: fixed`, para que no lo recorte la fila de datos (como el selector de tono).
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const abierto = posicion !== null;

  useEffect(() => {
    if (!abierto) return;
    const alClicAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setPosicion(null);
    };
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && setPosicion(null);
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="min-w-[120px] border-r border-line px-4 py-2">
      <div className="text-[10px] font-semibold tracking-wider text-fg-3 uppercase">BPM</div>
      <button
        onClick={(e) => {
          if (abierto) return setPosicion(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPosicion({ top: r.bottom + 4, left: r.left });
        }}
        title="Tempo, compás y primer tiempo del click"
        className={`-mx-1 rounded-md px-1 font-mono text-[17px] font-semibold whitespace-nowrap hover:bg-ink-3 ${
          click.bpm ? "" : "text-accent"
        }`}
      >
        {click.bpm ? (
          <>
            {formatoBpm(click.bpm)}
            <span className="ml-1.5 text-[12px] font-medium text-fg-3">{nombreCompas(click.compas)}</span>
          </>
        ) : (
          "Definir"
        )}
      </button>
      {posicion && <PanelClick posicion={posicion} click={click} alCambiar={alCambiar} />}
    </div>
  );
}

function PanelClick({ posicion, click, alCambiar }: Props & { posicion: { top: number; left: number } }) {
  const [toques, setToques] = useState<number[]>([]);
  const [texto, setTexto] = useState(click.bpm ? formatoBpm(click.bpm) : "");
  // La posición de la canción, para "Aquí". Sin pasar por el estado de React.
  const posicionCancion = useRef(0);

  useEffect(() => {
    const dejar = escucharEstado((e) => (posicionCancion.current = e.posicion));
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  // Si el BPM cambia por los botones o por tocar, el campo lo muestra.
  useEffect(() => setTexto(click.bpm ? formatoBpm(click.bpm) : ""), [click.bpm]);

  function tocar(ahora: number) {
    const nuevos = agregarToque(toques, ahora);
    setToques(nuevos);
    const bpm = bpmDeToques(nuevos);
    if (bpm !== null) alCambiar({ bpm });
  }

  // La tecla T toca el tempo mientras el panel está abierto (salvo escribiendo en el campo).
  const tocarActual = useRef(tocar);
  tocarActual.current = tocar;
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.code !== "KeyT" || e.repeat || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      tocarActual.current(e.timeStamp);
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, []);

  function escribir(valor: string) {
    setTexto(valor);
    const numero = Number(valor.replace(",", "."));
    if (Number.isFinite(numero) && numero >= BPM_MINIMO && numero <= BPM_MAXIMO) {
      alCambiar({ bpm: Math.round(numero * 10) / 10 });
    }
  }

  const sumar = (delta: number) =>
    alCambiar({ bpm: limitarBpm(Math.round(((click.bpm ?? 120) + delta) * 10) / 10) });
  const moverInicio = (delta: number) =>
    alCambiar({ inicio: Math.max(0, Math.round((click.inicio + delta) * 1000) / 1000) });

  const tocando = toques.length > 0;

  return (
    <div
      style={posicion}
      className="fixed z-50 w-[360px] space-y-3 rounded-xl border border-line-2 bg-ink-2 p-4 shadow-xl shadow-black/40"
    >
      <Fila titulo="BPM">
        <Boton etiqueta="Bajar 1 BPM" onClick={() => sumar(-1)}>
          −
        </Boton>
        <input
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          onBlur={() => setTexto(click.bpm ? formatoBpm(click.bpm) : "")}
          placeholder="—"
          inputMode="decimal"
          aria-label="BPM"
          className="w-16 rounded-md border border-line bg-ink-1 py-1 text-center font-mono text-[15px] font-semibold outline-none focus:border-accent"
        />
        <Boton etiqueta="Subir 1 BPM" onClick={() => sumar(1)}>
          +
        </Boton>
        <button
          // Al presionar, no al soltar: así el toque cae justo en el golpe.
          onMouseDown={(e) => tocar(e.timeStamp)}
          title="Toca al ritmo de la canción, en cada tiempo. También con la tecla T."
          className={`ml-auto rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${
            tocando ? "bg-accent text-accent-ink" : "border border-line-2 bg-ink-1 text-fg-2 hover:text-fg"
          }`}
        >
          {tocando && toques.length < 2 ? "Sigue tocando…" : "Tocar el tempo (T)"}
        </button>
      </Fila>

      <Fila titulo="Compás">
        {COMPASES.map((c) => (
          <Opcion key={c.tiempos} elegida={click.compas === c.tiempos} onClick={() => alCambiar({ compas: c.tiempos })}>
            {c.nombre}
          </Opcion>
        ))}
      </Fila>
      {click.compas % 3 === 0 && click.compas > 3 && (
        <p className="m-0 -mt-1 text-[11.5px] text-fg-3">En {nombreCompas(click.compas)} el BPM cuenta corcheas.</p>
      )}

      <Fila titulo="Conteo">
        {[0, 1, 2].map((n) => (
          <Opcion key={n} elegida={click.conteo === n} onClick={() => alCambiar({ conteo: n })}>
            {n}
          </Opcion>
        ))}
        <span className="text-[12px] text-fg-3">compases antes del 1</span>
      </Fila>

      <Fila titulo="Primer tiempo">
        <span className="w-[74px] font-mono text-[14px] font-semibold">{formatoTiempoFino(click.inicio)}</span>
        <Boton etiqueta="Antes (10 ms)" onClick={() => moverInicio(-PASO_INICIO)}>
          ‹
        </Boton>
        <Boton etiqueta="Después (10 ms)" onClick={() => moverInicio(PASO_INICIO)}>
          ›
        </Boton>
        <button
          onClick={() => alCambiar({ inicio: Math.round(posicionCancion.current * 1000) / 1000 })}
          title="Pon el primer tiempo donde está ahora la canción"
          className="ml-auto rounded-lg border border-line-2 bg-ink-1 px-3 py-1.5 text-[12.5px] font-semibold text-fg-2 hover:text-fg"
        >
          Aquí
        </button>
      </Fila>
      <p className="m-0 text-[11.5px] leading-relaxed text-fg-3">
        Pausa justo en el primer golpe y pulsa "Aquí", o arrastra el <b className="text-accent">1</b> de la regla
        sobre la onda.
      </p>
    </div>
  );
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[92px] flex-none text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{titulo}</span>
      {children}
    </div>
  );
}

function Boton(props: { etiqueta: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={props.etiqueta}
      title={props.etiqueta}
      onClick={props.onClick}
      className="grid size-7 flex-none place-items-center rounded-md border border-line bg-ink-1 font-mono text-[14px] text-fg-2 hover:text-fg"
    >
      {props.children}
    </button>
  );
}

function Opcion(props: { elegida: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-md border px-2 py-1 font-mono text-[12.5px] ${
        props.elegida
          ? "border-accent bg-[#22305e] text-accent"
          : "border-line bg-ink-1 text-fg-2 hover:border-line-2 hover:text-fg"
      }`}
    >
      {props.children}
    </button>
  );
}

/** 72 → "72", 97.5 → "97.5" */
export function formatoBpm(bpm: number) {
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

/** 1.24 → "0:01.240" (con milésimas: el primer tiempo se afina fino). */
function formatoTiempoFino(segundos: number) {
  const total = Math.round(segundos * 1000);
  const ms = String(total % 1000).padStart(3, "0");
  return `${formatoTiempo(Math.floor(total / 1000)).slice(0, -2)}.${ms}`;
}
