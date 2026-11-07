import { useEffect, useRef, useState } from "react";
import { IconoPuntos } from "./icons";

// Menú de "⋯": un botón que abre una lista de acciones.
// Se cierra al elegir algo, al hacer clic afuera o con Escape.
// `children` es una función que recibe `cerrar`, para que cada opción lo llame.

type Props = {
  etiqueta: string;
  children: (cerrar: () => void) => React.ReactNode;
};

export function Menu({ etiqueta, children }: Props) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClicAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  return (
    // stopPropagation: el clic en el menú no debe abrir la fila que lo contiene.
    <div ref={caja} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        aria-label={etiqueta}
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`grid size-7 place-items-center rounded-md hover:bg-ink-3 hover:text-fg ${
          abierto ? "bg-ink-3 text-fg" : "text-fg-3"
        }`}
      >
        <IconoPuntos size={16} />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 min-w-48 rounded-[10px] border border-line-2 bg-ink-2 p-1 shadow-xl shadow-black/40"
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

export function OpcionMenu(props: {
  children: React.ReactNode;
  onClick: () => void;
  peligro?: boolean;
  marcada?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-ink-3 ${
        props.peligro ? "text-[#ff9aa8]" : props.marcada ? "text-fg" : "text-fg-2"
      }`}
    >
      <span className="w-3 text-accent">{props.marcada ? "✓" : ""}</span>
      {props.children}
    </button>
  );
}

export function TituloMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">
      {children}
    </div>
  );
}
