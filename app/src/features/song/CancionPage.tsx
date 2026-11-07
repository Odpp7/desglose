import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { IconoAtras } from "../../components/icons";
import { obtenerCancion, type Cancion } from "../../lib/db";
import { formatoDuracion } from "../library/FilaCancion";

// Página de una canción. Por ahora muestra sus datos; en el paso 3
// el botón "Crear secuencia" la manda a separar, y en el paso 4
// esta página se convierte en el editor.

export function CancionPage() {
  const { id } = useParams();
  const [cancion, setCancion] = useState<Cancion | null | undefined>(undefined);

  useEffect(() => {
    obtenerCancion(Number(id)).then(setCancion, () => setCancion(null));
  }, [id]);

  if (cancion === undefined) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <Link
          to="/"
          aria-label="Volver a la biblioteca"
          className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-ink-3 hover:text-fg"
        >
          <IconoAtras />
        </Link>
        <h1 className="m-0 truncate font-display text-lg font-semibold tracking-tight">
          {cancion?.titulo ?? "Canción no encontrada"}
        </h1>
      </header>

      {cancion && (
        <section className="grid place-items-center px-6 py-20 text-center">
          <div className="max-w-md">
            <p className="m-0 font-mono text-fg-2">{formatoDuracion(cancion.duracion_ms)}</p>
            <h2 className="mt-4 mb-0 font-display text-base font-semibold">Todavía no tiene secuencia</h2>
            <p className="mt-2 leading-relaxed text-fg-3">
              Desglose separará los instrumentos y propondrá las secciones.
            </p>
            <button
              disabled
              title="Llega en el paso 3"
              className="mt-5 rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
            >
              Crear secuencia
            </button>
            <p className="mt-2 text-[11.5px] text-fg-3">Disponible en el paso 3.</p>
          </div>
        </section>
      )}
    </div>
  );
}
