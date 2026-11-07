# App de escritorio (Tauri 2 + React + TypeScript)

La app real de Desglose. Plan y estado en `docs/fase-1.md`.

## Partes

- `src/`: interfaz en React. Solo dibuja y manda órdenes.
  - `app/`: rutas y el marco: barra fina, biblioteca a la izquierda, canción a la derecha.
  - `features/library/`: la biblioteca (carpetas, canciones, agregar y arrastrar).
  - `features/song/`: la canción abierta (botones Separar, datos, crear secuencia).
  - `features/editor/`: pistas, ondas, mezclador y transporte.
  - `features/settings/`: Ajustes (la clave de MVSep).
  - `components/`: piezas comunes (íconos, menú, confirmar, campo de texto, estado).
  - `lib/engine.ts`: las órdenes al motor de audio (cargar canción, ondas, play...).
  - `lib/db.ts`: las consultas a SQLite.
  - `lib/secuencia.ts`: separar con MVSep, su avance y cancelar.
  - `lib/sesion.ts`, `lib/cambios.ts`: última canción, mezcla y aviso de cambios.
- `src-tauri/`: el motor en Rust.
  - `src/audio/`: reloj, lectura de pistas desde el disco, click, velocidad y tono, exportación.
  - `src/commands.rs`: las órdenes del motor que llama la interfaz.
  - `src/db.rs`: las tablas de SQLite.
  - `src/biblioteca.rs`: copiar una canción a su carpeta, medir su duración y borrarla.
  - `src/mvsep.rs`, `src/secuencia.rs`: separar con MVSep por partes, retomar y cancelar.
  - `src/audio/nivel.rs`, `src/audio/ondas.rs`: pistas vacías y formas de onda.
  - `src/ajustes.rs`: la clave de MVSep.

## Dónde guarda las cosas

- Base de datos: `%APPDATA%\com.desglose.app\desglose.db`
- Audio de cada canción: `%LOCALAPPDATA%\com.desglose.app\canciones\<id>\`
- `scripts/generar-pistas.ps1`: crea las pistas de prueba en `samples/` (necesita FFmpeg).

## Cómo probar

```powershell
cd app
npm install
npm run tauri dev
```

En el Editor, pega la ruta de una carpeta con pistas FLAC (por ejemplo `samples\cancion2\mvsep\final`) y pulsa Cargar.

Pruebas de Rust, desde `app/src-tauri/`. Antes, una vez, crear las muestras: `scripts/generar-pistas.ps1` y un M4A desde el MP3 de prueba (`ffmpeg -i samples/cancion1/original.mp3 -c:a aac samples/cancion1/original.m4a`).

```powershell
cargo test
cargo test -- --ignored reproduce_sin_cortes
```

La segunda suena por la tarjeta de sonido real.
