# Prototipo: pipeline de IA

Fase 0, paso 3. Python 3.11 con uv. Primero cada etapa en local con una canción corta; luego en Modal con GPU T4.

Probar con las canciones de `samples/`:

- Separación: `audio-separator` con BS-RoFormer-SW vs Demucs `htdemucs_6s`
- Tiempos y compases: Beat This! (descartado: el click lo define el encargado)
- Secciones: SongFormer vs All-In-One
- Acordes: BTC
- Letra: faster-whisper

Salida: `analysis.json` con el formato de `docs/especificacion.md` (sección 8). Medir minutos de GPU y crédito por canción.

Lo que funcione pasa a `backend/` con la estructura de la especificación (sección 7).
