// Agregar canciones a la biblioteca. Por cada archivo:
//   1. SQLite crea la fila y le da un id.
//   2. Rust copia el archivo a canciones\<id>\ y mide cuánto dura.
//   3. SQLite guarda el nombre del archivo y la duración.
// Si el paso 2 falla, se deshace el 1: no quedan canciones a medias.

import { FORMATOS, borrarCarpetaCancion, copiarCancion, extension, nombreArchivo, sinExtension } from "../../lib/archivos";
import { borrarCancion, crearCancion, guardarArchivo } from "../../lib/db";

export type ResultadoImportar = { agregadas: number[]; errores: string[] };

export async function importarCanciones(
  rutas: string[],
  coleccionId: number | null,
): Promise<ResultadoImportar> {
  const resultado: ResultadoImportar = { agregadas: [], errores: [] };

  // Una por una: la PC de la iglesia tiene 2 núcleos y el disco es uno solo.
  for (const ruta of rutas) {
    const nombre = nombreArchivo(ruta);
    if (!FORMATOS.includes(extension(ruta))) {
      resultado.errores.push(`${nombre}: no es una canción. Usa un MP3, WAV, FLAC o M4A.`);
      continue;
    }

    const id = await crearCancion(sinExtension(ruta), coleccionId);
    try {
      const copia = await copiarCancion(id, ruta);
      await guardarArchivo(id, copia.archivo, copia.duracionMs);
      resultado.agregadas.push(id);
    } catch (e) {
      await borrarCancion(id);
      await borrarCarpetaCancion(id).catch(() => {});
      resultado.errores.push(`${nombre}: ${String(e)}`);
    }
  }

  return resultado;
}
