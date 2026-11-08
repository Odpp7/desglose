// Tablas de la base local (SQLite).
//
// Cada "migración" es un cambio a las tablas, con un número de versión.
// El plugin de SQL anota cuáles ya corrió: la primera vez que se abre la base
// crea todo, y las siguientes veces no hace nada. Para cambiar una tabla más
// adelante NO se edita esta migración: se agrega otra con el número siguiente.

use tauri_plugin_sql::{Migration, MigrationKind};

/// Nombre con el que la interfaz abre la base. El archivo queda en
/// %APPDATA%\com.desglose.app\desglose.db
pub const BASE: &str = "sqlite:desglose.db";

pub fn migraciones() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "crear la biblioteca",
            sql: "
            CREATE TABLE colecciones (
                id        INTEGER PRIMARY KEY,
                nombre    TEXT NOT NULL,
                creada_en TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE canciones (
                id           INTEGER PRIMARY KEY,
                titulo       TEXT NOT NULL,
                artista      TEXT NOT NULL DEFAULT '',
                duracion_ms  INTEGER NOT NULL DEFAULT 0,
                archivo      TEXT NOT NULL DEFAULT '',
                estado       TEXT NOT NULL DEFAULT 'nueva',
                -- Si se borra la colección, la canción queda en Sin ordenar (NULL).
                coleccion_id INTEGER REFERENCES colecciones(id) ON DELETE SET NULL,
                creada_en    TEXT NOT NULL DEFAULT (datetime('now'))
            );
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "pistas separadas",
            sql: "
                -- Las 10 pistas que devuelve Crear secuencia.
                CREATE TABLE pistas (
                    id          INTEGER PRIMARY KEY,
                    cancion_id  INTEGER NOT NULL REFERENCES canciones(id) ON DELETE CASCADE,
                    instrumento TEXT NOT NULL,
                    archivo     TEXT NOT NULL,
                    vacia       INTEGER NOT NULL DEFAULT 0,
                    orden       INTEGER NOT NULL
                );

                -- Por qué falló la última vez que se intentó crear la secuencia.
                -- canciones.estado ahora puede ser: nueva, separando, lista o error.
                ALTER TABLE canciones ADD COLUMN error TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "mezcla guardada, pistas propias y tono",
            sql: "
                -- La mezcla de cada pista ya no se pierde al cerrar la app.
                ALTER TABLE pistas ADD COLUMN volumen    REAL    NOT NULL DEFAULT 1;
                ALTER TABLE pistas ADD COLUMN mute       INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE pistas ADD COLUMN solo       INTEGER NOT NULL DEFAULT 0;
                -- Si la pista va en el paquete para REAPER (paso 8).
                ALTER TABLE pistas ADD COLUMN en_export  INTEGER NOT NULL DEFAULT 1;
                -- Pistas propias: un archivo que agregó el encargado, con su nombre
                -- y los milisegundos que está corrida para alinearla.
                ALTER TABLE pistas ADD COLUMN propia     INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE pistas ADD COLUMN nombre     TEXT;
                ALTER TABLE pistas ADD COLUMN desfase_ms INTEGER NOT NULL DEFAULT 0;

                -- El tono original, que escribe el encargado (D, Em, F#...).
                ALTER TABLE canciones ADD COLUMN tono TEXT;
            ",
            kind: MigrationKind::Up,
        },
    ]
}
