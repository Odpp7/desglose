import { useEffect, useState } from "react";
import { Encabezado } from "../../components/Encabezado";
import { guardarClaveMvsep, hayClaveMvsep } from "../../lib/ajustes";

// Ajustes. Por ahora solo la clave de MVSep, que hace falta para crear secuencias.
// La clave se guarda en Rust y nunca se vuelve a mostrar: aquí solo se sabe si hay una.

export function SettingsPage() {
  const [hayClave, setHayClave] = useState<boolean | null>(null);
  const [clave, setClave] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    hayClaveMvsep().then(setHayClave, () => setHayClave(false));
  }, []);

  async function guardar(nueva: string) {
    setAviso("");
    try {
      await guardarClaveMvsep(nueva);
      setHayClave(nueva.trim() !== "");
      setClave("");
      setAviso(nueva.trim() ? "Clave guardada" : "Clave borrada");
    } catch (e) {
      setAviso(String(e));
    }
  }

  return (
    <>
      <Encabezado titulo="Ajustes" />

      <section className="max-w-xl px-6 py-6">
        <h2 className="m-0 font-display text-base font-semibold">Clave de MVSep</h2>
        <p className="mt-2 leading-relaxed text-fg-3">
          MVSep es el servicio gratuito que separa los instrumentos. Crea una cuenta en mvsep.com y copia tu clave
          desde la página de tu cuenta (API token). La canción se sube a MVSep para separarla.
        </p>

        <p className="mt-4 mb-2 flex items-center gap-2">
          Estado:
          {hayClave === null ? null : hayClave ? (
            <span className="rounded-full bg-[#173a33] px-2 py-0.5 text-[11px] text-[#7fe0c8]">Guardada</span>
          ) : (
            <span className="rounded-full bg-[#3a1d24] px-2 py-0.5 text-[11px] text-[#ffb3bd]">Falta</span>
          )}
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (clave.trim()) guardar(clave);
          }}
        >
          <input
            id="clave-mvsep"
            type="password"
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={hayClave ? "Pega una clave nueva para cambiarla" : "Pega aquí tu clave"}
            aria-label="Clave de MVSep"
            className="min-w-0 flex-1 rounded-lg border border-line bg-ink-2 px-3 py-2 font-mono text-[12px] placeholder:font-sans placeholder:text-fg-3"
          />
          <button
            type="submit"
            disabled={!clave.trim()}
            className="rounded-lg bg-accent px-4 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
          >
            Guardar
          </button>
        </form>

        {hayClave && (
          <button onClick={() => guardar("")} className="mt-3 text-[12px] text-fg-3 hover:text-[#ff9aa8]">
            Borrar la clave guardada
          </button>
        )}
        {aviso && <p className="mt-3 text-fg-2">{aviso}</p>}
      </section>
    </>
  );
}
