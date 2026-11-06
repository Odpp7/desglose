# Fase 0 — Pruebas antes de construir

Objetivo: comprobar que lo difícil funciona **antes** de hacer la app completa. Si algo falla aquí, se cambia el enfoque sin haber perdido semanas.

Recordatorio: la app final la instalan unas 10 personas como un programa normal, y el peor caso es una **PC modesta (Windows 10, 4 GB de RAM, sin GPU)**. Todo se mide pensando en esa PC. No hay acceso a ella hasta que la app esté lista, así que durante la Fase 0 se simula.

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
- [x] **1b.** En Rust: reproducir **una** pista FLAC/WAV leyéndola desde el disco por bloques (`symphonia` + `cpal`). Botones play y pausa.
- [x] **1c.** Reproducir **8 pistas** juntas con un solo reloj. Mute, solo y volumen por pista.
- [x] **1c+.** Primera medición con recursos limitados: la app solo con 2 núcleos de la CPU (`start /affinity 3`), 8 pistas durante 5 minutos, midiendo RAM, CPU y cortes. Resultado (2026-11-05, versión optimizada, 2 hilos de un mismo núcleo, sin interfaz final): con ruido de 24 bits, el peor caso, 0 cortes, 205 MB de RAM privada sin crecer y 3% de un hilo en promedio (5,5% máximo). Con clicks: 0 cortes, 203 MB y 3,3%.
- [x] **1d.** Enviar la posición a la interfaz por eventos y mostrar el tiempo; buscar a un punto.
- [x] **1e.** Generar un click desde BPM y compás (acento en el 1).
- [x] **1f.** Exportar la mezcla a WAV 24 bits sin pasar por la tarjeta de sonido (`hound`).
- [x] **1g.** Cambio de velocidad sin cambiar el tono, y cambio de tono en semitonos (`signalsmith-stretch`). Medido (2026-11-05, versión optimizada, 2 hilos, 8 pistas de ruido al 75% y +2 semitonos): 0 cortes, 215 MB, motor en 5,4% de un hilo; la ventana gasta más, hasta 32%. Calidad aprobada a oído con una canción real, sobre la mezcla completa; falta oírlo con pistas separadas por la IA.
- [ ] **1h (se hace al terminar la app real).** Generar el instalador NSIS e instalarlo en una máquina virtual limpia con Windows 10 y 4 GB de RAM (Hyper-V o VirtualBox, gratis), sin nada más instalado.
- [ ] **1i (se hace al terminar la app real).** Actualización automática: instalar una versión 0.1 en la máquina virtual, publicar una 0.2 y comprobar que se actualiza sola, sin pedirle nada al usuario.

**Medir:** 5 minutos con 8 pistas sin desfase ni cortes; RAM de la app menor a 400 MB; uso de CPU razonable; WAV exportado idéntico a lo que se escucha.

**Pasa si:** todo lo anterior se cumple con 2 núcleos. La instalación en una máquina virtual se comprueba al terminar la app real. La simulación no reemplaza a la PC real: el procesador de desarrollo es más rápido y el audio dentro de una máquina virtual no sirve para medir cortes. La prueba definitiva es la primera instalación real.

Para probar sin la IA y sin canciones, se generan 8 pistas sintéticas con FFmpeg: clicks idénticos en todas, que además sirven para medir el desfase. Después sirven las pistas de la secuencia de referencia del encargado o cualquier multitrack gratuito.

## Paso 2 — Exportar a REAPER (`prototypes/rpp-export`)

- [ ] Función en Rust (o TypeScript para prototipar) que reciba la lista de WAV + mapa de tempo + secciones y escriba un `.RPP` (texto plano).
- [ ] Abrirlo en REAPER: pistas en orden, tempo correcto, secciones como regiones con su nombre.
- [ ] Comparar con la secuencia de referencia del encargado y ajustar nombres y orden.

**Pasa si:** el encargado abre el `.RPP` y dice "esto es como lo que uso".

## Paso 3 — Pipeline de IA (`prototypes/ai-pipeline` → luego `backend/`)

Python 3.11 con **uv**. Cada etapa es un archivo independiente que se prueba solo. Las pruebas y comparaciones de modelos corren en local, con la RTX 3050 de la PC de desarrollo, para no gastar crédito. Modal solo se usa al final, con una o dos canciones, para medir el costo real: sin tarjeta hay 1 USD al mes.

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

- [ ] el motor de audio no se desfasa y respeta la RAM en la simulación de la PC modesta,
- [ ] la IA da resultados útiles con sus canciones,
- [ ] el `.RPP` abre bien en REAPER,
- [ ] hay una forma de procesar las canciones que cabe en el costo cero (ver el tema abierto de Modal en `docs/decisiones.md`).
