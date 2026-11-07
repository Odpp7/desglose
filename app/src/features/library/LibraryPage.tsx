import { Link } from "react-router";
import { Encabezado } from "../../components/Encabezado";
import { IconoMas } from "../../components/icons";

// Biblioteca: por ahora vacía. En el paso 2 se llena desde SQLite,
// con búsqueda y colecciones.
export function LibraryPage() {
  return (
    <>
      <Encabezado titulo="Biblioteca" ayuda="Tus canciones y sus secuencias.">
        <Link
          to="/nueva"
          className="flex items-center gap-2 rounded-[10px] bg-accent px-3.5 py-2 font-semibold text-accent-ink hover:brightness-110"
        >
          <IconoMas size={16} />
          Nueva canción
        </Link>
      </Encabezado>

      <section className="grid place-items-center px-6 py-24 text-center">
        <div className="max-w-sm">
          <h2 className="m-0 font-display text-base font-semibold">Agrega tu primera canción</h2>
          <p className="mt-2 text-fg-3">
            Carga un MP3, WAV o FLAC y Desglose arma la secuencia: pistas separadas, secciones y
            voz guía.
          </p>
        </div>
      </section>
    </>
  );
}
