import { useEffect, useRef, useState } from "react";
import { MAYORES, MENORES } from "../../lib/tonos";

// El tono original de la canción, que escribe el encargado (la IA no lo detecta).
// Un clic abre una grilla con los 12 tonos mayores y los 12 menores, en cifrado
// americano (C, Db, D... / Cm, C#m...). Este es el NOMBRE del tono: no cambia
// el sonido. Para escucharla en otro tono está "Tonalidad" en el transporte.


type Props = {
  tono: string | null;
  alElegir: (tono: string | null) => void;
};

export function SelectorTono({ tono, alElegir }: Props) {
  // Dónde dibujar la grilla: con `position: fixed`, para que no la recorte la fila de datos.
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const abierto = posicion !== null;
  const setAbierto = (si: boolean) => !si && setPosicion(null);
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

  function elegir(nuevo: string | null) {
    setAbierto(false);
    alElegir(nuevo);
  }

  return (
    <div ref={caja} className="relative">
      <button
        onClick={(e) => {
          if (abierto) return setPosicion(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPosicion({ top: r.bottom + 4, left: r.left });
        }}
        title="Tono original de la canción (lo escribe el encargado)"
        className={`rounded-md px-1 -mx-1 font-mono text-[17px] font-semibold hover:bg-ink-3 ${tono ? "" : "text-accent"}`}
      >
        {tono ?? "Elegir"}
      </button>
      {posicion && (
        <div style={posicion} className="fixed z-50 w-[300px] rounded-xl border border-line-2 bg-ink-2 p-3 shadow-xl shadow-black/40">
          <Grilla titulo="Mayores" tonos={MAYORES} actual={tono} alElegir={elegir} />
          <Grilla titulo="Menores" tonos={MENORES} actual={tono} alElegir={elegir} />
          {tono && (
            <button onClick={() => elegir(null)} className="mt-2 text-[12px] text-fg-3 hover:text-fg">
              Quitar el tono
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Grilla(props: { titulo: string; tonos: string[]; actual: string | null; alElegir: (t: string) => void }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{props.titulo}</div>
      <div className="grid grid-cols-6 gap-1">
        {props.tonos.map((t) => (
          <button
            key={t}
            onClick={() => props.alElegir(t)}
            className={`rounded-md border py-1 font-mono text-[12.5px] ${
              t === props.actual
                ? "border-accent bg-[#22305e] text-accent"
                : "border-line bg-ink-1 text-fg-2 hover:border-line-2 hover:text-fg"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
