import { Encabezado } from "../../components/Encabezado";
import { IconoEstudio } from "../../components/icons";

// Estudio: la sección para ensayar, aparte de la Biblioteca (como en Moises).
// Llega en una actualización futura (docs/decisiones.md, 9 de noviembre).
// Por ahora solo cuenta qué vendrá. Velocidad y tono para escuchar ya están en el editor.

const PROXIMAMENTE = [
  "Repetir un tramo en bucle (por ejemplo, el puente)",
  "Ensayar un instrumento solo, más lento",
  "Acordes, notas y tablatura",
];

export function EstudioPage() {
  return (
    <>
      <Encabezado titulo="Estudio" />
      <section className="mx-auto max-w-md px-6 py-16 text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-line-2 bg-ink-2 text-accent">
          <IconoEstudio size={26} />
        </span>
        <h2 className="m-0 font-display text-lg font-semibold">Próximamente</h2>
        <p className="mt-2 leading-relaxed text-fg-3">
          Una sección para ensayar las canciones de la biblioteca. Llega en una próxima actualización:
        </p>
        <ul className="mx-auto mt-4 inline-block list-none p-0 text-left text-fg-2">
          {PROXIMAMENTE.map((cosa) => (
            <li key={cosa} className="mb-1.5 flex gap-2">
              <span className="text-accent">•</span>
              {cosa}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12.5px] text-fg-3">
          Mientras tanto, la velocidad y el tono para escuchar están en el transporte de cada canción.
        </p>
      </section>
    </>
  );
}
