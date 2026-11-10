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
        Migration {
            version: 4,
            description: "click de cada canción",
            sql: "
                -- Lo define el encargado. Sin BPM (NULL) la canción todavía no tiene click.
                ALTER TABLE canciones ADD COLUMN bpm           REAL;
                -- Tiempos por compás: 4 (4/4), 3 (3/4), 6 (6/8), 12 (12/8).
                ALTER TABLE canciones ADD COLUMN compas        INTEGER NOT NULL DEFAULT 4;
                -- Segundo de la canción donde cae el primer tiempo (el 1).
                ALTER TABLE canciones ADD COLUMN inicio_click  REAL    NOT NULL DEFAULT 0;
                -- Compases de entrada que suenan antes del primer tiempo.
                ALTER TABLE canciones ADD COLUMN conteo        INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE canciones ADD COLUMN click_volumen REAL    NOT NULL DEFAULT 0.8;
                ALTER TABLE canciones ADD COLUMN click_activo  INTEGER NOT NULL DEFAULT 1;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "secciones de cada canción",
            sql: "
                -- Las secciones van una tras otra y cubren toda la canción (como las
                -- regiones de REAPER): cada una termina donde empieza la siguiente.
                -- Solo se guarda el tipo (Verso, Coro...): el número se calcula al mostrarla.
                CREATE TABLE secciones (
                    id         INTEGER PRIMARY KEY,
                    cancion_id INTEGER NOT NULL REFERENCES canciones(id) ON DELETE CASCADE,
                    inicio     REAL    NOT NULL,
                    tipo       TEXT    NOT NULL,
                    -- 'ia' si la propuso la IA y nadie la tocó; 'manual' si la puso o
                    -- la cambió el encargado. La IA nunca pisa una 'manual'.
                    origen     TEXT    NOT NULL DEFAULT 'manual'
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "voz guía",
            sql: "
                -- El aviso de cada sección sale solo de su nombre (\"Coro 1, 2, 3, 4\").
                -- Esto guarda lo que el encargado cambió a mano:
                --   aviso: otra frase en vez del nombre (NULL = el nombre).
                --   anticipacion: compases antes (NULL = la de la canción).
                --   sin_aviso: 1 = esta sección no lleva aviso.
                ALTER TABLE secciones ADD COLUMN aviso        TEXT;
                ALTER TABLE secciones ADD COLUMN anticipacion INTEGER;
                ALTER TABLE secciones ADD COLUMN sin_aviso    INTEGER NOT NULL DEFAULT 0;

                -- Avisos libres que agrega el encargado (\"Bajamos\", \"Última vez\").
                CREATE TABLE avisos (
                    id         INTEGER PRIMARY KEY,
                    cancion_id INTEGER NOT NULL REFERENCES canciones(id) ON DELETE CASCADE,
                    segundo    REAL    NOT NULL,
                    frase      TEXT    NOT NULL
                );

                -- La guía de la canción: encendida, volumen y compases de anticipación
                -- (NULL = automático: 1, o 2 si el compás dura menos de 1,6 s).
                ALTER TABLE canciones ADD COLUMN guia_activa  INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE canciones ADD COLUMN guia_volumen REAL    NOT NULL DEFAULT 0.9;
                ALTER TABLE canciones ADD COLUMN anticipacion INTEGER;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "compases antes de la música",
            sql: "ALTER TABLE canciones ADD COLUMN entrada_compases INTEGER NOT NULL DEFAULT 0 CHECK (entrada_compases BETWEEN 0 AND 4);",
            kind: MigrationKind::Up,
        },
    ]
}
