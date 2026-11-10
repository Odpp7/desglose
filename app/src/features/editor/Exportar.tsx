import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { formatoSemitonos, transponer } from "../../lib/tonos";

// Ventana "Exportar a REAPER". Muestra qué va a salir (lo que se escucha ahora) y
// arma el paquete con Rust (`src-tauri/src/export/mod.rs`):
//
//   Yo soy la ofrenda - 147bpm - F#m (105%, +2)/
//     Yo soy la ofrenda.RPP
//     01 CLICK.wav      (si el click está encendido)
//     02 GUIA.wav       (si la guía está encendida)
//     03 Voz líder.wav  ... (las pistas con R encendida)
//
// La velocidad y el tono son los del transporte. Fuera de 80–120% o de ±4
// semitonos se avisa: el estirador se oye peor, pero igual se puede exportar.

/** Lo que se exporta, ya armado por el editor (todo en la línea de la app). */
export type Paquete = {
  titulo: string;
  tono: string | null;
  bpm: number | null;
  tiempos: number;
  velocidad: number;
  semitonos: number;
  duracion: number;
  pistas: { nombre: string; archivo: string; desfase: number; volumen: number }[];
  click: { bpm: number; tiempos: number; inicio: number; conteo: number; volumen: number } | null;
  guia: [number, string][] | null;
  volumenGuia: number;
  secciones: { nombre: string; inicio: number; fin: number }[];
  /** Pistas con R apagada (para mostrar qué no va). */
  fuera: string[];
};

type Props = {
  cancionId: number;
  paquete: Paquete;
  alCerrar: () => void;
};

const CLAVE_DESTINO = "desglose.carpetaExportar";

/** "Yo soy la ofrenda - 147bpm - F#m (105%, +2)" */
export function nombreCarpeta(p: Paquete) {
  const partes = [p.titulo];
  if (p.bpm) partes.push(`${formatoNumero(p.bpm * p.velocidad)}bpm`);
  const tono = p.tono ? transponer(p.tono, p.semitonos) : null;
  if (tono) partes.push(tono);
  const cambios = [];
  if (p.velocidad !== 1) cambios.push(`${Math.round(p.velocidad * 100)}%`);
  if (p.semitonos !== 0) cambios.push(formatoSemitonos(p.semitonos));
  return partes.join(" - ") + (cambios.length ? ` (${cambios.join(", ")})` : "");
}

function formatoNumero(n: number) {
  const redondo = Math.round(n * 10) / 10;
  return Number.isInteger(redondo) ? String(redondo) : redondo.toFixed(1);
}

export function Exportar({ cancionId, paquete, alCerrar }: Props) {
  const [destino, setDestino] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_DESTINO);
    } catch {
      return null;
    }
  });
  const [estado, setEstado] = useState<"listo" | "exportando" | "hecho">("listo");
  const [avance, setAvance] = useState(0);
  const [carpeta, setCarpeta] = useState("");
  const [error, setError] = useState("");
  const nombre = nombreCarpeta(paquete);
  const fueraDeRango =
    paquete.velocidad < 0.8 || paquete.velocidad > 1.2 || Math.abs(paquete.semitonos) > 4;

  useEffect(() => {
    const dejar = listen<number>("avance-exportar", (e) => setAvance(e.payload));
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  // Escape cierra, salvo mientras exporta (ahí está "Cancelar").
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && estado !== "exportando" && alCerrar();
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [estado, alCerrar]);

  async function elegirDestino() {
    const elegida = await open({ directory: true, title: "Dónde guardar el paquete para REAPER" });
    if (typeof elegida !== "string") return;
    setDestino(elegida);
    try {
      localStorage.setItem(CLAVE_DESTINO, elegida);
    } catch {
      // Sin almacenamiento, la próxima vez se vuelve a elegir.
    }
  }

  async function exportar() {
    if (!destino) return;
    setError("");
    setAvance(0);
    setEstado("exportando");
    try {
      const creada = await invoke<string>("exportar_paquete", {
        id: cancionId,
        pedido: {
          destino,
          carpeta: nombre,
          proyecto: paquete.titulo,
          pistas: paquete.pistas,
          click: paquete.click,
          guia: paquete.guia,
          volumenGuia: paquete.volumenGuia,
          bpm: paquete.bpm ?? 120,
          tiempos: paquete.tiempos,
          secciones: paquete.secciones,
          duracion: paquete.duracion,
          velocidad: paquete.velocidad,
          semitonos: paquete.semitonos,
        },
      });
      setCarpeta(creada);
      setEstado("hecho");
    } catch (e) {
      setError(String(e));
      setEstado("listo");
    }
  }

  const archivos = [
    ...(paquete.click ? ["CLICK"] : []),
    ...(paquete.guia ? ["GUIA"] : []),
    ...paquete.pistas.map((p) => p.nombre),
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55">
      <div role="dialog" aria-labelledby="exportar-titulo" className="w-[480px] rounded-xl border border-line-2 bg-ink-2 p-5 shadow-xl shadow-black/40">
        <h2 id="exportar-titulo" className="m-0 font-display text-base font-semibold">
          Exportar a REAPER
        </h2>
        <p className="mt-1 mb-4 text-[12.5px] text-fg-3">Sale tal como lo escuchas ahora en la app.</p>

        <Fila titulo="Carpeta">
          <span className="font-mono text-[12.5px] break-all">{nombre}</span>
        </Fila>
        <Fila titulo="Archivos">
          <span className="text-[12.5px] leading-relaxed">
            {archivos.map((a, i) => `${String(i + 1).padStart(2, "0")} ${a}`).join(" · ")}
            <span className="text-fg-3"> · {paquete.titulo}.RPP con las secciones como regiones</span>
          </span>
        </Fila>
        {paquete.fuera.length > 0 && (
          <Fila titulo="No van">
            <span className="text-[12.5px] text-fg-3">{paquete.fuera.join(", ")} (R apagada)</span>
          </Fila>
        )}
        {(paquete.velocidad !== 1 || paquete.semitonos !== 0) && (
          <Fila titulo="Cambios">
            <span className="text-[12.5px]">
              {paquete.velocidad !== 1 && `Velocidad ${Math.round(paquete.velocidad * 100)}%. `}
              {paquete.semitonos !== 0 &&
                `Tono ${paquete.tono ? `${paquete.tono} → ${transponer(paquete.tono, paquete.semitonos)} ` : ""}(${formatoSemitonos(paquete.semitonos)}). `}
              El click y la guía no cambian de tono.
            </span>
          </Fila>
        )}
        {fueraDeRango && (
          <p className="m-0 mb-2 rounded-lg bg-[#3a2c14] px-3 py-2 text-[12px] text-[#f0c27a]">
            Fuera de 80–120% o de ±4 semitonos el audio se oye menos natural. Se puede exportar igual.
          </p>
        )}

        <Fila titulo="Guardar en">
          <button
            onClick={elegirDestino}
            disabled={estado === "exportando"}
            className="min-w-0 flex-1 truncate rounded-md border border-line bg-ink-1 px-2 py-1 text-left text-[12.5px] text-fg-2 hover:text-fg"
            title={destino ?? undefined}
          >
            {destino ?? "Elegir carpeta…"}
          </button>
        </Fila>

        {estado === "exportando" && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(avance * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[12px] text-fg-3">Exportando… {Math.round(avance * 100)}%</p>
          </div>
        )}
        {estado === "hecho" && (
          <p className="mt-4 rounded-lg bg-[#173a33] px-3 py-2 text-[12.5px] text-[#7fe0c8]">
            Listo. Ábrelo en REAPER con el archivo .RPP de la carpeta.
          </p>
        )}
        {error && <p className="mt-4 rounded-lg bg-[#3a1d24] px-3 py-2 text-[12.5px] text-[#ffb3bd]">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {estado === "exportando" ? (
            <button
              onClick={() => invoke("cancelar_exportacion")}
              className="rounded-lg border border-line-2 px-4 py-2 text-fg-2 hover:text-fg"
            >
              Cancelar
            </button>
          ) : (
            <button onClick={alCerrar} className="rounded-lg border border-line-2 px-4 py-2 text-fg-2 hover:text-fg">
              Cerrar
            </button>
          )}
          {estado === "hecho" ? (
            <button
              onClick={() => invoke("abrir_carpeta", { ruta: carpeta }).catch((e) => setError(String(e)))}
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink hover:brightness-110"
            >
              Abrir carpeta
            </button>
          ) : (
            <button
              onClick={exportar}
              disabled={!destino || estado === "exportando" || archivos.length === 0}
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
            >
              Exportar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-start gap-3">
      <span className="w-20 flex-none pt-0.5 text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{titulo}</span>
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
