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
  /** nueva → separando → lista. Si falla: error (y se puede reintentar). */
  estado: EstadoCancion;
  coleccion_id: number | null;
  creada_en: string;
  /** Por qué falló la última vez que se creó la secuencia. */
  error: string | null;
  /** Tono original que escribe el encargado: "D", "Em", "F#"... */
  tono: string | null;
  /** El click, que define el encargado. Sin BPM (null) todavía no hay click. */
  bpm: number | null;
  /** Tiempos por compás: 4 (4/4), 3 (3/4), 6 (6/8), 12 (12/8). */
  compas: number;
  /** Segundo donde cae el primer tiempo (el 1). */
  inicio_click: number;
  /** Compases de entrada antes del primer tiempo. */
  conteo: number;
  click_volumen: number;
  click_activo: number;
};

export type EstadoCancion = "nueva" | "separando" | "lista" | "error";

export type Pista = {
  id: number;
  cancion_id: number;
  /** "voz-lider", "coros", "bateria"... Las propias: "propia-1731000". */
  instrumento: string;
  /** Dentro de la carpeta de la canción: "pistas/voz-lider.flac", "propias/1731000.wav". */
  archivo: string;
  /** SQLite no tiene booleanos: 0 o 1. */
  vacia: number;
  orden: number;
  /** La mezcla: 1 = volumen normal (0 dB). */
  volumen: number;
  mute: number;
  solo: number;
  /** Va en el paquete para REAPER (paso 8). */
  en_export: number;
  /** La agregó el encargado (no salió de MVSep). */
  propia: number;
  /** Nombre de una pista propia (el del archivo, o el que le ponga el encargado). */
  nombre: string | null;
  /** Milisegundos que está corrida la pista (solo las propias). */
  desfase_ms: number;
};

/** Lo que se puede cambiar de una pista desde el editor. */
export type CambioPista = Partial<
  Pick<Pista, "volumen" | "mute" | "solo" | "en_export" | "desfase_ms" | "nombre">
>;

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

/** Solo borra las filas. La carpeta con el audio se borra con `borrarCarpetaCancion`. */
export async function borrarCancion(id: number) {
  const db = await base();
  await db.execute("DELETE FROM pistas WHERE cancion_id = $1", [id]);
  await db.execute("DELETE FROM canciones WHERE id = $1", [id]);
}

export async function cambiarTono(id: number, tono: string | null) {
  const db = await base();
  await db.execute("UPDATE canciones SET tono = $1 WHERE id = $2", [tono, id]);
}

/** Guarda el click de la canción (BPM, compás, primer tiempo, conteo, volumen, encendido). */
export async function guardarClick(
  id: number,
  c: Pick<Cancion, "bpm" | "compas" | "inicio_click" | "conteo" | "click_volumen" | "click_activo">,
) {
  const db = await base();
  await db.execute(
    "UPDATE canciones SET bpm = $1, compas = $2, inicio_click = $3, conteo = $4, click_volumen = $5, click_activo = $6 WHERE id = $7",
    [c.bpm, c.compas, c.inicio_click, c.conteo, c.click_volumen, c.click_activo, id],
  );
}

export async function cambiarEstado(id: number, estado: EstadoCancion, error: string | null = null) {
  const db = await base();
  await db.execute("UPDATE canciones SET estado = $1, error = $2 WHERE id = $3", [estado, error, id]);
}

// ---------- Pistas ----------

export async function listarPistas(cancionId: number) {
  const db = await base();
  return db.select<Pista[]>("SELECT * FROM pistas WHERE cancion_id = $1 ORDER BY orden", [cancionId]);
}

/**
 * Pone al día las pistas SEPARADAS de la canción con las que dejó MVSep, en ese
 * orden. Conserva la mezcla de las que ya existían (mismo instrumento), quita las
 * que ya no están (por ejemplo "voz" al dividirla en líder y coros) y deja las
 * pistas propias al final, sin tocarlas.
 */
export async function guardarPistas(
  cancionId: number,
  separadas: { instrumento: string; archivo: string; vacia: boolean }[],
) {
  const db = await base();
  const antes = await listarPistas(cancionId);
  const nuevas = new Set(separadas.map((p) => p.instrumento));

  for (const p of antes) {
    if (!p.propia && !nuevas.has(p.instrumento)) {
      await db.execute("DELETE FROM pistas WHERE id = $1", [p.id]);
    }
  }
  for (const [orden, p] of separadas.entries()) {
    const existente = antes.find((a) => !a.propia && a.instrumento === p.instrumento);
    if (existente) {
      await db.execute("UPDATE pistas SET archivo = $1, vacia = $2, orden = $3 WHERE id = $4", [
        p.archivo,
        p.vacia ? 1 : 0,
        orden,
        existente.id,
      ]);
    } else {
      await db.execute(
        "INSERT INTO pistas (cancion_id, instrumento, archivo, vacia, orden) VALUES ($1, $2, $3, $4, $5)",
        [cancionId, p.instrumento, p.archivo, p.vacia ? 1 : 0, orden],
      );
    }
  }
  // Las propias, después de las separadas y en el mismo orden en que estaban.
  const propias = antes.filter((p) => p.propia);
  for (const [i, p] of propias.entries()) {
    await db.execute("UPDATE pistas SET orden = $1 WHERE id = $2", [separadas.length + i, p.id]);
  }
}

/** Columnas que se pueden cambiar desde el editor (lista fija, no viene del usuario). */
const COLUMNAS: (keyof CambioPista)[] = ["volumen", "mute", "solo", "en_export", "desfase_ms", "nombre"];

/** Guarda un cambio de mezcla, de "va a REAPER", de desfase o de nombre. */
export async function actualizarPista(id: number, cambio: CambioPista) {
  const campos = COLUMNAS.filter((c) => cambio[c] !== undefined);
  if (campos.length === 0) return;
  const db = await base();
  const asignaciones = campos.map((campo, i) => campo + " = $" + (i + 1)).join(", ");
  const valores: unknown[] = campos.map((campo) => cambio[campo]);
  await db.execute("UPDATE pistas SET " + asignaciones + " WHERE id = $" + (campos.length + 1), [
    ...valores,
    id,
  ]);
}

/** Agrega una pista propia (ya copiada a `propias/`) al final de la canción. */
export async function agregarPistaPropia(cancionId: number, archivo: string, nombre: string) {
  const db = await base();
  const [{ siguiente }] = await db.select<{ siguiente: number }[]>(
    "SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM pistas WHERE cancion_id = $1",
    [cancionId],
  );
  await db.execute(
    "INSERT INTO pistas (cancion_id, instrumento, archivo, orden, propia, nombre) VALUES ($1, $2, $3, $4, 1, $5)",
    [cancionId, "propia-" + Date.now(), archivo, siguiente, nombre],
  );
}

export async function borrarPista(id: number) {
  const db = await base();
  await db.execute("DELETE FROM pistas WHERE id = $1", [id]);
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
