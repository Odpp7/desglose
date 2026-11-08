import { useEffect, useRef, useState } from "react";
import { IconoInicio, IconoPausa, IconoPlay } from "../../components/icons";
import { escucharEstado, formatoTiempo, motor } from "../../lib/engine";
import { formatoSemitonos, transponer } from "../../lib/tonos";

// Barra de abajo, por bloques con título (como en la captura de referencia):
//   TRANSPORTE · POSICIÓN · VELOCIDAD · TONALIDAD · CLICK · Exportar
// Funcionan Transporte, Posición, Velocidad y Tonalidad. Click y Exportar ya están
// en su lugar, apagados, y se encienden en su paso (5: click, 8: exportar).
//
// Velocidad y Tonalidad cambian lo que se ESCUCHA (para ensayar o cantar en otro
// tono). El click no cambia de tono. Exportar en otro tono llega en el paso 8.
//
// La barra espaciadora reproduce o pausa (salvo mientras se escribe en un campo).
// El tiempo se escribe directo en el texto, sin pasar por el estado de React.

/** Velocidad (1 = normal) y semitonos (0 = tono original). */
export type Estudio = { velocidad: number; semitonos: number };

type Props = {
  duracion: number;
  estudio: Estudio;
  /** Tono original de la canción, para mostrar "A → B (+2)". */
  tono: string | null;
  alCambiarEstudio: (estudio: Estudio) => void;
  alError: (e: string) => void;
};

const VELOCIDAD_MINIMA = 0.5;
const VELOCIDAD_MAXIMA = 1.5;
const SEMITONOS_MAXIMOS = 6;

export function Transporte({ duracion, estudio, tono, alCambiarEstudio, alError }: Props) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const tiempo = useRef<HTMLSpanElement>(null);
  const sonando = useRef(false);

  useEffect(() => {
    const dejar = escucharEstado((estado) => {
      if (tiempo.current) tiempo.current.textContent = formatoTiempo(estado.posicion);
      sonando.current = estado.reproduciendo;
      // Solo cambia al tocar play o pausa: React vuelve a dibujar solo entonces.
      setReproduciendo((antes) => (antes === estado.reproduciendo ? antes : estado.reproduciendo));
    });
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  const alternar = () => (sonando.current ? motor.pausa() : motor.play()).catch((e) => alError(String(e)));

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLInputElement && e.target.type !== "range";
      if (e.code !== "Space" || escribiendo || e.repeat) return;
      e.preventDefault();
      alternar();
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, []);

  return (
    <footer className="flex items-stretch gap-0 border-t border-line bg-ink-0 px-2 py-2.5">
      <Bloque titulo="Transporte">
        <button
          aria-label="Ir al inicio"
          title="Ir al inicio"
          onClick={() => motor.buscar(0).catch((e) => alError(String(e)))}
          className="grid size-9 place-items-center rounded-lg border border-line bg-ink-2 text-fg-2 hover:text-fg"
        >
          <IconoInicio />
        </button>
        <button
          aria-label={reproduciendo ? "Pausar" : "Reproducir"}
          title="Reproducir o pausar (barra espaciadora)"
          onClick={alternar}
          className="grid h-9 w-12 place-items-center rounded-lg bg-accent text-accent-ink hover:brightness-110"
        >
          {reproduciendo ? <IconoPausa /> : <IconoPlay />}
        </button>
      </Bloque>

      <Bloque titulo="Posición">
        <div className="font-mono tabular-nums">
          <span ref={tiempo} className="text-[21px] font-semibold">
            0:00.0
          </span>
          <span className="ml-1.5 text-[13px] text-fg-3">/ {formatoTiempo(duracion).slice(0, -2)}</span>
        </div>
      </Bloque>

      <Bloque titulo="Velocidad">
        <Paso
          etiqueta="Más lento"
          deshabilitado={estudio.velocidad <= VELOCIDAD_MINIMA + 0.001}
          onClick={() => alCambiarEstudio({ ...estudio, velocidad: redondear(estudio.velocidad - 0.05) })}
        >
          −
        </Paso>
        <button
          title="Clic: velocidad normal"
          onClick={() => alCambiarEstudio({ ...estudio, velocidad: 1 })}
          className={`w-14 rounded-md py-1.5 font-mono text-[13px] ${
            estudio.velocidad === 1 ? "text-fg-2" : "bg-[#22305e] text-accent"
          }`}
        >
          {Math.round(estudio.velocidad * 100)}%
        </button>
        <Paso
          etiqueta="Más rápido"
          deshabilitado={estudio.velocidad >= VELOCIDAD_MAXIMA - 0.001}
          onClick={() => alCambiarEstudio({ ...estudio, velocidad: redondear(estudio.velocidad + 0.05) })}
        >
          +
        </Paso>
      </Bloque>

      <Bloque titulo="Tonalidad">
        <Paso
          etiqueta="Bajar medio tono"
          deshabilitado={estudio.semitonos <= -SEMITONOS_MAXIMOS}
          onClick={() => alCambiarEstudio({ ...estudio, semitonos: estudio.semitonos - 1 })}
        >
          −
        </Paso>
        <button
          title="Clic: tono original"
          onClick={() => alCambiarEstudio({ ...estudio, semitonos: 0 })}
          className={`min-w-14 rounded-md px-2 py-1.5 font-mono text-[13px] whitespace-nowrap ${
            estudio.semitonos === 0 ? "text-fg-2" : "bg-[#22305e] text-accent"
          }`}
        >
          {tono && estudio.semitonos !== 0
            ? `${tono} → ${transponer(tono, estudio.semitonos)} (${formatoSemitonos(estudio.semitonos)})`
            : tono && estudio.semitonos === 0
              ? tono
              : formatoSemitonos(estudio.semitonos)}
        </button>
        <Paso
          etiqueta="Subir medio tono"
          deshabilitado={estudio.semitonos >= SEMITONOS_MAXIMOS}
          onClick={() => alCambiarEstudio({ ...estudio, semitonos: estudio.semitonos + 1 })}
        >
          +
        </Paso>
      </Bloque>

      <Bloque titulo="Click" apagado="Llega en el paso 5">
        <Segmentos opciones={["Apagado"]} elegido={0} />
      </Bloque>

      <div className="ml-auto flex items-center pr-2">
        <button
          disabled
          title="Llega en el paso 8"
          className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-35"
        >
          Exportar a REAPER
        </button>
      </div>
    </footer>
  );
}

/** Un bloque de la barra: título chico arriba y sus controles abajo. */
function Bloque({ titulo, apagado, children }: { titulo: string; apagado?: string; children: React.ReactNode }) {
  return (
    <div
      title={apagado}
      className={`flex flex-col justify-center gap-1.5 border-r border-line px-4 ${apagado ? "opacity-35" : ""}`}
    >
      <span className="text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{titulo}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Evita arrastrar decimales: 0.7499999 → 0.75. */
function redondear(v: number) {
  return Math.round(v * 100) / 100;
}

function Paso(props: {
  etiqueta: string;
  deshabilitado: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={props.etiqueta}
      title={props.etiqueta}
      disabled={props.deshabilitado}
      onClick={props.onClick}
      className="grid size-8 place-items-center rounded-md border border-line bg-ink-2 font-mono text-[15px] text-fg-2 hover:text-fg disabled:opacity-35"
    >
      {props.children}
    </button>
  );
}

function Segmentos({ opciones, elegido }: { opciones: string[]; elegido: number }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {opciones.map((o, i) => (
        <span
          key={o}
          className={`px-2.5 py-1.5 font-mono text-[12px] ${i === elegido ? "bg-ink-3 text-fg" : "bg-ink-2 text-fg-3"}`}
        >
          {o}
        </span>
      ))}
    </div>
  );
}
