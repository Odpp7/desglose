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
  // `posicion` guarda dónde dibujar la lista (debajo del botón, alineada a su derecha).
  // Se dibuja con `position: fixed` para que no la recorte una lista con desplazamiento.
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const abierto = posicion !== null;
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setPosicion(null);
    const alClicAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTecla);
    // Si algo se desplaza o cambia de tamaño, la lista quedaría fuera de lugar: se cierra.
    const alDesplazar = (e: Event) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    window.addEventListener("resize", cerrar);
    document.addEventListener("scroll", alDesplazar, true);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTecla);
      window.removeEventListener("resize", cerrar);
      document.removeEventListener("scroll", alDesplazar, true);
    };
  }, [abierto]);

  function alternar(e: React.MouseEvent<HTMLButtonElement>) {
    if (abierto) return setPosicion(null);
    const r = e.currentTarget.getBoundingClientRect();
    setPosicion({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }

  return (
    // stopPropagation: el clic en el menú no debe abrir la fila que lo contiene.
    <div ref={caja} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        aria-label={etiqueta}
        aria-expanded={abierto}
        onClick={alternar}
        className={`grid size-7 place-items-center rounded-md hover:bg-ink-3 hover:text-fg ${
          abierto ? "bg-ink-3 text-fg" : "text-fg-3"
        }`}
      >
        <IconoPuntos size={16} />
      </button>
      {posicion && (
        <div
          role="menu"
          style={posicion}
          className="fixed z-50 max-h-[60vh] min-w-48 overflow-y-auto rounded-[10px] border border-line-2 bg-ink-2 p-1 shadow-xl shadow-black/40"
        >
          {children(() => setPosicion(null))}
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
