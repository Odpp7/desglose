import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { buscarVersionNueva, instalar } from "../lib/actualizar";

// Franja arriba de todo cuando hay una versión nueva de Desglose:
//
//   Hay una versión nueva de Desglose (0.2.0).   [Actualizar]  Después ✕
//
// Se busca una sola vez, al abrir la app. "Después" la oculta hasta la próxima
// vez que se abra. Nunca se actualiza sola.

export function AvisoVersion() {
  const [version, setVersion] = useState<Update | null>(null);
  const [oculto, setOculto] = useState(false);
  const [bajando, setBajando] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    // Un momento después de abrir, para no competir con la carga de la canción.
    const t = setTimeout(() => buscarVersionNueva().then(setVersion), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!version || oculto) return null;

  async function actualizar() {
    if (!version) return;
    setError("");
    setBajando(0);
    try {
      await instalar(version, setBajando);
    } catch (e) {
      setBajando(undefined);
      setError(`No se pudo actualizar: ${String(e)}. Puedes seguir usando esta versión.`);
    }
  }

  const trabajando = bajando !== undefined;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-line bg-[#22305e] px-5 py-2 text-[13px] text-fg">
      <span className="flex-1">
        {error ||
          (trabajando
            ? bajando === null
              ? "Bajando la versión nueva…"
              : `Bajando la versión nueva… ${Math.round(bajando * 100)}%. La app se reiniciará sola.`
            : `Hay una versión nueva de Desglose (${version.version}). Tus canciones y ajustes no se tocan.`)}
      </span>
      {!trabajando && (
        <>
          <button
            onClick={actualizar}
            className="rounded-md bg-accent px-3 py-1 font-semibold text-accent-ink hover:brightness-110"
          >
            Actualizar
          </button>
          <button onClick={() => setOculto(true)} className="text-fg-2 hover:text-fg">
            Después
          </button>
        </>
      )}
    </div>
  );
}
