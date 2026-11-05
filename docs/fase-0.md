# Fase 0 — Pruebas antes de construir

Objetivo: comprobar que lo difícil funciona **antes** de hacer la app completa. Si algo falla aquí, se cambia el enfoque sin haber perdido semanas.

Recordatorio: la app final se instala en una **PC modesta (Windows 10, 4 GB de RAM, sin GPU)**. Todo se mide pensando en esa PC.

Cada paso es independiente y vive en `prototypes/`. Se hacen en este orden, **uno a la vez**.

## Paso 0 — Preparar canciones de prueba

- [ ] Elegir 3 a 5 canciones del repertorio:
  - una grabación de estudio,
  - una en vivo,
  - una con guitarra eléctrica protagonista (por ejemplo la de Morat),
  - una en 6/8 o 3/4 si tocan alguna.
- [ ] Guardarlas en `samples/cancion1/original.mp3`, `samples/cancion2/...`
- [ ] Pedirle al encargado **una secuencia de las que descarga hoy** y guardarla en `samples/referencia/`. Sirve para copiar su formato (nombres de pistas, orden, regiones) y trae pistas separadas para el paso 1.

> `samples/` no se sube a git (derechos de autor).

## Paso 1 — Motor de audio en Rust (`prototypes/audio-engine`)

Lo de más riesgo. App Tauri mínima: una ventana con botones y sliders, sin diseño.

Se hace en sub-pasos, probando cada uno antes del siguiente:

- [x] **1a.** Crear el proyecto con `npm create tauri-app@latest` (React + TypeScript). Que abra la ventana.
- [ ] **1b.** En Rust: reproducir **una** pista FLAC/WAV leyéndola desde el disco por bloques (`symphonia` + `cpal`). Botones play y pausa.
- [ ] **1c.** Reproducir **8 pistas** juntas con un solo reloj. Mute, solo y volumen por pista.
- [ ] **1d.** Enviar la posición a la interfaz por eventos y mostrar el tiempo; buscar a un punto.
- [ ] **1e.** Generar un click desde BPM y compás (acento en el 1).
- [ ] **1f.** Exportar la mezcla a WAV 24 bits sin pasar por la tarjeta de sonido (`hound`).
- [ ] **1g.** Cambio de velocidad sin cambiar el tono (`signalsmith-stretch`).
- [ ] **1h.** Generar el instalador NSIS e instalarlo en otra PC (ideal: Windows 10 con 4 GB).

**Medir:** 5 minutos con 8 pistas sin desfase ni cortes; RAM de la app menor a 400 MB; uso de CPU razonable; WAV exportado idéntico a lo que se escucha.

**Pasa si:** todo lo anterior se cumple también en la PC modesta.

Para probar sin la IA, sirven las pistas de la secuencia de referencia del encargado o cualquier multitrack gratuito.

## Paso 2 — Exportar a REAPER (`prototypes/rpp-export`)

- [ ] Función en Rust (o TypeScript para prototipar) que reciba la lista de WAV + mapa de tempo + secciones y escriba un `.RPP` (texto plano).
- [ ] Abrirlo en REAPER: pistas en orden, tempo correcto, secciones como regiones con su nombre.
- [ ] Comparar con la secuencia de referencia del encargado y ajustar nombres y orden.

**Pasa si:** el encargado abre el `.RPP` y dice "esto es como lo que uso".

## Paso 3 — Pipeline de IA (`prototypes/ai-pipeline` → luego `backend/`)

Python 3.11 con **uv**. Cada etapa es un archivo independiente que se prueba solo. Primero cada etapa en local con una canción corta; luego todo en Modal con GPU.

- [ ] **3a.** Proyecto con `uv init`, FFmpeg para normalizar el audio.
- [ ] **3b.** Separación con `audio-separator`: BS-RoFormer-SW vs Demucs `htdemucs_6s` → escuchar guitarra y piano.
- [ ] **3c.** Tiempos y compases: Beat This!
- [ ] **3d.** Secciones: SongFormer vs All-In-One → comparar con lo que ustedes dirían a oído.
- [ ] **3e.** Acordes: BTC → comparar con lo que tocan.
- [ ] **3f.** Letra: faster-whisper sobre la pista de voz.
- [ ] **3g.** Formas de onda (picos por pista) y `analysis.json` con el formato de `docs/especificacion.md` (sección 8).
- [ ] **3h.** Llevarlo a Modal: FastAPI + SSE para el avance + volumen temporal.
- [ ] **Medir:** minutos de GPU y crédito de Modal por canción.

**Pasa si:** con las canciones de prueba, las pistas sirven para estudiar, los acordes y las secciones aciertan lo suficiente como para corregirlos en pocos minutos, y el costo cabe en los créditos gratis.

## Paso 4 — Voz guía (`prototypes/voice-piper`)

- [ ] Descargar Piper para Windows y una voz en español.
- [ ] Generar el vocabulario completo (ver `docs/voces-guia.md`) como WAV cortos.
- [ ] Mezclarlos sobre un click a 70, 120 y 160 BPM y escuchar si se entienden y caben en un tiempo.

**Pasa si:** la guía se entiende en audífonos y cabe en el tiempo.

## Puerta 1

Se pasa a la Fase 1 (la app completa) cuando:

- [ ] el motor de audio no se desfasa y respeta la RAM en la PC modesta,
- [ ] el instalador funciona en otra PC sin instalar nada más,
- [ ] la IA da resultados útiles con sus canciones,
- [ ] el `.RPP` abre bien en REAPER,
- [ ] el costo por canción cabe en los créditos gratis de Modal.
