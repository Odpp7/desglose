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
    vec![Migration {
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
    }]
}
