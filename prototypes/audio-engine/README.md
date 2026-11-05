# Prototipo: motor de audio (Tauri + Rust)

Fase 0, paso 1. App Tauri mínima sin diseño: botones y sliders.

Objetivo: 8 pistas sonando juntas 5 minutos sin desfase, leídas desde el disco por bloques (no cargadas completas en RAM), con mute/solo/volumen, click generado, cambio de tempo y exportación a WAV de 24 bits idéntica a lo que se escucha.

Meta: menos de 400 MB de RAM, probado en una PC con Windows 10 y 4 GB.

Librerías: `cpal`, `symphonia`, `rubato`, `signalsmith-stretch`, `hound`.

Sub-pasos en `docs/fase-0.md`.
