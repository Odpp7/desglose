import { formatoDb } from "../../lib/formato";
import { instrumento } from "../../lib/instrumentos";
import type { EstadoPista } from "../../lib/sesion";

// La cabecera de una pista, a la izquierda de su onda (como el "Mezclador" de la
// captura de referencia): nombre en su color, M (silenciar), S (solo), y el
// fader con su valor en dB. Doble clic en el fader lo vuelve a 0 dB.

type Props = {
  clave: string;
  estado: EstadoPista;
  alto: number;
  /** La pista casi no suena (se muestra solo si el encargado lo pide). */
  vacia: boolean;
  alCambiar: (cambio: Partial<EstadoPista>) => void;
};

export function CabeceraPista({ clave, estado, alto, vacia, alCambiar }: Props) {
  const { nombre, color } = instrumento(clave);
  const apagada = estado.mute;

  return (
    <div
      style={{ height: alto, "--color": color } as React.CSSProperties}
      className="flex flex-col justify-center gap-1.5 border-b border-line px-3"
    >
      <div className="flex items-center gap-2">
        <span className="size-2 flex-none rounded-full bg-(--color)" />
        <span className={`min-w-0 flex-1 truncate font-semibold ${apagada ? "text-fg-3" : "text-(--color)"}`}>
          {nombre}
          {vacia && <span className="ml-1.5 text-[11px] font-normal text-fg-3">casi vacía</span>}
        </span>
        <Interruptor
          texto="M"
          etiqueta={`Silenciar ${nombre}`}
          activo={estado.mute}
          colorActivo="border-[#7b3a45] bg-[#5a2b33] text-[#ffb3bd]"
          alCambiar={(mute) => alCambiar({ mute })}
        />
        <Interruptor
          texto="S"
          etiqueta={`Solo ${nombre}`}
          activo={estado.solo}
          colorActivo="border-[#7a6528] bg-[#5a4a1f] text-[#ffe08a]"
          alCambiar={(solo) => alCambiar({ solo })}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`volumen-${clave}`}
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={estado.volumen}
          onChange={(e) => alCambiar({ volumen: Number(e.target.value) })}
          onDoubleClick={() => alCambiar({ volumen: 1 })}
          aria-label={`Volumen de ${nombre}`}
          title="Doble clic: 0 dB"
          className={`h-3.5 min-w-0 flex-1 accent-(--color) ${apagada ? "opacity-40" : ""}`}
        />
        <span className="w-9 text-right font-mono text-[11px] text-fg-2 tabular-nums">{formatoDb(estado.volumen)}</span>
      </div>
    </div>
  );
}

function Interruptor(props: {
  texto: string;
  etiqueta: string;
  activo: boolean;
  colorActivo: string;
  alCambiar: (valor: boolean) => void;
}) {
  return (
    <button
      aria-label={props.etiqueta}
      aria-pressed={props.activo}
      title={props.etiqueta}
      onClick={() => props.alCambiar(!props.activo)}
      className={`h-6 w-7 flex-none rounded-md border text-[11px] font-semibold ${
        props.activo ? props.colorActivo : "border-line bg-ink-2 text-fg-3 hover:text-fg"
      }`}
    >
      {props.texto}
    </button>
  );
}
