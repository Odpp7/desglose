import { useEffect, useMemo, useRef, useState } from "react";
import type { Cancion } from "../../lib/db";
import { motor, type PistaMotor } from "../../lib/engine";
import { instrumento } from "../../lib/instrumentos";
import { PISTA_NUEVA, mezclaDe, type EstadoPista } from "../../lib/sesion";
import { CabeceraPista } from "./CabeceraPista";
import { ALTO_REGLA, LineaTiempo, type FilaOnda } from "./LineaTiempo";
import { Transporte } from "./Transporte";

// El editor de una canción ya separada:
//
//   ┌ MEZCLADOR ─────┬──────────── línea de tiempo (ondas) ────────────┐
//   │ ● Voz líder M S│ ▁▃▅▇▅▃▁▁▃▅▇▇▅▃                                   │
//   │ ━━━━●━━  -1.5  │                                                  │
//   │ ● Bajo     M S │ ▁▁▃▃▃▃▁▁▃▃▃▃▃▃                                   │
//   └────────────────┴──────────────────────────────────────────────────┘
//   TRANSPORTE · POSICIÓN · VELOCIDAD · TONALIDAD · CLICK · Exportar
//
// Las pistas se estiran para llenar todo el alto (como en la captura de referencia).
// Al entrar, carga la canción en el motor. Si el motor ya la tenía (porque se
// abrió otra cosa y se volvió), no la recarga: sigue en el mismo punto, y la
// mezcla se recupera de la sesión.

type Props = {
  cancion: Cancion;
  /** Instrumentos según SQLite. Si cambian (se separó algo más), se recarga. */
  instrumentos: string;
};

/** Alto mínimo de una pista: si hay muchas, aparece la barra de desplazamiento. */
const ALTO_MINIMO = 64;

export function Editor({ cancion, instrumentos }: Props) {
  const id = cancion.id;
  const [pistas, setPistas] = useState<PistaMotor[]>([]);
  const [mezcla, setMezcla] = useState<Map<string, EstadoPista>>(() => new Map(mezclaDe(id)));
  const [ondas, setOndas] = useState<Map<string, Uint8Array>>(new Map());
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const [error, setError] = useState("");
  const zona = useRef<HTMLDivElement>(null);
  const [altoZona, setAltoZona] = useState(0);

  // Alto disponible para las pistas: cambia al agrandar la ventana.
  useEffect(() => {
    const elemento = zona.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([e]) => setAltoZona(Math.floor(e.contentRect.height)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    let vigente = true;
    setError("");

    (async () => {
      const { pistas, yaEstaba } = await motor.cargarCancion(id);
      if (!vigente) return;
      setPistas(pistas);

      // Si el motor la cargó de nuevo, se le aplica la mezcla guardada.
      const guardada = mezclaDe(id);
      if (!yaEstaba) {
        for (const [i, p] of pistas.entries()) {
          const e = guardada.get(p.instrumento) ?? PISTA_NUEVA;
          await motor.volumen(i, e.volumen);
          await motor.mute(i, e.mute);
          await motor.solo(i, e.solo);
        }
        // El click (después de las pistas) queda callado hasta el paso 5.
        await motor.mute(pistas.length, true);
      }
      setMezcla(new Map(guardada));

      // Las ondas, una por una: la primera vez cada una tarda un momento.
      for (const p of pistas) {
        if (!vigente) return;
        const picos = await motor.ondas(id, p.instrumento).catch(() => new Uint8Array());
        if (vigente) setOndas((antes) => new Map(antes).set(p.instrumento, picos));
      }
    })().catch((e) => vigente && setError(String(e)));

    return () => {
      vigente = false;
    };
  }, [id, instrumentos]);

  function cambiar(indice: number, clave: string, cambio: Partial<EstadoPista>) {
    const nuevo = { ...(mezcla.get(clave) ?? PISTA_NUEVA), ...cambio };
    mezclaDe(id).set(clave, nuevo);
    setMezcla((antes) => new Map(antes).set(clave, nuevo));
    const orden =
      cambio.volumen !== undefined
        ? motor.volumen(indice, nuevo.volumen)
        : cambio.mute !== undefined
          ? motor.mute(indice, nuevo.mute)
          : motor.solo(indice, nuevo.solo);
    orden.catch((e) => setError(String(e)));
  }

  // Qué pistas se ven. El índice en el motor se conserva aunque se oculten.
  const visibles = useMemo(
    () => pistas.map((p, indice) => ({ ...p, indice })).filter((p) => !p.vacia || mostrarVacias),
    [pistas, mostrarVacias],
  );
  const ocultas = pistas.filter((p) => p.vacia);
  const haySolo = [...mezcla.values()].some((e) => e.solo);

  // Cada pista toma una parte igual del alto disponible (nunca menos del mínimo).
  const altoFila =
    visibles.length > 0 ? Math.max(ALTO_MINIMO, Math.floor((altoZona - ALTO_REGLA) / visibles.length)) : ALTO_MINIMO;

  const filas: FilaOnda[] = useMemo(
    () =>
      visibles.map((p) => {
        const e = mezcla.get(p.instrumento) ?? PISTA_NUEVA;
        return {
          instrumento: p.instrumento,
          color: instrumento(p.instrumento).color,
          picos: ondas.get(p.instrumento),
          apagada: e.mute || (haySolo && !e.solo),
        };
      }),
    [visibles, mezcla, ondas, haySolo],
  );

  const duracion = cancion.duracion_ms / 1000;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="m-0 border-b border-line bg-[#3a1d24] px-5 py-2 text-[#ffb3bd]">
          {error}
        </p>
      )}

      {/* Cabeceras y ondas se desplazan juntas si las pistas no caben. */}
      <div ref={zona} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[236px_1fr]">
          <div className="border-r border-line bg-ink-1">
            <div
              style={{ height: ALTO_REGLA }}
              className="flex items-center justify-between border-b border-line bg-ink-0 px-3"
            >
              <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Mezclador</span>
              {ocultas.length > 0 && (
                <button
                  onClick={() => setMostrarVacias((v) => !v)}
                  title={`Casi no suenan: ${ocultas.map((p) => instrumento(p.instrumento).nombre).join(", ")}`}
                  className="text-[11px] text-fg-3 hover:text-fg"
                >
                  {mostrarVacias ? "Ocultar vacías" : `+${ocultas.length} vacía${ocultas.length > 1 ? "s" : ""}`}
                </button>
              )}
            </div>
            {visibles.map((p) => (
              <CabeceraPista
                key={p.instrumento}
                clave={p.instrumento}
                alto={altoFila}
                vacia={p.vacia}
                estado={mezcla.get(p.instrumento) ?? PISTA_NUEVA}
                alCambiar={(cambio) => cambiar(p.indice, p.instrumento, cambio)}
              />
            ))}
          </div>
          <LineaTiempo
            filas={filas}
            altoFila={altoFila}
            duracion={duracion}
            alSaltar={(s) => motor.buscar(s).catch((e) => setError(String(e)))}
          />
        </div>
      </div>

      <Transporte duracion={duracion} alError={setError} />
    </div>
  );
}
