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
import { ALTO_FRANJA as ALTO_SECCIONES } from "./LineaTiempo";

// La franja de secciones, entre la regla y las pistas:
//
//   │ Intro │ Verso 1        │ Coro 1      │ Verso 2  ...
//
// - Clic en una sección: menú para escucharla, cambiarle el nombre, unirla con la
//   siguiente o borrarla.
// - Arrastrar el borde entre dos secciones lo mueve. Si hay click, se pega a la
//   línea de compás más cercana; con Alt se mueve libre.
// - Sin secciones: "Marcar a mano" o "Proponer con IA" (la IA llega en el paso 6b).
//
// Cortar en la posición actual (tecla S), deshacer y rehacer están en el editor.

type Props = {
  /** `undefined` mientras se leen de la base. */
  secciones: Seccion[] | undefined;
  duracion: number;
  ancho: number;
  alCambiar: (nuevas: Seccion[]) => void;
  alSaltar: (segundos: number) => void;
  /** Pega un tiempo al compás más cercano (si hay click; si no, lo devuelve igual). */
  ajustar: (segundos: number) => number;
  alMarcarAMano: () => void;
};

export function FranjaSecciones({ secciones, duracion, ancho, alCambiar, alSaltar, ajustar, alMarcarAMano }: Props) {
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
        <span>Sin secciones.</span>
        <button
          onClick={alMarcarAMano}
          title="Empieza con una sola sección y córtala mientras escuchas (tecla S)"
          className="rounded-md bg-accent px-2 py-0.5 font-semibold text-accent-ink hover:brightness-110"
        >
          Marcar a mano
        </button>
        <button
          disabled
          title="Llega en el paso 6b"
          className="rounded-md border border-line-2 px-2 py-0.5 text-fg-2 disabled:opacity-40"
        >
          Proponer con IA
        </button>
      </div>
    );
  }

  const lista = vistaPrevia ?? secciones;
  const etiquetas = nombres(lista);
  const x = (s: number) => (s / duracion) * ancho;

  function arrastrarBorde(evento: React.MouseEvent, indice: number) {
    evento.stopPropagation();
    evento.preventDefault();
    const segundosPorPixel = duracion / ancho;
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
      {/* Los bordes que se arrastran (el de la primera no: empieza en 0). */}
      {lista.map((s, i) =>
        i === 0 ? null : (
          <div
            key={`borde-${i}`}
            onMouseDown={(e) => arrastrarBorde(e, i)}
            title="Arrastra para mover el borde (Alt: sin pegarse al compás)"
            style={{ left: x(s.inicio) - 4 }}
            className="absolute top-0 bottom-0 z-10 w-[9px] cursor-ew-resize hover:bg-fg/20"
          />
        ),
      )}
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
