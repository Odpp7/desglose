# Prototipo: motor de audio (Tauri + Rust)

Fase 0, paso 1. App Tauri mínima sin diseño: botones y sliders.

Objetivo: 8 pistas sonando juntas 5 minutos sin desfase, leídas desde el disco por bloques (no cargadas completas en RAM), con mute/solo/volumen, click generado, cambio de tempo y exportación a WAV de 24 bits idéntica a lo que se escucha.

Meta: menos de 400 MB de RAM, probado en una PC con Windows 10 y 4 GB.

Librerías: `cpal`, `symphonia`, `rubato`, `rtrb`, `signalsmith-stretch`, `hound`.

Sub-pasos en `docs/fase-0.md`.

## Cómo probar

Generar las pistas de prueba (una sola vez, necesita FFmpeg):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generar-pistas.ps1
```

Abrir la app y pegar la ruta de una pista de `samples/sinteticas/`:

```powershell
npm install
npm run tauri dev
```

Pruebas del motor, desde `src-tauri/`:

```powershell
cargo test
cargo test -- --ignored reproduce_sin_cortes
```

La segunda suena por la tarjeta de sonido real.
