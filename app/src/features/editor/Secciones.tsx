import { useEffect, useRef, useState } from "react";
import {
  TIPOS,
  borrar,
  colorDe,
  fin,
  moverBorde,
  nombres,
  renombrar,
  unirConSiguiente,
  type Seccion,
} from "../../lib/secciones";
import { ALTO_SECCIONES } from "./LineaTiempo";

// La franja de secciones, entre la regla y las pistas:
//
//   │ Intro │ Verso 1        │ Coro 1      │ Verso 2  ...
//
// - Clic en una sección: menú para escucharla, cambiarle el nombre, unirla con la
//   siguiente o borrarla.
// - Arrastrar el borde entre dos secciones lo mueve. Si hay click, se pega a la
//   línea de compás más cercana; con Alt se mueve libre.
// - Sin secciones: "Marcar a mano" o "Proponer con IA" (SongFormer en Modal, unos
//   3 minutos). Si la IA falla (sin internet, sin crédito), el aviso lo dice y
//   "Marcar a mano" sigue ahí.
//
// Cortar en la posición actual (tecla S), deshacer y rehacer están en el editor.

type Props = {
  /** `undefined` mientras se leen de la base. */
  secciones: Seccion[] | undefined;
  duracion: number;
  /** Espacio al inicio de la línea, fuera del audio y las secciones guardadas. */
  entrada: number;
  ancho: number;
  alCambiar: (nuevas: Seccion[]) => void;
  alSaltar: (segundos: number) => void;
  /** Pega un tiempo al compás más cercano (si hay click; si no, lo devuelve igual). */
  ajustar: (segundos: number) => number;
  alMarcarAMano: () => void;
  alProponer: () => void;
  /** La IA está trabajando. */
  proponiendo: boolean;
  /** En qué va la IA (lo avisa Rust cada 3 s). */
  avanceIa: AvanceIa | null;
  /** Cuándo empezó a esperarla (Date.now()), para mostrar el tiempo total. */
  desdeIa: number;
  /** Por qué falló la IA la última vez. */
  errorIa: string | null;
};

/** Etapas que avisa Rust: subiendo, en fila, preparando, analizando, sin conexión. */
export type AvanceIa = { etapa: string; segundos: number };

/** Lo que tarda SongFormer en analizar una canción (medido: entre 155 y 190 s). */
const SEGUNDOS_ANALISIS = 180;

export function FranjaSecciones(props: Props) {
  const { secciones, duracion, entrada, ancho, alCambiar, alSaltar, ajustar, alMarcarAMano } = props;
  // Mientras se arrastra un borde: cómo quedarían (solo para dibujarlas).
  const [vistaPrevia, setVistaPrevia] = useState<Seccion[] | null>(null);
  const [menu, setMenu] = useState<{ indice: number; top: number; left: number } | null>(null);

  if (!secciones || duracion <= 0 || ancho <= 0) {
    return <div style={{ height: ALTO_SECCIONES }} className="border-b border-line bg-ink-0" />;
  }

  if (secciones.length === 0) {
    return (
      <div
        style={{ height: ALTO_SECCIONES }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex cursor-default items-center gap-2 border-b border-line bg-ink-0 px-3 text-[12px] text-fg-3"
      >
        {props.proponiendo ? (
          <AvanceDeLaIa avance={props.avanceIa} desde={props.desdeIa} />
        ) : (
          <span>Sin secciones.</span>
        )}
        <button
          onClick={alMarcarAMano}
          title="Empieza con una sola sección y córtala mientras escuchas (tecla S)"
          className="rounded-md bg-accent px-2 py-0.5 font-semibold text-accent-ink hover:brightness-110"
        >
          Marcar a mano
        </button>
        {!props.proponiendo && (
          <button
            onClick={props.alProponer}
            title="SongFormer escucha la canción en la nube (Modal) y propone las secciones. Necesita internet."
            className="rounded-md border border-line-2 px-2 py-0.5 text-fg-2 hover:text-fg"
          >
            {props.errorIa ? "Reintentar con IA" : "Proponer con IA"}
          </button>
        )}
      </div>
    );
  }

  const lista = vistaPrevia ?? secciones;
  const etiquetas = nombres(lista);
  const duracionTotal = duracion + entrada;
  const x = (s: number) => ((s + entrada) / duracionTotal) * ancho;

  function arrastrarBorde(evento: React.MouseEvent, indice: number) {
    evento.stopPropagation();
    evento.preventDefault();
    const segundosPorPixel = duracionTotal / ancho;
    const inicioX = evento.clientX;
    const original = secciones![indice].inicio;
    let resultado: Seccion[] | null = null;
    const alMoverMouse = (e: MouseEvent) => {
      const libre = original + (e.clientX - inicioX) * segundosPorPixel;
      resultado = moverBorde(secciones!, indice, e.altKey ? libre : ajustar(libre), duracion);
      setVistaPrevia(resultado);
    };
    const alSoltar = () => {
      window.removeEventListener("mousemove", alMoverMouse);
      window.removeEventListener("mouseup", alSoltar);
      setVistaPrevia(null);
      if (resultado && resultado[indice].inicio !== original) alCambiar(resultado);
    };
    window.addEventListener("mousemove", alMoverMouse);
    window.addEventListener("mouseup", alSoltar);
  }

  return (
    <div
      style={{ height: ALTO_SECCIONES }}
      onMouseDown={(e) => e.stopPropagation()} // la franja no salta: tiene sus propios clics
      className="relative border-b border-line bg-ink-0"
    >
      {lista.map((s, i) => {
        const izquierda = x(s.inicio);
        const largo = x(fin(lista, i, duracion)) - izquierda;
        const color = colorDe(s.tipo);
        return (
          <div
            key={i}
            onClick={(e) => setMenu({ indice: i, top: e.clientY + 8, left: e.clientX })}
            title={`${etiquetas[i]} · clic para cambiarla`}
            style={{ left: izquierda, width: largo, background: color + "33", borderColor: color }}
            className={`absolute top-1 bottom-1 cursor-pointer overflow-hidden border-l-2 px-1.5 text-[11.5px] leading-[22px] font-semibold whitespace-nowrap hover:brightness-125 ${
              menu?.indice === i ? "brightness-150" : ""
            }`}
          >
            <span style={{ color }}>{etiquetas[i]}</span>
          </div>
        );
      })}
      {lista.map((s, i) => (
          <div
            key={`borde-${i}`}
            onMouseDown={(e) => arrastrarBorde(e, i)}
            title="Arrastra para mover el borde (Alt: sin pegarse al compás)"
            style={{ left: Math.max(0, x(s.inicio) - 4) }}
            className="absolute top-0 bottom-0 z-10 w-[9px] cursor-ew-resize hover:bg-fg/20"
          />
      ))}
      {menu && secciones[menu.indice] && (
        <MenuSeccion
          posicion={{ top: menu.top, left: Math.min(menu.left, window.innerWidth - 300) }}
          nombre={nombres(secciones)[menu.indice]}
          seccion={secciones[menu.indice]}
          esUltima={menu.indice === secciones.length - 1}
          alCerrar={() => setMenu(null)}
          alEscuchar={() => alSaltar(secciones[menu.indice].inicio)}
          alRenombrar={(tipo) => alCambiar(renombrar(secciones, menu.indice, tipo))}
          alUnir={() => alCambiar(unirConSiguiente(secciones, menu.indice))}
          alBorrar={() => alCambiar(borrar(secciones, menu.indice))}
        />
      )}
    </div>
  );
}

/**
 * Barra de avance de la IA: etapa, porcentaje estimado y tiempo total.
 * Solo esta piecita se redibuja cada segundo (por el reloj), no la franja entera.
 */
function AvanceDeLaIa({ avance, desde }: { avance: AvanceIa | null; desde: number }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);

  const etapa = avance?.etapa ?? "subiendo";
  const s = avance?.segundos ?? 0;
  // El porcentaje es una estimación: Modal dice la etapa, no el porcentaje real.
  const [texto, porcentaje] =
    etapa === "subiendo"
      ? ["Subiendo la canción a Modal", 3]
      : etapa === "en fila"
        ? ["En fila: esperando una máquina en Modal", 8]
        : etapa === "preparando"
          ? ["Preparando la IA", 12 + Math.min(1, s / 20) * 8]
          : etapa === "analizando"
            ? [`Analizando la canción (${minutos(s)} de ~${minutos(SEGUNDOS_ANALISIS)})`, 20 + Math.min(0.97, s / SEGUNDOS_ANALISIS) * 78]
            : etapa === "sin conexión"
              ? ["Sin conexión con Modal, reintentando", 0]
              : [etapa, 0];
  const total = Math.max(0, Math.round((ahora - desde) / 1000));

  return (
    <span className="flex min-w-0 items-center gap-2 text-accent" title="La IA sigue aunque cambies de canción o cierres la app">
      <span className="relative h-1.5 w-28 flex-none overflow-hidden rounded-full bg-ink-3">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700" style={{ width: `${porcentaje}%` }} />
      </span>
      <span className="truncate">
        {texto}… <span className="font-mono text-fg-3">{minutos(total)}</span>
      </span>
    </span>
  );
}

/** 95 → "1:35" */
function minutos(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

function MenuSeccion(props: {
  posicion: { top: number; left: number };
  nombre: string;
  seccion: Seccion;
  esUltima: boolean;
  alCerrar: () => void;
  alEscuchar: () => void;
  alRenombrar: (tipo: string) => void;
  alUnir: () => void;
  alBorrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const { alCerrar } = props;

  useEffect(() => {
    const alClicAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) alCerrar();
    };
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [alCerrar]);

  // Cada acción cierra el menú después de hacer lo suyo.
  const y = (accion: () => void) => () => {
    accion();
    alCerrar();
  };

  return (
    <div
      ref={caja}
      style={props.posicion}
      className="fixed z-50 w-[290px] cursor-default rounded-xl border border-line-2 bg-ink-2 p-3 text-[12.5px] shadow-xl shadow-black/40"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-display text-[14px] font-semibold" style={{ color: colorDe(props.seccion.tipo) }}>
          {props.nombre}
        </span>
        {props.seccion.origen === "ia" && <span className="text-[11px] text-fg-3">propuesta por la IA</span>}
        <button onClick={y(props.alEscuchar)} className="ml-auto text-accent hover:underline">
          Escuchar desde aquí
        </button>
      </div>

      <div className="mb-1 text-[10px] font-semibold tracking-wider text-fg-3 uppercase">Nombre</div>
      <div className="grid grid-cols-3 gap-1">
        {TIPOS.map((t) => (
          <button
            key={t.tipo}
            onClick={y(() => props.alRenombrar(t.tipo))}
            style={t.tipo === props.seccion.tipo ? { borderColor: t.color, color: t.color } : undefined}
            className="rounded-md border border-line bg-ink-1 py-1 text-fg-2 hover:border-line-2 hover:text-fg"
          >
            {t.tipo}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2 border-t border-line pt-2">
        <button
          onClick={y(props.alUnir)}
          disabled={props.esUltima}
          title="Junta esta sección con la que sigue"
          className="rounded-md px-2 py-1 text-fg-2 hover:bg-ink-3 hover:text-fg disabled:opacity-35"
        >
          Unir con la siguiente
        </button>
        <button
          onClick={y(props.alBorrar)}
          title="Su tiempo pasa a la sección de al lado"
          className="ml-auto rounded-md px-2 py-1 text-[#ff9aa8] hover:bg-[#3a1d24]"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}
