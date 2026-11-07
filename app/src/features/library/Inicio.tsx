import { Navigate, useOutletContext } from "react-router";
import { IconoSubir } from "../../components/icons";
import { ultimaCancion } from "../../lib/sesion";

// Lo que se ve a la derecha cuando no hay canción abierta.
// Si ya se abrió una antes, se vuelve a ella directamente: así el editor
// nunca aparece vacío al abrir la app.

export function Inicio() {
  const { agregar } = useOutletContext<{ agregar: () => void }>();
  const ultima = ultimaCancion();
  if (ultima !== null) return <Navigate to={`/cancion/${ultima}`} replace />;

  return (
    <section className="grid flex-1 place-items-center p-8">
      <button
        onClick={agregar}
        className="flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-dashed border-line-2 px-8 py-14 text-center hover:border-accent/60 hover:bg-ink-2/40"
      >
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
          <IconoSubir size={22} />
        </span>
        <span className="font-display text-lg font-semibold">Agrega una canción</span>
        <span className="mt-2 max-w-sm leading-relaxed text-fg-3">
          Arrastra un MP3, WAV, FLAC o M4A a esta ventana, o haz clic aquí para elegirlo. Desglose separa los
          instrumentos y arma la secuencia.
        </span>
      </button>
    </section>
  );
}
