# Fase 1 — La app real

Este documento es el punto de partida de la app real. Reúne lo decidido y lo aprendido en la Fase 0, para empezar en una sesión nueva sin repetir nada. Si algo choca con `docs/especificacion.md`, manda este documento y `docs/decisiones.md`.

## Dónde quedamos (7 de noviembre)

**Pasos 1 a 6 terminados ✅** y **7a (voz guía automática)** en la rama `fase-1` (todavía no unida a `main`). **Sigue el 7b: voz propia (grabar o cargar frases).** Ver la tabla "Los 10 pasos" más abajo.

Qué hay hoy en la app (detalle de carpetas en `app/README.md`):

- **Una sola pantalla**, como la captura de referencia de Oscar (estilo StemDeck): biblioteca siempre a la izquierda (carpetas y canciones), la canción abierta a la derecha. Ver la memoria/decisión del diseño antes de tocar la interfaz.
- **Biblioteca:** agregar arrastrando o con botón, carpetas, buscar, renombrar, mover, borrar. SQLite con 3 migraciones (`src-tauri/src/db.rs`; para cambiar tablas se agrega una migración nueva, nunca se edita una vieja).
- **Separar con MVSep por partes:** "Crear secuencia" hace 1 trabajo (voz, batería, bajo, piano, guitarra, otros); voz líder y coros, guitarras y synth son botones aparte. Muestra la fila, retoma el trabajo si se cierra la app, adopta un trabajo huérfano, se puede cancelar, y si se pierde el aviso de fin se recupera desde `pistas/lista.json`.
- **Editor:** ondas (calculadas una vez en Rust, archivos `.ondas`), pistas que llenan el alto, mezclador con dB, M, S y R (va a REAPER), todo guardado en SQLite. Pistas propias con desfase (arrastrar o ‹ ›) y ✕. Tonalidad (nombre) en la fila de datos; velocidad y tono al escuchar en el transporte. Exportar está en el transporte, apagado hasta su paso.
- **Click:** "BPM" en la fila de datos abre su panel: BPM con − y +, "Tocar el tempo" (clic o tecla T), compás (2/4, 3/4, 4/4, 6/8, 12/8), conteo de entrada (0 a 2 compases) y primer tiempo (‹ ›, "Aquí"). En la línea de tiempo: rejilla de compases y tiempos, números de compás en la regla y el marcador "1" que se arrastra. En el transporte: encendido y volumen. Se guarda en SQLite (migración 4). Un solo tempo por canción; cambios de tempo y subdivisión quedan para después. Si el conteo no cabe antes del primer tiempo, suena lo que alcance (agregar silencio al inicio se decide en el paso 8).
- **Secciones (6a):** franja bajo la regla. Sin secciones: "Marcar a mano" o "Proponer con IA" (6b). Tecla S o "Cortar": corta donde está la canción, pegado al compás si hay click. Clic en una sección: escuchar, nombre (Intro, Verso, Pre-coro, Coro, Post-coro, Puente, Instrumental, Solo, Break, Final), unir, borrar. Bordes arrastrables (Alt: sin pegarse). Ctrl+Z / Ctrl+Y. Cubren toda la canción, una tras otra; se numeran solas (Verso 1, Verso 2; si hay una sola, sin número). SQLite: migración 5, tabla `secciones` con `origen` ia/manual.
- **Secciones con IA (6b):** `backend/secciones.py` tiene dos direcciones web en Modal: `iniciar` (recibe la canción, lanza SongFormer y responde al momento con el número del trabajo) y `estado` (en fila, preparando, analizando, listo). SongFormer en CPU: unos 3 minutos y 2 centavos. Rust guarda el número en `secciones-ia.txt` en la carpeta de la canción y pregunta cada 3 s; la interfaz muestra una barra con la etapa y el tiempo. Si se cierra la app, al abrir la canción retoma el mismo trabajo. Solo responde con la clave (secreto `desglose-clave` en Modal; en la app, "Clave de Modal" en Ajustes). Se creó con `backend/scripts/crear-clave.ps1`. Rust sube la canción y pregunta el avance (`src-tauri/src/secciones.rs`); la interfaz traduce, junta las seguidas del mismo tipo (la IA parte un coro en pedazos), pega al compás y guarda solo si la canción sigue sin secciones. Si falla, muestra el motivo y "Marcar a mano" sigue ahí. El trabajo sigue aunque se cambie de canción.
- **Voz guía (7a):** las 34 frases de `es_MX-claude-high` están en `src-tauri/recursos/voz/` (con excepción en `.gitignore`) y van en el instalador. Rust las carga una vez (`audio/guia.rs`) y las hace sonar como el click: siguen la velocidad pero no se estiran ni cambian de tono. Dónde va cada frase lo calcula `src/lib/guia.ts` (1 compás antes, o 2 si el compás dura menos de 1,6 s; la primera en el compás de conteo; nombre largo recorta el conteo; 6/8 cuenta en 2; sin frase "Coro 4" dice "Coro"; Break y Sección solo cuentan). Franja "VOZ GUÍA": clic para cambiar frase, anticipación o quitar el aviso; arrastrar cambia los compases; "+ Aviso (G)" agrega frases libres. Bloque "Guía" en el transporte. SQLite: migración 6.
- **Pruebas:** 32 de Rust (`cargo test --release` desde `app/src-tauri`, unos 4 minutos). La que suena por la tarjeta real se corre aparte.

Lo que se aprendió trabajando en la Fase 1 (para no repetir errores):

- **`reqwest::blocking` no va directo en una orden `async` de Tauri:** se cae por dentro ("Cannot drop a runtime in a context where blocking is not allowed") y la interfaz espera para siempre sin aviso. Usar `#[tauri::command] async fn` + `tauri::async_runtime::spawn_blocking`, o `thread::spawn` como en `crear_secuencia`. Así se perdió la primera prueba de "Proponer con IA" (10 minutos esperando una petición que nunca salió). Ver los errores en la consola de `npm run tauri dev`.
- **Modal puede interrumpir una máquina a mitad ("preemption")** y reintenta solo con el mismo trabajo: puede tardar un poco más.

- **La fila de MVSep manda.** En el plan gratis cada trabajo hace la fila completa y hay uno a la vez por cuenta. El 7 de noviembre había ~400 en fila y un trabajo tardó 80 minutos. Por eso todo es por partes y opcional. `app/scripts/medir-fila-mvsep.ps1` anota la fila cada 30 minutos en `samples/fila-mvsep.csv`; quedaron pocas horas medidas (se cortó), falta medir uno o dos días para recomendar horarios.
- **Recarga en caliente de Vite:** al borrar o mover archivos de la interfaz, la ventana de Tauri puede quedar en blanco. No es un error del código: cerrar y volver a abrir `npm run tauri dev`.
- **Revisar el diseño sin pedirle capturas a Oscar:** con PowerShell y `PrintWindow` (user32) se captura solo la ventana de Desglose a un PNG y se mira. Si mide 160×28, está minimizada.
- **Nunca abrir la app desde la terminal de Claude** (ni `npm run tauri dev`): leería y escribiría la base en la copia aparte de Claude. Para abrirla, que lo haga Oscar o usar su terminal (`run_in_terminal`).
- **La base, solo desde copias, y nunca escribir en `%APPDATA%\com.desglose.app` desde la terminal de Claude.** Esa terminal ve esa carpeta a través de una copia propia: lo que escribe ahí (también lo que escribe SQLite al cerrar una conexión) queda solo en su copia y la PC real no lo ve. El 9 de noviembre, leer la base con Python pasó el `-wal` real (con todo lo hecho desde el 7) a esa copia; la app quedó con el archivo principal del 7 de noviembre (tono E, una pista ya borrada, sin BPM) y luego "database disk image is malformed". Se recuperó desde la copia de Claude con un script corrido en la terminal de Oscar. Regla: para revisar, copiar `desglose.db`, `-wal` y `-shm` a la carpeta de trabajo y abrir la copia con `immutable=1`; para ver la carpeta real, usar la terminal de Oscar (`run_in_terminal`).
- **Scripts largos en la terminal:** un `python - <<EOF` con mucho texto a veces falla o lo bloquea el chequeo de seguridad. Mejor escribir el script en un archivo y correrlo.
- **La clave de MVSep** ya se pega en Ajustes (`%APPDATA%\com.desglose.app\clave-mvsep.txt`). La copia vieja (`.env` del prototipo) ya se borró.

## Antes de empezar

Lee `CLAUDE.md`, este documento y `docs/decisiones.md`. Se trabaja en la rama `fase-1` (creada desde `main`).

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
| 4. Editor ✅ | **4a:** una sola pantalla al estilo de la captura de referencia: biblioteca siempre a la izquierda, botones Separar arriba, pistas con ondas que llenan el alto, mezclador con dB, transporte por bloques, cancelar separaciones. **4b:** mezcla guardada en SQLite, "va a REAPER" (R) por pista, "Añadir pista" (un archivo propio que se alinea arrastrándolo o con ‹ ›, y se quita con ✕) y "Tonalidad", que escribe el encargado. Se adelantaron del paso 9 la velocidad y el cambio de tono al escuchar |
| 5. Click ✅ | BPM, compás, inicio y conteo de entrada. Botón "tocar el tempo" y primer tiempo arrastrable sobre la onda |
| 6. Secciones ✅ | Dos caminos: la IA propone o el encargado las marca a mano (sin internet); mover, renombrar, dividir, unir y borrar, con deshacer |
| 7. Voz guía (7a ✅) | Se coloca sola según las secciones. Cada aviso se mueve, cambia, borra o añade. Voz propia: grabar con micrófono o cargar archivos |
| 8. Exportar | WAV por pista, CLICK, GUIA y `.RPP` con regiones. Puede salir con otra velocidad y otro tono |
| 9. Estudio | Bucle. (Velocidad, de 50% a 150%, y tono, ±6 semitonos, ya funcionan desde el paso 4b) |
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
| ~~`prototypes/ai-pipeline/mvsep.py`~~ | Cadena de MVSep | Ya en Rust (paso 3) |
| ~~`prototypes/ai-pipeline/secciones.py`~~ | SongFormer en Modal | Ya en `backend/secciones.py` (paso 6) |
| ~~`prototypes/ai-pipeline/separar.py`~~ | Respaldo con BS-RoFormer-SW | No se conectó: queda en el historial de git |
| `prototypes/voice-piper/generar.py` | Colocación de la voz y conteo | Lógica para `guide.rs` |
| `prototypes/voice-piper/out/es_MX-claude-high/` | Las 34 frases | Recursos de la app |

Las frases son `.wav`, que `.gitignore` ignora, y están en `out/`, que también se ignora. **Al moverlas a la app hay que agregar una excepción en `.gitignore`**, o no llegarán a git.

Las pruebas que no sirvieron y `mvsep.py` (ya en Rust) se borraron el 8 de noviembre; quedan en el historial de git: `probar_mega.py`, `paneo.py`, `ritmo.py` y `scripts/combinar.ps1`. También se borró `docs/fase-0.md`.

## Limpieza

`prototypes/` son pruebas, no la app. A medida que se avanza, **cada prototipo se borra cuando su código ya está en la app y probado**, en el mismo commit del paso. Todo queda en el historial de git.

| Prototipo | Se borra al terminar |
| --- | --- |
| ~~`prototypes/audio-engine/`~~ | Paso 1 ✅ |
| ~~`prototypes/ai-pipeline/`~~ | Paso 6 ✅ |
| `prototypes/voice-piper/` | Paso 7 |
| `prototypes/rpp-export/` | Paso 8 |

Cuidado antes de borrar: hay cosas que **no están en git** y se perderían para siempre:

- Las 34 frases de `prototypes/voice-piper/out/` (los `.wav` se ignoran). Moverlas a la app primero.
- ~~La clave de MVSep en `prototypes/ai-pipeline/.env`~~: borrada; la app la guarda en Ajustes.

También se borra lo que deje de usarse dentro de la app y los documentos que queden viejos (como `docs/fase-0.md`, borrado en el paso 5). `samples/` se queda: son las canciones de prueba y no se suben a git.

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

- La clave de MVSep está solo en Ajustes de la app. Se vio en una captura el 7 de noviembre: Oscar debe cambiarla. Nunca escribirla en código ni en documentos.
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
