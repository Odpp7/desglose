// Consultas a la base local (SQLite).
// Las tablas se crean en Rust: `src-tauri/src/db.rs`.
// En SQLite los valores van como $1, $2... y se pasan aparte en una lista:
// así un título con comillas no rompe la consulta.

import Database from "@tauri-apps/plugin-sql";

export type Cancion = {
  id: number;
  titulo: string;
  artista: string;
  duracion_ms: number;
  archivo: string;
  estado: "nueva";
  coleccion_id: number | null;
  creada_en: string;
};

export type Coleccion = {
  id: number;
  nombre: string;
};

// La base se abre una sola vez y todos usan la misma conexión.
// La primera vez que se abre, el plugin crea las tablas.
let conexion: Promise<Database> | null = null;
function base() {
  conexion ??= Database.load("sqlite:desglose.db");
  return conexion;
}

// ---------- Canciones ----------

export async function listarCanciones() {
  const db = await base();
  return db.select<Cancion[]>("SELECT * FROM canciones ORDER BY creada_en DESC, id DESC");
}

export async function obtenerCancion(id: number) {
  const db = await base();
  const filas = await db.select<Cancion[]>("SELECT * FROM canciones WHERE id = $1", [id]);
  return filas[0] ?? null;
}

/** Crea la fila y devuelve su id. El archivo se guarda después, con `guardarArchivo`. */
export async function crearCancion(titulo: string, coleccionId: number | null) {
  const db = await base();
  const r = await db.execute("INSERT INTO canciones (titulo, coleccion_id) VALUES ($1, $2)", [
    titulo,
    coleccionId,
  ]);
  return Number(r.lastInsertId);
}

export async function guardarArchivo(id: number, archivo: string, duracionMs: number) {
  const db = await base();
  await db.execute("UPDATE canciones SET archivo = $1, duracion_ms = $2 WHERE id = $3", [
    archivo,
    duracionMs,
    id,
  ]);
}

export async function renombrarCancion(id: number, titulo: string) {
  const db = await base();
  await db.execute("UPDATE canciones SET titulo = $1 WHERE id = $2", [titulo, id]);
}

export async function moverCancion(id: number, coleccionId: number | null) {
  const db = await base();
  await db.execute("UPDATE canciones SET coleccion_id = $1 WHERE id = $2", [coleccionId, id]);
}

/** Solo borra la fila. La carpeta con el audio se borra con `borrarCarpetaCancion`. */
export async function borrarCancion(id: number) {
  const db = await base();
  await db.execute("DELETE FROM canciones WHERE id = $1", [id]);
}

// ---------- Colecciones ----------

export async function listarColecciones() {
  const db = await base();
  return db.select<Coleccion[]>("SELECT id, nombre FROM colecciones ORDER BY nombre COLLATE NOCASE");
}

export async function crearColeccion(nombre: string) {
  const db = await base();
  const r = await db.execute("INSERT INTO colecciones (nombre) VALUES ($1)", [nombre]);
  return Number(r.lastInsertId);
}

export async function renombrarColeccion(id: number, nombre: string) {
  const db = await base();
  await db.execute("UPDATE colecciones SET nombre = $1 WHERE id = $2", [nombre, id]);
}

/** Sus canciones no se borran: quedan en "Sin ordenar". */
export async function borrarColeccion(id: number) {
  const db = await base();
  // La tabla ya lo hace sola (ON DELETE SET NULL); esto lo asegura aunque
  // las llaves foráneas estuvieran apagadas.
  await db.execute("UPDATE canciones SET coleccion_id = NULL WHERE coleccion_id = $1", [id]);
  await db.execute("DELETE FROM colecciones WHERE id = $1", [id]);
}
