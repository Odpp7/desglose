# App de escritorio (Tauri 2 + React + TypeScript)

La app real de Desglose. Plan y estado en `docs/fase-1.md`.

## Partes

- `src/`: interfaz en React. Solo dibuja y manda órdenes.
  - `app/`: rutas y el marco con la barra lateral.
  - `features/`: una carpeta por pantalla (biblioteca, nueva canción, editor, ajustes).
  - `components/`: piezas comunes (íconos, encabezado).
  - `lib/engine.ts`: las órdenes al motor de audio.
- `src-tauri/`: el motor en Rust.
  - `src/audio/`: reloj, lectura de pistas desde el disco, click, velocidad y tono, exportación.
  - `src/commands.rs`: las órdenes que llama la interfaz.
- `scripts/generar-pistas.ps1`: crea las pistas de prueba en `samples/` (necesita FFmpeg).

## Cómo probar

```powershell
cd app
npm install
npm run tauri dev
```

En el Editor, pega la ruta de una carpeta con pistas FLAC (por ejemplo `samples\cancion2\mvsep\final`) y pulsa Cargar.

Pruebas del motor, desde `app/src-tauri/` (antes, una vez: `scripts/generar-pistas.ps1`):

```powershell
cargo test
cargo test -- --ignored reproduce_sin_cortes
```

La segunda suena por la tarjeta de sonido real.
