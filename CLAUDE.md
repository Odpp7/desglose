# Desglose — contexto para Claude

Lee este archivo completo antes de hacer cualquier cosa en el proyecto.

## Qué es

Una especie de **Moises para equipos de alabanza**, gratis. App de **escritorio para Windows** (Tauri) que recibe una canción (MP3/WAV/FLAC) y **crea sola la secuencia completa**:

- instrumentos separados con IA (voz líder, coros, batería, bajo, piano, guitarras acústica, lead y rítmica, synth, otros),
- acordes (cifrado americano: C, D, Em, G/B) y tonalidad,
- secciones con nombre en español (Intro, Verso 1, Pre-coro, Coro 1, Puente, Solo, Final...),
- voz guía hablando ("Coro, 2, 3, 4" un compás antes de cada sección) y click, cuyo BPM, compás e inicio define el encargado.

El usuario revisa y **edita todo**, y luego **exporta un paquete para REAPER** (un WAV por pista, `CLICK.wav`, `GUIA.wav` y un proyecto `.RPP` con las secciones como regiones). El encargado de sonido abre ese paquete en su REAPER y lo manda a la consola como siempre. La app **no** se conecta a la consola.

Aparte hay una sección de **estudio**, como en Moises: mezclador por instrumento, bucle, velocidad lenta, tono, acordes, notas y tablatura.

Referencias: **Moises** (funciones) y **StemDeck** (`github.com/stemdeckapp/stemdeck`, arquitectura Tauri + Python muy parecida a la nuestra).

Especificación completa: `docs/especificacion.md`. Decisiones: `docs/decisiones.md`.

## Dónde corre (lo más importante)

La app se instala como un programa normal en **una sola PC que importa**: una **PC modesta** (la de la iglesia), no la de desarrollo. No hay acceso a ella hasta que la app esté lista. Diseñar siempre para esa PC:

- **Windows 10 de 64 bits, 8 GB de RAM, procesador de 2 núcleos (AMD A9-9425), SSD y video integrado.** Lo más débil es el procesador: la interfaz debe ser liviana.
- Instalador `.exe` (NSIS) de menos de 30 MB. La otra PC **no instala nada más**: ni Python, ni FFmpeg, ni Node.
- Con una canción de 8 pistas abierta, la app usa **menos de 1 GB de RAM**.
- La IA corre **siempre en la nube**: separar en MVSep; el resto del análisis en Modal. Nada pesado corre en la PC.
- Solo crear una secuencia necesita internet; lo demás funciona offline.

## Reglas del proyecto

1. **Costo cero.** Proyecto personal sin financiación. Solo herramientas gratuitas/código abierto y los créditos gratis de Modal. No proponer servicios de pago.
2. **Sin usuarios ni cuentas** en esta versión. Sin Supabase ni base de datos en la nube.
3. **El audio va en Rust**, leyendo las pistas desde el disco por bloques. **No** cargar pistas completas en memoria ni usar Web Audio como motor (gasta demasiada RAM).
4. **Lo que se escucha = lo que se exporta.** El mismo motor en Rust reproduce y renderiza.
5. **Todo lo que detecta la IA es una sugerencia editable.** Nunca sobrescribir una edición manual del usuario.
6. **Contrato tipado.** Los modelos Pydantic del backend generan OpenAPI, y de ahí los tipos TypeScript de la app (`openapi-typescript`). No escribir tipos de la API a mano.
7. Interfaz en **español**. Modo oscuro.
8. Versión de prueba: abierta a cambios. Si algo de la especificación no tiene sentido al implementarlo, decirlo antes de cambiarlo.

## Cómo trabajar (reglas para Claude)

- **Un objetivo pequeño a la vez.** Hacerlo, probarlo, mostrar cómo probarlo, y parar. No avanzar al siguiente sin que Oscar confirme.
- **Nada de sobre-ingeniería.** No agregar capas, colas, abstracciones, Docker ni librerías que el paso actual no necesite. Lo más simple que funcione.
- **Antes de escribir código de un paso, mostrar un plan corto**: archivos que se van a crear y qué hace cada uno. Esperar visto bueno.
- **Antes de instalar algo nuevo** o cambiar una decisión de `docs/decisiones.md`, preguntar.
- **Respetar la estructura de carpetas** de este archivo y de la especificación. No inventar carpetas nuevas sin avisar.
- **Cada etapa del backend es un archivo independiente** en `pipeline/`, que recibe archivos y devuelve archivos. Se debe poder probar sola.
- Entregar **archivos completos**, no fragmentos sueltos.
- **Commit al terminar cada paso que funcione**, con mensaje claro en español.
- **Limpiar al avanzar.** `prototypes/` son pruebas, no la app: cada prototipo se borra cuando su código ya está en la app y probado (calendario en `docs/fase-1.md`, sección "Limpieza"). Antes de borrar, mover lo que no está en git (frases `.wav`, `.env`). Borrar también código y documentos que dejen de usarse.
- Oscar es desarrollador frontend: domina React y TypeScript. **Rust y Python, explicarlos un poco más** (qué hace cada parte, en pocas líneas).

## Stack

| Parte | Tecnología |
| --- | --- |
| App de escritorio | Tauri 2, instalador NSIS |
| Interfaz | React + TypeScript + Vite, Tailwind CSS, Radix UI, Motion, Zustand, React Router |
| Motor de audio | Rust: `cpal` (salida), `symphonia` (leer FLAC por bloques), `rubato`, `signalsmith-stretch` (tempo/tono), `hound` (WAV) |
| Datos locales | SQLite con `tauri-plugin-sql`; archivos con `tauri-plugin-fs` |
| Voz guía | Piper (TTS offline) como sidecar de Tauri |
| Backend IA | Python 3.11 con **uv**, FastAPI, Pydantic, SSE para el avance; desplegado en **Modal** (GPU T4) |
| Separación | API de MVSep (plan gratis) con una cadena de modelos; respaldo BS-RoFormer-SW en Modal |
| Modelos | Beat This!, SongFormer (respaldo All-In-One), BTC (acordes), faster-whisper, Basic Pitch |

## Estructura

```text
desglose/
  CLAUDE.md            # este archivo
  README.md
  SETUP-WINDOWS.md     # instalación de herramientas (PC de desarrollo)
  docs/                # especificación, decisiones, fase 0, voces guía
  app/                 # app Tauri + React (ver app/README.md)
  backend/             # pipeline de IA en Python (uv) desplegado en Modal
  prototypes/          # pruebas de la Fase 0; se borran al pasar a la app
    rpp-export/        # generar un .RPP y abrirlo en REAPER
    ai-pipeline/       # probar modelos con canciones reales
    voice-piper/       # paquete de voz en español
  samples/             # canciones de prueba (NO se suben a git)
```

## Fase actual: **Fase 1 — La app real**

La Fase 0 terminó. Lee `docs/fase-1.md` antes de empezar: tiene el plan, lo decidido, lo aprendido y el código que se reutiliza. Si algo choca con `docs/especificacion.md`, manda `docs/fase-1.md`.

## Comandos útiles

```powershell
# Verificar herramientas
node --version
cargo --version
uv --version
ffmpeg -version
uv run modal --version

# App
cd app
npm install
npm run tauri dev

# Pruebas del motor de audio (desde app/src-tauri)
cargo test

# Backend (cuando exista)
cd backend
uv sync
uv run pytest
uv run modal serve desglose_engine/modal_app.py
```
