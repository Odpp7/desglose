import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Confirmar } from "../../components/Confirmar";
import { IconoMas } from "../../components/icons";
import { FORMATOS, borrarPistaPropia, copiarPistaPropia, sinExtension } from "../../lib/archivos";
import { avisarCambio } from "../../lib/cambios";
import * as db from "../../lib/db";
import type { CambioPista, Cancion, Pista } from "../../lib/db";
import { escucharEstado, motor } from "../../lib/engine";
import { datosPista } from "../../lib/instrumentos";
import { CabeceraPista } from "./CabeceraPista";
import { ALTO_REGLA, LineaTiempo, type FilaOnda } from "./LineaTiempo";
import { Transporte, type Estudio } from "./Transporte";

// El editor de una canción ya separada:
//
//   ┌ MEZCLADOR  + Añadir pista ┬───────── línea de tiempo (ondas) ─────────┐
//   │ ● Voz líder      M S R   │ ▁▃▅▇▅▃▁▁▃▅▇▇▅▃                             │
//   │ ━━━━●━━          -1.5   │                                            │
//   │ ● Mi teclado  ⋯  M S R   │      ▁▃▅▇▅▃ (propia: se arrastra)          │
//   └──────────────────────────┴────────────────────────────────────────────┘
//   TRANSPORTE · POSICIÓN · VELOCIDAD · TONALIDAD · CLICK · Exportar
//
// La mezcla (volumen, M, S, R) y el desfase de las pistas propias se guardan en
// SQLite: siguen igual al cerrar y abrir la app.
// Al entrar, carga las pistas en el motor. Si el motor ya las tenía igual (se
// abrió otra cosa y se volvió), no las recarga: sigue en el mismo punto.

type Props = {
  cancion: Cancion;
  /** Las pistas según SQLite (separadas y propias), en orden. */
  pistas: Pista[];
};

/** Alto mínimo de una pista: si hay muchas, aparece la barra de desplazamiento. */
const ALTO_MINIMO = 64;
/** Espera antes de guardar el volumen en SQLite mientras se mueve el fader. */
const ESPERA_GUARDAR_MS = 400;

export function Editor({ cancion, pistas: desdeBase }: Props) {
  const id = cancion.id;
  // Copia local para que el fader responda al instante; se guarda en SQLite aparte.
  const [pistas, setPistas] = useState<Pista[]>(desdeBase);
  const [ondas, setOndas] = useState<Map<string, Uint8Array>>(new Map());
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const [porQuitar, setPorQuitar] = useState<Pista | null>(null);
  const [error, setError] = useState("");
  const zona = useRef<HTMLDivElement>(null);
  const [altoZona, setAltoZona] = useState(0);
  // Velocidad y tono para ensayar. No se guardan: al abrir la canción vuelven a lo normal.
  const [estudio, setEstudio] = useState<Estudio>({ velocidad: 1, semitonos: 0 });
  const estudioActual = useRef(estudio);

  function cambiarEstudio(nuevo: Estudio) {
    setEstudio(nuevo);
    estudioActual.current = nuevo;
    motor.estudio(nuevo.velocidad, nuevo.semitonos).catch((e) => setError(String(e)));
  }

  useEffect(() => setPistas(desdeBase), [desdeBase]);

  // Alto disponible para las pistas: cambia al agrandar la ventana.
  useEffect(() => {
    const elemento = zona.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([e]) => setAltoZona(Math.floor(e.contentRect.height)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Dónde iba la canción: si hay que recargar el motor (se movió una pista propia),
  // se vuelve a ese punto y, si sonaba, sigue sonando.
  const ultimo = useRef({ posicion: 0, reproduciendo: false });
  useEffect(() => {
    const dejar = escucharEstado((e) => {
      ultimo.current = { posicion: e.posicion, reproduciendo: e.reproduciendo };
    });
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  // Qué se carga en el motor: archivos y desfases. Si cambia, se recarga.
  const carga = useMemo(
    () => desdeBase.map((p) => ({ archivo: p.archivo, desfaseMs: p.desfase_ms })),
    [desdeBase],
  );
  const claveCarga = JSON.stringify(carga);
  const cargadaAntes = useRef(false);

  useEffect(() => {
    let vigente = true;
    setError("");
    (async () => {
      const volver = cargadaAntes.current ? { ...ultimo.current } : null;
      const yaEstaba = await motor.cargarCancion(id, carga);
      if (!vigente) return;
      cargadaAntes.current = true;
      // El motor y la pantalla deben estar de acuerdo en la velocidad y el tono.
      await motor.estudio(estudioActual.current.velocidad, estudioActual.current.semitonos);

      if (!yaEstaba) {
        // El motor la abrió de nuevo: se le aplica la mezcla guardada.
        for (const [i, p] of desdeBase.entries()) {
          await motor.volumen(i, p.volumen);
          await motor.mute(i, !!p.mute);
          await motor.solo(i, !!p.solo);
        }
        // El click (después de las pistas) queda callado hasta el paso 5.
        await motor.mute(desdeBase.length, true);
        if (volver && volver.posicion > 0) {
          await motor.buscar(volver.posicion);
          if (volver.reproduciendo) await motor.play();
        }
      }

      // Las ondas que falten, una por una: la primera vez cada una tarda un momento.
      for (const p of desdeBase) {
        if (!vigente) return;
        if (ondas.has(p.archivo)) continue;
        const picos = await motor.ondas(id, p.archivo).catch(() => new Uint8Array());
        if (vigente) setOndas((antes) => new Map(antes).set(p.archivo, picos));
      }
    })().catch((e) => vigente && setError(String(e)));

    return () => {
      vigente = false;
    };
    // `carga` y `desdeBase` cambian juntos con `claveCarga`.
  }, [id, claveCarga]);

  // Guardar el volumen en SQLite se espera un momento (el fader manda muchos cambios).
  const esperas = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  function cambiar(indice: number, pista: Pista, cambio: CambioPista) {
    setPistas((antes) => antes.map((p) => (p.id === pista.id ? { ...p, ...cambio } : p)));
    const fallo = (e: unknown) => setError(String(e));

    if (cambio.volumen !== undefined) {
      motor.volumen(indice, cambio.volumen).catch(fallo);
      clearTimeout(esperas.current.get(pista.id));
      esperas.current.set(
        pista.id,
        setTimeout(() => db.actualizarPista(pista.id, { volumen: cambio.volumen }).catch(fallo), ESPERA_GUARDAR_MS),
      );
      return;
    }
    if (cambio.mute !== undefined) motor.mute(indice, !!cambio.mute).catch(fallo);
    if (cambio.solo !== undefined) motor.solo(indice, !!cambio.solo).catch(fallo);
    db.actualizarPista(pista.id, cambio)
      .then(() => {
        // Un desfase nuevo cambia lo que se carga en el motor: se avisa para recargar.
        if (cambio.desfase_ms !== undefined) avisarCambio();
      })
      .catch(fallo);
  }

  async function anadirPista() {
    const elegido = await open({
      multiple: false,
      title: "Elegir una pista propia",
      filters: [{ name: "Audio", extensions: FORMATOS }],
    });
    if (!elegido) return;
    try {
      const copia = await copiarPistaPropia(id, elegido);
      await db.agregarPistaPropia(id, copia.archivo, sinExtension(elegido));
      avisarCambio();
    } catch (e) {
      setError(String(e));
    }
  }

  async function quitar(pista: Pista) {
    setPorQuitar(null);
    try {
      await borrarPistaPropia(id, pista.archivo);
      await db.borrarPista(pista.id);
      avisarCambio();
    } catch (e) {
      setError(String(e));
    }
  }

  // Qué pistas se ven. El índice en el motor se conserva aunque se oculten.
  const visibles = useMemo(
    () => pistas.map((p, indice) => ({ pista: p, indice })).filter(({ pista }) => !pista.vacia || mostrarVacias),
    [pistas, mostrarVacias],
  );
  const ocultas = pistas.filter((p) => p.vacia);
  const haySolo = pistas.some((p) => p.solo);

  // Cada pista toma una parte igual del alto disponible (nunca menos del mínimo).
  const altoFila =
    visibles.length > 0 ? Math.max(ALTO_MINIMO, Math.floor((altoZona - ALTO_REGLA) / visibles.length)) : ALTO_MINIMO;

  const filas: FilaOnda[] = useMemo(
    () =>
      visibles.map(({ pista: p }) => ({
        clave: String(p.id),
        color: datosPista(p).color,
        picos: ondas.get(p.archivo),
        apagada: !!p.mute || (haySolo && !p.solo),
        desfase: p.desfase_ms / 1000,
        movible: !!p.propia,
      })),
    [visibles, ondas, haySolo],
  );

  function alMover(clave: string, desfase: number) {
    const i = pistas.findIndex((p) => String(p.id) === clave);
    if (i >= 0) cambiar(i, pistas[i], { desfase_ms: Math.round(desfase * 1000) });
  }

  const duracion = cancion.duracion_ms / 1000;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="m-0 flex border-b border-line bg-[#3a1d24] px-5 py-2 text-[#ffb3bd]">
          <span className="flex-1">{error}</span>
          <button aria-label="Cerrar aviso" onClick={() => setError("")} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </p>
      )}

      {/* Cabeceras y ondas se desplazan juntas si las pistas no caben. */}
      <div ref={zona} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[244px_1fr]">
          <div className="border-r border-line bg-ink-1">
            <div
              style={{ height: ALTO_REGLA }}
              className="flex items-center gap-2 border-b border-line bg-ink-0 px-3"
            >
              <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Mezclador</span>
              {ocultas.length > 0 && (
                <button
                  onClick={() => setMostrarVacias((v) => !v)}
                  title={`Casi no suenan: ${ocultas.map((p) => datosPista(p).nombre).join(", ")}`}
                  className="text-[11px] text-fg-3 hover:text-fg"
                >
                  {mostrarVacias ? "Ocultar vacías" : `+${ocultas.length} vacía${ocultas.length > 1 ? "s" : ""}`}
                </button>
              )}
              <button
                onClick={anadirPista}
                title="Agrega un archivo tuyo (por ejemplo, un teclado grabado aparte) como una pista más"
                className="ml-auto flex items-center gap-1 rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg"
              >
                <IconoMas size={12} />
                Añadir pista
              </button>
            </div>
            {visibles.map(({ pista, indice }) => (
              <CabeceraPista
                key={pista.id}
                pista={pista}
                alto={altoFila}
                alCambiar={(cambio) => cambiar(indice, pista, cambio)}
                alQuitar={() => setPorQuitar(pista)}
              />
            ))}
          </div>
          <LineaTiempo
            filas={filas}
            altoFila={altoFila}
            duracion={duracion}
            alSaltar={(s) => motor.buscar(s).catch((e) => setError(String(e)))}
            alMover={alMover}
          />
        </div>
      </div>

      <Transporte
        duracion={duracion}
        estudio={estudio}
        tono={cancion.tono}
        alCambiarEstudio={cambiarEstudio}
        alError={setError}
      />

      {porQuitar && (
        <Confirmar
          titulo={`¿Quitar "${datosPista(porQuitar).nombre}"?`}
          texto="Se quita de esta canción. Tu archivo original no se toca: lo puedes volver a añadir."
          boton="Quitar pista"
          alConfirmar={() => quitar(porQuitar)}
          alCancelar={() => setPorQuitar(null)}
        />
      )}
    </div>
  );
}
