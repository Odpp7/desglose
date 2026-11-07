import { Encabezado } from "../../components/Encabezado";

// Nueva canción: por ahora vacía. En el paso 2 se elige el archivo y el nombre,
// y en el paso 3 aparece el botón "Crear secuencia" con su avance.
export function NewSongPage() {
  return (
    <>
      <Encabezado titulo="Nueva canción" ayuda="Elige el archivo de la canción." />
      <section className="p-6">
        <div className="grid h-48 place-items-center rounded-xl border border-dashed border-line-2 text-fg-3">
          Aquí se podrá soltar un MP3, WAV o FLAC.
        </div>
      </section>
    </>
  );
}
