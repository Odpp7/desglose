import { useEffect, useRef, useState } from "react";
import { IconoInicio, IconoPausa, IconoPlay } from "../../components/icons";
import { escucharEstado, formatoTiempo, motor } from "../../lib/engine";

// Barra de abajo, por bloques con título (como en la captura de referencia):
//   TRANSPORTE · POSICIÓN · VELOCIDAD · TONALIDAD · CLICK · Exportar
// Hoy funcionan Transporte y Posición. Los demás bloques ya están en su lugar,
// apagados, y se encienden en su paso (5: click, 8: exportar, 9: velocidad y tono).
//
// La barra espaciadora reproduce o pausa (salvo mientras se escribe en un campo).
// El tiempo se escribe directo en el texto, sin pasar por el estado de React.

export function Transporte({ duracion, alError }: { duracion: number; alError: (e: string) => void }) {
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

      <Bloque titulo="Velocidad" apagado="Llega en el paso 9 (estudio)">
        <Segmentos opciones={["0.75x", "1x", "1.1x"]} elegido={1} />
      </Bloque>

      <Bloque titulo="Tonalidad" apagado="Llega en el paso 9 (estudio)">
        <Segmentos opciones={["−", "0", "+"]} elegido={1} />
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
