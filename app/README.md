# App de escritorio (Tauri 2 + React + TypeScript)

La app real de Desglose. Plan y estado en `docs/fase-1.md`.

## Partes

- `src/`: interfaz en React. Solo dibuja y manda órdenes.
  - `app/`: rutas y el marco con la barra lateral.
  - `features/`: una carpeta por pantalla (biblioteca, canción, editor, ajustes).
  - `components/`: piezas comunes (íconos, menú, confirmar, campo de texto).
  - `lib/engine.ts`: las órdenes al motor de audio.
  - `lib/db.ts`: las consultas a SQLite.
  - `lib/archivos.ts`: copiar y borrar el audio de cada canción.
- `src-tauri/`: el motor en Rust.
  - `src/audio/`: reloj, lectura de pistas desde el disco, click, velocidad y tono, exportación.
  - `src/commands.rs`: las órdenes del motor que llama la interfaz.
  - `src/db.rs`: las tablas de SQLite.
  - `src/biblioteca.rs`: copiar una canción a su carpeta, medir su duración y borrarla.

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
