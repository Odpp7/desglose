import type { CambioPista, Pista } from "../../lib/db";
import { formatoDb } from "../../lib/formato";
import { datosPista } from "../../lib/instrumentos";
import { formatoDesfase } from "./LineaTiempo";

// La cabecera de una pista, a la izquierda de su onda (como el "Mezclador" de la
// captura de referencia): nombre en su color, M (silenciar), S (solo),
// R (va en el paquete para REAPER) y el fader con su valor en dB.
// Doble clic en el fader lo vuelve a 0 dB.
//
// Las pistas propias además tienen:
//   - ✕ para quitarla (pide confirmación);
//   - su desfase a la vista, con ‹ › para moverla de a 10 ms (con Shift, 100 ms)
//     y "0" para volver al inicio. También se puede arrastrar su onda.

type Props = {
  pista: Pista;
  alto: number;
  alCambiar: (cambio: CambioPista) => void;
  alQuitar: () => void;
};

export function CabeceraPista({ pista, alto, alCambiar, alQuitar }: Props) {
  const { nombre, color } = datosPista(pista);
  const apagada = !!pista.mute;
  const propia = !!pista.propia;
  const mover = (e: React.MouseEvent, sentido: number) =>
    alCambiar({ desfase_ms: pista.desfase_ms + sentido * (e.shiftKey ? 100 : 10) });

  return (
    <div
      style={{ height: alto, "--color": color } as React.CSSProperties}
      className={`flex flex-col justify-center border-b border-line px-3 ${
        propia ? "gap-1 bg-[#141a26]" : "gap-1.5"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="size-2 flex-none rounded-full bg-(--color)" />
        <span
          title={nombre}
          className={`min-w-0 flex-1 truncate font-semibold ${apagada ? "text-fg-3" : "text-(--color)"}`}
        >
          {nombre}
          {!!pista.vacia && <span className="ml-1.5 text-[11px] font-normal text-fg-3">casi vacía</span>}
        </span>
        <Interruptor
          texto="M"
          etiqueta={`Silenciar ${nombre}`}
          activo={apagada}
          colorActivo="border-[#7b3a45] bg-[#5a2b33] text-[#ffb3bd]"
          alCambiar={(v) => alCambiar({ mute: v ? 1 : 0 })}
        />
        <Interruptor
          texto="S"
          etiqueta={`Solo ${nombre}`}
          activo={!!pista.solo}
          colorActivo="border-[#7a6528] bg-[#5a4a1f] text-[#ffe08a]"
          alCambiar={(v) => alCambiar({ solo: v ? 1 : 0 })}
        />
        <Interruptor
          texto="R"
          etiqueta={pista.en_export ? `${nombre} va a REAPER` : `${nombre} no va a REAPER`}
          activo={!!pista.en_export}
          colorActivo="border-[#34458a] bg-[#22305e] text-accent"
          alCambiar={(v) => alCambiar({ en_export: v ? 1 : 0 })}
        />
        {propia && (
          <button
            onClick={alQuitar}
            aria-label={`Quitar ${nombre}`}
            title="Quitar esta pista"
            className="grid h-6 w-6 flex-none place-items-center rounded-md border border-line bg-ink-2 text-[12px] text-fg-3 hover:border-[#7b3a45] hover:text-[#ffb3bd]"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`volumen-${pista.id}`}
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={pista.volumen}
          onChange={(e) => alCambiar({ volumen: Number(e.target.value) })}
          onDoubleClick={() => alCambiar({ volumen: 1 })}
          aria-label={`Volumen de ${nombre}`}
          title="Doble clic: 0 dB"
          className={`h-3.5 min-w-0 flex-1 accent-(--color) ${apagada ? "opacity-40" : ""}`}
        />
        <span className="w-9 text-right font-mono text-[11px] text-fg-2 tabular-nums">{formatoDb(pista.volumen)}</span>
      </div>

      {propia && (
        <div
          className="flex items-center gap-1 text-[11px] text-fg-3"
          title="Para alinearla: arrastra su onda, o usa ‹ › (10 ms; con Shift, 100 ms)"
        >
          <span>Inicio</span>
          <BotonChico etiqueta="Mover antes" onClick={(e) => mover(e, -1)}>
            ‹
          </BotonChico>
          <span className="min-w-[66px] text-center font-mono text-fg-2">
            {formatoDesfase(pista.desfase_ms / 1000)}
          </span>
          <BotonChico etiqueta="Mover después" onClick={(e) => mover(e, 1)}>
            ›
          </BotonChico>
          {pista.desfase_ms !== 0 && (
            <BotonChico etiqueta="Volver a 0" onClick={() => alCambiar({ desfase_ms: 0 })}>
              0
            </BotonChico>
          )}
        </div>
      )}
    </div>
  );
}

function BotonChico(props: { etiqueta: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      aria-label={props.etiqueta}
      title={props.etiqueta}
      className="grid h-5 min-w-5 place-items-center rounded border border-line bg-ink-2 px-1 font-mono text-fg-2 hover:text-fg"
    >
      {props.children}
    </button>
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
      className={`h-6 w-6 flex-none rounded-md border text-[11px] font-semibold ${
        props.activo ? props.colorActivo : "border-line bg-ink-2 text-fg-3 hover:text-fg"
      }`}
    >
      {props.texto}
    </button>
  );
}
