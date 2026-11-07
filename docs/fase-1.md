# Fase 1 — La app real

Este documento es el punto de partida de la app real. Reúne lo decidido y lo aprendido en la Fase 0, para empezar en una sesión nueva sin repetir nada. Si algo choca con `docs/especificacion.md`, manda este documento y `docs/decisiones.md`.

## Antes de empezar

Lee `CLAUDE.md`, este documento y `docs/decisiones.md`. Trabaja en una rama nueva creada desde `main` (la Fase 0 ya está unida a `main`).

Con Oscar:

- Mostrar el plan corto de cada paso y esperar su visto bueno.
- Preguntar antes de cada commit, mostrando archivos y mensaje.
- Hablar simple y decir siempre en qué parte del plan estamos.
- **Desde esta fase sí se explica el código**, la arquitectura y la estructura: Oscar quiere entenderlos. Domina React y TypeScript; Rust y Python se explican más.
- Hacer un paso a la vez, probarlo, mostrar cómo probarlo y parar.

## Qué hace la app

Secuencia para alabanza, en este orden:

1. El encargado carga una canción.
2. La app separa 10 pistas y propone las secciones.
3. El encargado define el click y corrige las secciones.
4. La voz guía se coloca sola, según las secciones.
5. Exporta un paquete para REAPER.

Fuera por ahora: **acordes, letra, notas y tablatura**. Oscar decide después si entran. Cuando el proyecto hable de "estudio", por ahora solo incluye velocidad, tono y bucle.

Los editores (click, secciones, voz guía, velocidad y tono) deben ser **fáciles para el encargado**: arrastrar sobre la línea de tiempo, botones rápidos y escuchar el resultado al momento.

## Dónde corre

**Una sola PC importa**, la de la iglesia, y no hay acceso a ella hasta que la app esté lista:

- HP Laptop 15-db0xxx, AMD A9-9425 (2 núcleos, 3,1 GHz), 8 GB de RAM, SSD con 92 GB libres, Radeon R5 integrada.
- **Lo débil es el procesador.** La interfaz debe ser liviana.
- Meta de memoria: menos de 1 GB. Instalador: menos de 30 MB.

## Arquitectura

```text
LA PC DE LA IGLESIA
┌─────────────────────────────────────────────┐
│ Interfaz (React): solo dibuja y manda       │
│ órdenes                                     │
├──────────────── invoke y eventos ───────────┤
│ Motor (Rust): audio, mezcla, exportación,   │
│ REAPER, llamadas a MVSep y Modal            │
├─────────────────────────────────────────────┤
│ Datos: SQLite y una carpeta por canción     │
└───────────────┬─────────────────┬───────────┘
                │                 │
          MVSep (gratis)     Modal (crédito)
          separa pistas      propone secciones
```

Cambios aprobados frente a `docs/especificacion.md`:

1. **Backend mínimo.** La sección 7 de la especificación ya no aplica: nada de API de 10 rutas, FastAPI ni SSE. Modal solo necesita una función que reciba audio y devuelva secciones. Lo que era `analysis.json` se reduce a eso.
2. **Las ondas se calculan en la PC**, en Rust, una sola vez por canción. Si tarda mucho en la PC modesta, se cambia.
3. **Interfaz liviana.** La posición y la línea de tiempo se dibujan en `canvas`. La posición no debe pasar por el estado de React 30 veces por segundo: fue lo que más procesador gastó en la prueba, hasta 32% de un hilo, mientras el motor usó 5,4%.

## Los 10 pasos

| Paso | Al terminar se tiene |
| --- | --- |
| 1. Base ✅ | La app en `app/`, modo oscuro, pantallas y motor integrado |
| 2. Biblioteca ✅ | Agregar, buscar y borrar canciones, con SQLite. La canción se agrega arrastrándola a la ventana o con "Elegir archivo"; el encargado nunca escribe rutas. Colecciones (carpetas) en una barra lateral, sin dibujar ondas en la lista |
| 3. Crear secuencia ✅ | Un botón separa en 6 pistas con 1 trabajo de MVSep, con avance y espera estimada. Botones opcionales aparte: voz líder y coros, guitarras, synth |
| 4. Editor (4a ✅) | **4a:** una sola pantalla al estilo de la captura de referencia: biblioteca siempre a la izquierda, botones Separar arriba, pistas con ondas que llenan el alto, mezclador con dB, transporte por bloques, cancelar separaciones. **4b:** mezcla guardada en SQLite, "va a REAPER" por pista, "Añadir pista" (un archivo propio que se arrastra para alinearlo) y "Tono original", que escribe el encargado |
| 5. Click | BPM, compás, inicio y conteo de entrada. Botón "tocar el tempo" y primer tiempo arrastrable sobre la onda |
| 6. Secciones | La IA propone; mover, renombrar, dividir, unir y borrar, con deshacer |
| 7. Voz guía | Se coloca sola según las secciones. Cada aviso se mueve, cambia, borra o añade. Voz propia: grabar con micrófono o cargar archivos |
| 8. Exportar | WAV por pista, CLICK, GUIA y `.RPP` con regiones. Puede salir con otra velocidad y otro tono |
| 9. Estudio | Velocidad (50% a 150%), tono y bucle |
| 10. Entrega | Instalador, actualización automática y prueba en la PC real |

Tras el paso 8 ya se puede usar una secuencia real en un culto.

## Decisiones ya tomadas

- **Separación:** API gratuita de MVSep, **por partes**. "Crear secuencia" hace 1 trabajo (BS Roformer SW): voz, batería, bajo, piano, guitarra y otros. Aparte, el encargado decide si separa voz líder y coros (Karaoke, 1 trabajo), guitarras (Acoustic + Lead/Rhythm, 2 trabajos) o synth (1 trabajo). Motivo: en el plan gratis cada trabajo hace la fila completa y solo hay uno a la vez; el 7 de noviembre había unos 400 en fila y un solo trabajo tardó 80 minutos. Respaldo: BS-RoFormer-SW en Modal.
- **Pistas:** base: voz, batería, bajo, piano, guitarra y otros. Al separar más, la pista dividida se reemplaza por sus partes (voz → voz líder y coros; guitarra → acústica, lead y rítmica; otros → synth y otros). Las vacías (suenan menos del 2% de los segundos, a -40 dB) se ocultan.
- **Click:** manual. El encargado define BPM, compás e inicio. La IA no lo detecta: Beat This! falló en tramos, y decidir entre 70 y 140 es musical.
- **Secciones:** SongFormer propone, el encargado corrige. Se numeran en orden: Verso 1, Verso 2. Acierta solo en parte.
- **Voz guía:** `es_MX-claude-high` de Piper. La app incluye las frases ya generadas (1,2 MB), no la voz completa (60 MB).
- **Velocidad y tono:** para estudiar y **también para exportar**. Al exportar, el click, las secciones, la voz guía y las regiones se reajustan solos; el click y la voz no cambian de tono. Rango para exportar: 80% a 120% y −4 a +4 semitonos, con aviso fuera de él. El paquete lleva el cambio en el nombre: `Hay Libertad (E, 105%)`. El tono es prioridad alta.
- **Tonalidad:** la escribe el encargado. Al transponer se ve "D → E (+2)".
- **Actualización automática:** obligatoria desde la primera versión instalada. La app busca al abrir y nunca actualiza a mitad de uso.

## Código que se reutiliza

Todo está probado. Se mueve y se adapta, no se reescribe de cero.

| Origen | Qué es | Destino |
| --- | --- | --- |
| ~~`prototypes/audio-engine/`~~ | Motor y órdenes de Tauri | Ya en `app/src-tauri/` (paso 1) |
| `prototypes/rpp-export/src/rpp.rs` | Escritor de `.RPP` | `app/src-tauri/src/export/rpp.rs` |
| `prototypes/ai-pipeline/mvsep.py` | Cadena de MVSep | Pasarla a Rust, en la app |
| `prototypes/ai-pipeline/secciones.py` | SongFormer en Modal | `backend/`, como una función web |
| `prototypes/ai-pipeline/separar.py` | Respaldo con BS-RoFormer-SW | `backend/` |
| `prototypes/voice-piper/generar.py` | Colocación de la voz y conteo | Lógica para `guide.rs` |
| `prototypes/voice-piper/out/es_MX-claude-high/` | Las 34 frases | Recursos de la app |

Las frases son `.wav`, que `.gitignore` ignora, y están en `out/`, que también se ignora. **Al moverlas a la app hay que agregar una excepción en `.gitignore`**, o no llegarán a git.

Las pruebas que no sirvieron quedan en el historial de git como referencia: `probar_mega.py`, `paneo.py`, `ritmo.py` y `scripts/combinar.ps1`.

## Limpieza

`prototypes/` son pruebas, no la app. A medida que se avanza, **cada prototipo se borra cuando su código ya está en la app y probado**, en el mismo commit del paso. Todo queda en el historial de git.

| Prototipo | Se borra al terminar |
| --- | --- |
| ~~`prototypes/audio-engine/`~~ | Paso 1 ✅ |
| `prototypes/ai-pipeline/` | Paso 6 (MVSep pasa a Rust en el 3; SongFormer y el respaldo pasan a `backend/` en el 6) |
| `prototypes/voice-piper/` | Paso 7 |
| `prototypes/rpp-export/` | Paso 8 |

Cuidado antes de borrar: hay cosas que **no están en git** y se perderían para siempre:

- Las 34 frases de `prototypes/voice-piper/out/` (los `.wav` se ignoran). Moverlas a la app primero.
- La clave de MVSep en `prototypes/ai-pipeline/.env`. Moverla a donde se decida en el paso 3.

También se borra lo que deje de usarse dentro de la app y los documentos que queden viejos (por ejemplo `docs/fase-0.md`, cuando ya no sirva de referencia). `samples/` se queda: son las canciones de prueba y no se suben a git.

## Lo aprendido

**Motor de audio**

- Versiones: `cpal` 0.18, `symphonia` 0.6, `rubato` 5, `rtrb` 0.4, `signalsmith-stretch` 0.1.3, `hound` 3.5. Sus API son recientes: revisar los ejemplos en `~/.cargo/registry/src` antes de escribir de memoria.
- `signalsmith-stretch` necesita LLVM (ya instalado) y `opt-level = 3` en el perfil de desarrollo, o no corre en vivo.
- Reloj único: en cada cuadro se saca una muestra de todas las pistas o de ninguna. Probado con cancelación: desfase cero en 5 minutos.
- Saltar reabre todas las pistas en el punto exacto: unos 68 ms.
- El click no pasa por velocidad ni tono: se genera aparte y se compensa el retraso del estirador.
- Medido con 8 pistas de ruido, al 75% y +2 semitonos, en 2 hilos: 0 cortes, 215 MB, motor en 5,4% de un hilo.
- La prueba automática que suena por la tarjeta real: `cargo test -- --ignored reproduce_sin_cortes`.

**MVSep**

- Cadena: `sep_type` 63 (BS Roformer SW) sobre la canción; 49 (Karaoke, `add_opt1=6`, `add_opt2=0`) sobre la voz; 66 (Acoustic, `add_opt2=0`) sobre la guitarra; 101 (Lead/Rhythm, `add_opt1=0`) sobre lo que no es acústica; 88 (Synth, `add_opt1=0`) sobre otros.
- Plan gratis: `output_format=2` (FLAC de 16 bits). El de 24 bits y `add_opt1=8` en Karaoke son de pago. Solo un trabajo a la vez.
- Medido: 10 pistas en 5,7 minutos, con fila corta. Otro día puede tardar más.
- Elegir los archivos por el **final** del nombre (`_vocals-back`): el inicio repite la pista de entrada, y eso causó un error.
- Las pistas salen unos 2,5 dB más bajas que la original, parejo. No se pierde sonido, salvo un residuo mínimo en `no-guitar`.
- Sus límites gratis pueden cambiar, y la canción se sube a su servicio.

**Modal**

- Sin tarjeta no hay GPU y solo se usa CPU. Hay 1 USD; a noviembre van gastados unos 0,27 USD. Falta confirmar si se renueva cada mes.
- Ya no acepta Python 3.10. SongFormer funciona con 3.11 y las versiones fijadas en `secciones.py`, incluido `torchvision==0.19.0`.
- SongFormer: unos 2 minutos y medio y unos 2 centavos por canción.

**Herramientas en esta PC**

- `uv` falla con su caché global: usar `UV_CACHE_DIR=.uv-cache` y `UV_LINK_MODE=copy`.
- `uv` no está en el PATH de la sesión: buscarlo en `%LOCALAPPDATA%\Microsoft\WinGet\Packages`.
- Con `uv run modal`, definir `PYTHONUTF8=1` y `PYTHONIOENCODING=utf-8`.
- En PowerShell, `npm run tauri build -- --no-bundle` igual crea el instalador. El de la prueba pesó 1,8 MB.

## Claves

- La clave de MVSep está en `prototypes/ai-pipeline/.env`, que no se sube a git. Oscar la cambiará después. Nunca escribirla en código ni en documentos.
- En la app, la clave de MVSep la pega el encargado en Ajustes y se guarda en `%APPDATA%\com.desglose.app\clave-mvsep.txt`. La interfaz nunca la lee: solo sabe si hay una.
- La cuenta de Modal es `odpp7`, y su configuración está en `~/.modal.toml`.

## Pendiente

- **Secuencia del encargado:** antes del paso 8, para copiar su formato. Pasa la prueba cuando él diga "esto es como lo que uso".
- **Frecuencia de exportación:** las pistas salen a 44.1 kHz y la especificación pide 48 kHz por defecto. Se decide al ver la secuencia del encargado.
- **Frases nuevas de la voz guía:** grabarlas con micrófono o bajar la voz completa.
- **Respaldo y límites:** si MVSep falla o no hay internet, el encargado ve el motivo y "Reintentar" (decidido en el paso 3). Falta decidir si se usa el respaldo en Modal.
- **Mejor horario para MVSep:** `app/scripts/medir-fila-mvsep.ps1` anota la fila cada 30 minutos en `samples/fila-mvsep.csv`. Revisar con uno o dos días de datos.
- **Preparar canciones en cola** (por ejemplo, de noche): idea para cuando el encargado tenga varias canciones.
- **Actualización automática:** el repositorio es público, y GitHub Releases sirve. Guardar bien la clave de firma.
