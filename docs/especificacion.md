# Desglose: especificación de la app (Windows + IA)

Oct 30, 2026 · @Oscar

## 1. Visión, objetivo y alcance

Desglose es una app de Windows que recibe una canción y **crea sola la secuencia completa**: instrumentos separados, tempo, click, secciones con nombre y voz guía hablando. El equipo la revisa, la edita y la exporta para REAPER, como si fuera una secuencia descargada de internet.

**Objetivo:** que la iglesia cree y edite sus propias secuencias en vez de depender de las que se consiguen en internet, y que cada músico pueda estudiar su parte (acordes, notas, instrumento aislado).

**Versión de prueba:** todo en este documento está abierto a cambios según lo que se vea al usarla. Es un proyecto personal, sin financiación: todo se diseña para costo cero (sección 12).

**Referencias:** Desglose toma como modelo a [Moises](https://apps.apple.com/us/app/moises-the-musicians-app/id1515796612) (separación, acordes, metrónomo inteligente, secciones, velocidad y tono) y a [StemDeck](https://github.com/stemdeckapp/stemdeck), una app libre con Tauri 2 + Web Audio + Python que demuestra que esta arquitectura funciona. Lo que suma Desglose y ninguno de los dos tiene: voz guía hablando, secuencia lista para REAPER y uso gratis sin límites.

**Dónde se instala:** en otra PC modesta (la de la iglesia), no en la PC de desarrollo. Todo se diseña para el peor caso: **4 GB de RAM y Windows 10 de 64 bits**. Se instala como cualquier programa y no pide instalar nada más.

**Cómo se usa hoy y cómo cambia**

| Hoy | Con Desglose |
| --- | --- |
| El encargado busca en internet una secuencia ya hecha | La app crea la secuencia desde el MP3 de la canción |
| Si no existe la secuencia, no hay | Cualquier canción se puede convertir en secuencia |
| Se usa tal como viene | Se edita: secciones, guía, click, instrumentos |
| El encargado la monta en REAPER y la manda a la consola | Igual: la app exporta un paquete para REAPER y él sigue con su flujo normal |

**Dentro del alcance (versión de prueba)**

- App de escritorio para **Windows**, hecha con Tauri 2 + React + TypeScript.
- Crear la secuencia automáticamente con IA y editarla.
- Sección de estudio: acordes, notas, tablatura, instrumento aislado, velocidad lenta.
- Exportar el paquete para REAPER (WAV por pista, click, guía y proyecto `.RPP`).
- Sin usuarios ni cuentas.

**Fuera del alcance (por ahora)**

- Conectar la app a la consola: lo sigue haciendo el encargado con REAPER.
- Usuarios y compartir canciones entre músicos.
- Versión de Android: llega después, con el mismo código, si la prueba funciona.
- Descargar audio desde YouTube (sección 13).

**Nombre de trabajo:** Desglose. Diseño en modo oscuro.

## 2. Flujo de uso

Un solo botón crea la secuencia; todo lo demás es revisar, editar, estudiar y exportar.

1. **Cargar:** arrastras el MP3, WAV o FLAC a la app (o los multitracks si los tienen).
2. **Crear secuencia:** la IA separa los instrumentos, detecta tempo, compás, secciones (Intro, Verso 1, Coro 1, Solo, Puente, Final...), acordes y tonalidad, y genera el click y la voz guía. Tarda unos minutos y avisa cuando termina.
3. **Revisar:** escuchas la secuencia con click y guía sobre la línea de tiempo, con cada sección marcada y su nombre.
4. **Editar:** corriges lo que la IA no acertó o lo que quieras cambiar: mover o renombrar secciones, que la guía hable antes, agregar avisos, cambiar el click, silenciar o bajar instrumentos.
5. **Estudiar (opcional):** en la sección de estudio ves acordes, notas y tablatura de cualquier tramo, aíslas un instrumento y lo bajas de velocidad.
6. **Exportar:** la app genera el paquete para REAPER (carpeta o `.zip`) y se lo pasas al encargado.

**Casos de uso principales**

| Caso | Quién | Resultado |
| --- | --- | --- |
| Crear una secuencia desde una canción | Oscar o el encargado | Secuencia completa con click, guía y pistas |
| Corregir secciones y guía | Quien arma la secuencia | Secuencia ajustada a cómo la toca la banda |
| Silenciar o bajar instrumentos de la secuencia | Quien arma la secuencia | Pistas que la banda no toca en vivo |
| Sacar una parte (por ejemplo la intro de guitarra) | Cualquier músico | Notas, acordes y tablatura de ese tramo |
| Exportar a REAPER | Quien arma la secuencia | Proyecto listo para abrir y mandar a la consola |

## 3. Requerimientos funcionales

Son 47 requerimientos en 6 módulos. **Alta** = sin esto no hay app; **Media** = importante. La fase indica en qué entrega entra (sección 14).

**A. Canciones**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-01 | Importar audio arrastrando o eligiendo el archivo (MP3, WAV, M4A, FLAC). | Alta | 1 |
| RF-02 | Importar multitracks: varias pistas ya separadas de la misma canción, sin pasar por la separación. | Media | 1 |
| RF-03 | Biblioteca de canciones: buscar, renombrar, duplicar y borrar. | Alta | 1 |
| RF-04 | Mostrar el avance del análisis por etapa y poder reintentar si falla. | Alta | 1 |
| RF-05 | Guardar todo en la PC; lo ya procesado funciona sin internet. | Alta | 1 |

**B. Creación automática de la secuencia (IA)**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-06 | Botón "Crear secuencia" que hace todo el proceso automático de una vez. | Alta | 1 |
| RF-07 | Separar la canción en pistas: voz, batería, bajo, guitarra, piano y otros. | Alta | 1 |
| RF-08 | Detectar qué instrumentos suenan de verdad y ocultar las pistas vacías. | Alta | 1 |
| RF-09 | Detectar BPM, compás, tiempos y primer tiempo de cada compás, incluso si el tempo cambia. | Alta | 1 |
| RF-10 | Detectar las secciones y nombrarlas: Intro, Verso, Pre-coro, Coro, Post-coro, Puente, Instrumental, Solo, Break, Final. | Alta | 1 |
| RF-11 | Numerar las secciones repetidas usando la letra: misma letra = mismo coro; letra nueva = Verso 2. | Alta | 1 |
| RF-12 | Detectar acordes (C, G/B, Am7) y tonalidad (D, Em) de toda la canción. | Alta | 2 |
| RF-13 | Generar automáticamente el click y la guía según las secciones detectadas. | Alta | 1 |
| RF-14 | Mostrar un nivel de confianza por sección para saber dónde revisar primero. | Media | 2 |

**C. Edición de la secuencia**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-15 | Línea de tiempo con forma de onda, compases, secciones y acordes. | Alta | 1 |
| RF-16 | Crear, mover, dividir, unir, renombrar y borrar secciones. | Alta | 1 |
| RF-17 | Corregir BPM, compás y primer tiempo; agregar cambios de tempo o de compás en cualquier punto. | Alta | 1 |
| RF-18 | Silenciar, aislar y cambiar el volumen de cada instrumento en la secuencia exportada. | Alta | 1 |
| RF-19 | Reordenar el arreglo: repetir, quitar o mover secciones (por ejemplo, un coro más al final); el audio se recorta y se rearma solo. | Media | 2 |
| RF-20 | Deshacer y rehacer cualquier cambio. | Alta | 1 |
| RF-21 | Conservar las ediciones manuales si se vuelve a analizar. | Alta | 1 |

**D. Click y voz guía**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-22 | Click en cualquier compás (4/4, 3/4, 6/8, 12/8) con acento en el 1. | Alta | 1 |
| RF-23 | Subdivisión del click (negras, corcheas, tresillos), sonido y volumen configurables. | Media | 1 |
| RF-24 | Conteo de entrada configurable al inicio (por ejemplo 1 o 2 compases). | Alta | 1 |
| RF-25 | Guía un compás antes de cada sección: nombre más conteo ("Coro, 2, 3, 4"). | Alta | 1 |
| RF-26 | Anticipación de la guía configurable por canción y por sección (1 o 2 compases, o sin guía). | Alta | 1 |
| RF-27 | Avisos libres en cualquier compás ("Solo piano", "Última vez", "Corte"). | Media | 1 |
| RF-28 | Banco de frases editable: escribir el texto y la app genera la voz, o grabarla con micrófono. | Alta | 1 |
| RF-29 | Click y guía suenan siempre en tiempo aunque se cambie la velocidad de práctica. | Alta | 1 |
| RF-47 | El click sale solo del análisis de la canción; si se edita, un botón lo devuelve al original detectado. | Alta | 1 |

**E. Estudio**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-30 | Reproducir las pistas sincronizadas con play, pausa y búsqueda. | Alta | 1 |
| RF-31 | Mute, solo y volumen por pista, independientes de la mezcla exportada. | Alta | 1 |
| RF-32 | Repetir un tramo en bucle. | Alta | 1 |
| RF-33 | Cambiar la velocidad sin cambiar el tono (50% a 125%). | Alta | 1 |
| RF-34 | Transponer el tono en semitonos. | Media | 2 |
| RF-35 | Ver acordes sobre la línea de tiempo y en una hoja de acordes por sección. | Alta | 2 |
| RF-36 | Transcribir las notas de cualquier pista en un tramo: lista de notas (E, G, A) y piano roll. | Alta | 2 |
| RF-37 | Tablatura aproximada de guitarra o bajo, con afinación configurable. | Media | 2 |
| RF-38 | Escuchar las notas transcritas con sonido sintético para comparar. | Media | 2 |
| RF-39 | Ver la letra transcrita por sección. | Media | 2 |

**F. Exportación**

| ID | Requerimiento | Prioridad | Fase |
| --- | --- | --- | --- |
| RF-40 | Exportar un WAV por instrumento, todos del mismo largo y alineados al inicio. | Alta | 1 |
| RF-41 | Exportar `Click.wav` y `Guia.wav` por separado. | Alta | 1 |
| RF-42 | Exportar un proyecto de REAPER (`.RPP`) con las pistas cargadas, el tempo y las secciones como regiones. | Alta | 1 |
| RF-43 | Exportar opcionalmente un WAV dividido: click y guía a la izquierda, secuencia a la derecha. | Media | 1 |
| RF-44 | Elegir qué pistas van en la exportación (por ejemplo, sin batería si el baterista toca en vivo). | Alta | 1 |
| RF-45 | Exportar todo en una carpeta o en un `.zip`, con nombres claros. | Alta | 1 |
| RF-46 | Exportar la transcripción de notas como MIDI. | Media | 3 |

## 4. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
| --- | --- | --- |
| RNF-01 | Costo | Costo cero: solo herramientas gratuitas y de código abierto, y los créditos gratis de Modal (sección 12). |
| RNF-02 | Equipo mínimo | Windows 10 u 11 de 64 bits, 4 GB de RAM, procesador de doble núcleo, 2 GB libres en disco. Sin tarjeta de video dedicada. |
| RNF-03 | Instalación | Un solo instalador `.exe` de menos de 30 MB. No pide instalar Python, FFmpeg ni nada más. Si falta WebView2, el instalador lo descarga solo. |
| RNF-04 | Memoria | Con una canción de 8 pistas abierta, la app usa menos de 400 MB de RAM. Las pistas se leen desde el disco, no se cargan completas en memoria. |
| RNF-05 | Rendimiento | Crear una secuencia de una canción de 4 minutos tarda pocos minutos (la IA corre en la nube); la meta exacta sale de la Fase 0. |
| RNF-06 | Sincronía | Pistas, click y guía sin desfase entre sí (exacto al sample en la exportación, menos de 10 ms en reproducción). |
| RNF-07 | Latencia | Mute, solo y volumen responden en menos de 100 ms. |
| RNF-08 | Offline | Solo crear la secuencia necesita internet. Editar, escuchar, estudiar y exportar funcionan sin conexión. |
| RNF-09 | Exportación | Los archivos abren en REAPER sin pasos extra: WAV 48 kHz 24 bits (configurable a 44.1 kHz), mismo largo, nombres claros. |
| RNF-10 | Precisión | Todo lo que detecta la IA es una sugerencia editable; nunca se pierde una corrección manual. |
| RNF-11 | Usabilidad | Pensada para mouse y teclado, con atajos (espacio = play, flechas = mover entre secciones); modo oscuro. |
| RNF-12 | Idioma | Interfaz en español; acordes y notas en cifrado americano (C, D, Em, G/B). |
| RNF-13 | Privacidad | La nube borra el audio y los resultados apenas la app los descarga. Sin cuentas. |
| RNF-14 | Fiabilidad | Si el análisis falla a mitad, se reintenta desde la etapa que falló. Si se cae internet, no se pierde lo ya editado. |
| RNF-15 | Mantenibilidad | Frontend y backend comparten un contrato tipado (OpenAPI → TypeScript); los modelos de IA se cambian sin tocar la app. |

## 5. Arquitectura y stack

Desglose es una app de escritorio liviana hecha con Tauri: la interfaz va en React, el audio en Rust leyendo desde el disco, y la IA pesada en la nube. Así corre bien en una PC de 4 GB sin tarjeta de video.

```text
App de escritorio (Tauri)                   Nube · Modal (GPU)
+--------------------------+  1 sube audio  +---------------------------+
| Interfaz (React + TS)    | -------------> | API (FastAPI)             |
|                          | <------------- |   v                       |
+--------------------------+  2 avance SSE  | Pipeline de IA            |
| Motor de audio (Rust)    |                |   v                       |
| lee pistas del disco     |  3 descarga    | Almacenamiento temporal   |
+--------------------------+ <------------- +---------------------------+
| Datos locales (SQLite)   |
+--------------------------+
            | 4 exporta el paquete
            v
   REAPER del encargado -> consola
```

La app sube la canción a Modal, ve el avance en vivo, descarga pistas y análisis, y desde ahí todo pasa en la PC sin internet: editar, escuchar, estudiar y exportar para REAPER.

**Stack elegido**

| Parte | Tecnología | Por qué |
| --- | --- | --- |
| App de escritorio | Tauri 2, instalador NSIS | Programa de Windows de pocos MB; usa el WebView2 que trae Windows |
| Interfaz | React + TypeScript + Vite, Tailwind CSS, Radix UI | Lo que ya se domina; se reutiliza para Android después |
| Estado | Zustand | Simple, con deshacer y rehacer |
| Motor de audio | Rust dentro de Tauri: `cpal`, `symphonia`, `rubato` | Lee las pistas del disco poco a poco: poca RAM y poca CPU |
| Tempo y tono | Signalsmith Stretch (crate `signalsmith-stretch`, MIT) | Buena calidad, corre en tiempo real |
| Exportar WAV | `hound` en Rust | Mismo cálculo que la reproducción, exacto al sample |
| Datos locales | SQLite con `tauri-plugin-sql` | Canciones, secciones, acordes, ediciones |
| Voz guía | Piper como programa interno (sidecar) | Gratis, sin internet, liviano |
| IA | Python 3.11 en Modal con GPU T4, FastAPI, uv | La PC no hace el trabajo pesado; créditos gratis |
| Contrato | Pydantic → OpenAPI → tipos TypeScript generados | Frontend y backend nunca se desincronizan |

**Decisiones clave**

- **Diseñado para la PC de la iglesia:** 4 GB de RAM y Windows 10 como mínimo. Nada pesado corre en la PC.
- **IA siempre en la nube:** separar en una PC sin GPU tardaría demasiado y pesaría gigas. Por eso no hay motor de IA local.
- **Audio en Rust desde el inicio:** el audio del navegador carga cada pista completa en RAM (unos 650 MB por canción), que en 4 GB es riesgoso. Rust lee del disco y gasta muy poco. El compilador ya está en la PC de desarrollo y la PC de la iglesia no necesita nada.
- **Sin Supabase ni base de datos en la nube:** no hay usuarios y todo se guarda en la PC.
- **Lo que se escucha es lo que se exporta:** el mismo motor en Rust reproduce y renderiza.
- **Descartados:** Flutter (dos lenguajes nuevos), Electron (pesado para 4 GB), Web Audio como motor principal (mucha RAM), IA local (lenta sin GPU), la API de pago de Moises (Music.AI).

## 6. IA: cómo se crea la secuencia sola

No hay que entrenar nada para empezar: se usan modelos ya entrenados, y un código propio (el "armador") junta sus resultados en una secuencia lista. Cada etapa guarda lo que produce, así una falla no repite lo anterior.

**Modelos por etapa**

| # | Etapa | Modelo principal | Respaldo | Salida |
| --- | --- | --- | --- | --- |
| 1 | Normalizar audio | FFmpeg | — | WAV 44.1 kHz estéreo |
| 2 | Separar instrumentos | BS-RoFormer-SW (6 pistas) vía [audio-separator](https://pypi.org/project/audio-separator/0.44.3/) | Demucs `htdemucs_6s` (MIT), misma librería | Voz, batería, bajo, guitarra, piano, otros |
| 3 | Tiempos y compases | [Beat This!](https://arxiv.org/html/2407.21658v1) | All-In-One | Tiempos, primer tiempo de cada compás, BPM, compás |
| 4 | Secciones con nombre | [SongFormer](https://arxiv.org/html/2510.02797) | [All-In-One](https://github.com/mir-aidj/all-in-one) | Secciones: intro, verso, pre-coro, coro, puente, instrumental, solo, outro |
| 5 | Letra | faster-whisper sobre la pista de voz | — | Letra con tiempo por palabra |
| 6 | Acordes | [BTC](https://github.com/jayg996/BTC-ISMIR19) (transformer, MIT, vocabulario grande con séptimas) | Se compara con otra opción en la Fase 0 | Acordes con inicio y fin |
| 7 | Tonalidad | librosa o Essentia | — | Tonalidad (D, Em) |
| 8 | Formas de onda | Código propio (picos por pista) | — | Archivo liviano para dibujar sin cargar el audio |
| 9 | Notas (bajo demanda) | Basic Pitch (Spotify) | — | Notas de una pista en un tramo |
| 10 | Armador de la secuencia | Código propio | — | Secuencia completa en `analysis.json` |

**Qué hace el armador (paso 9)**

1. **Cuadrícula:** arma los compases desde los tiempos detectados, suaviza pequeñas variaciones de tempo y decide el compás (4/4, 3/4, 6/8).
2. **Ajuste a compás:** mueve el inicio de cada sección al primer tiempo de compás más cercano.
3. **Nombres en español:** traduce las etiquetas (verse → Verso, chorus → Coro, bridge → Puente...).
4. **Numeración con la letra:** compara la letra de las secciones con el mismo nombre. Si un verso trae letra nueva, es Verso 2; si un "verso" repite la letra del coro, se corrige a Coro.
5. **Solos:** una sección sin voz donde una pista domina (guitarra o piano) se marca como Solo; sin voz y sin instrumento dominante, Instrumental.
6. **Instrumentos vacíos:** las pistas casi en silencio se marcan como vacías y se ocultan.
7. **Click y guía:** coloca el conteo de entrada, el click y los avisos de guía según las reglas de la sección 10.1.
8. **Confianza:** marca cada sección con alta, media o baja confianza para que se revisen primero las dudosas.

**Qué esperar**

- Acierta la mayoría de secciones, pero puede equivocarse en el punto exacto de inicio o confundir pre-coro con verso, sobre todo en alabanza con partes que se repiten libremente. Por eso todo es editable.
- Una grabación de estudio sale mucho mejor que un concierto en vivo.
- La separación da 6 grupos: sintes, pads y cuerdas quedan juntos en "otros", y dos guitarras salen en la misma pista. Con multitracks (RF-02) no existe ese límite.
- Entre 6/8 y 3/4 el modelo puede dudar; se corrige con un clic.

**Entrenar después (opcional):** la app guarda cada corrección que hacen. Con suficientes canciones corregidas se puede afinar SongFormer con su propio repertorio, porque su código de entrenamiento es público. No hace falta para la versión de prueba.

## 7. Backend de IA (Modal)

El backend es un solo proyecto de Python, ordenado como el de StemDeck: una API pequeña, un pipeline donde cada etapa es un archivo, y trabajos que avisan su avance en vivo. Corre en Modal porque la PC de la iglesia no puede con la IA.

**Principios**

- **Simple primero:** un trabajo a la vez por canción, sin colas externas ni bases de datos en la nube.
- **Cada etapa es independiente:** recibe archivos, devuelve archivos y guarda su resultado. Se puede probar sola y reintentar sola.
- **Contrato tipado:** todo lo que entra y sale son modelos Pydantic; de ahí sale OpenAPI y de ahí los tipos de TypeScript para la app.
- **Avance en vivo por SSE:** la app abre una conexión y recibe cada cambio de etapa, sin preguntar cada dos segundos.
- **Probar en local, desplegar en Modal:** el mismo código corre en la PC de desarrollo con `uv run` para pruebas cortas, y en Modal con GPU para canciones reales.

**Componentes**

| Componente | Tecnología | Función |
| --- | --- | --- |
| Entorno | uv (Python 3.11) | Dependencias exactas con archivo de bloqueo |
| API | FastAPI dentro de Modal | Recibe subidas, emite avance, entrega resultados |
| Trabajo de IA | Función de Modal con GPU T4 | Corre las etapas 1 a 10 |
| Separación | audio-separator | Un solo punto para BS-RoFormer, Demucs y modelos UVR |
| Estado de trabajos | Modal Dict | Etapa, porcentaje y errores de cada trabajo |
| Almacenamiento temporal | Modal Volume | Audio subido, pistas FLAC, ondas y `analysis.json` |
| Seguridad | Token secreto en la app | Solo Desglose puede usar la API |
| Limpieza | Tarea programada de Modal | Borra lo descargado y lo que tenga más de 24 horas |
| Calidad | pytest y ruff | Pruebas por etapa y estilo uniforme |

**API (`/v1`)**

| Método | Ruta | Para qué |
| --- | --- | --- |
| POST | `/jobs` | Subir audio; devuelve `job_id` |
| GET | `/jobs/{job_id}/events` | Avance en vivo (SSE) |
| GET | `/jobs/{job_id}` | Estado actual (por si se corta la conexión) |
| POST | `/jobs/{job_id}/cancel` | Cancelar |
| POST | `/jobs/{job_id}/retry` | Reintentar desde la etapa que falló |
| GET | `/jobs/{job_id}/result` | `analysis.json` |
| GET | `/jobs/{job_id}/files/{nombre}` | Descargar pistas FLAC y ondas |
| POST | `/jobs/{job_id}/transcribe` | Notas de una pista y un tramo |
| DELETE | `/jobs/{job_id}` | Borrar todo de inmediato |
| GET | `/health` | Verificar que el servicio responde |

Etapas que reporta un trabajo: `queued`, `normalizing`, `separating`, `rhythm`, `structure`, `lyrics`, `harmony`, `assembling`, `done`, `failed`, `cancelled`.

**Estructura**

```text
backend/
  pyproject.toml          # dependencias (uv)
  uv.lock
  desglose_engine/
    main.py               # crea la app FastAPI
    modal_app.py          # imagen, GPU, volumen y secretos de Modal
    api/
      jobs.py             # crear, cancelar, reintentar, borrar
      events.py           # SSE con el avance
      results.py          # analysis.json y archivos
    core/
      config.py           # rutas, modelo elegido, límites
      jobs.py             # registro de trabajos y etapas
      schemas.py          # modelos Pydantic (contrato con la app)
      storage.py          # volumen temporal
    pipeline/
      normalize.py
      separate.py
      rhythm.py
      structure.py
      lyrics.py
      chords.py
      key.py
      waveform.py
      notes.py
      assemble.py
      runner.py           # orquesta las etapas y reporta avance
  scripts/
    export_openapi.py     # genera openapi.json para la app
  tests/
```

## 8. Modelo de datos

Todo vive en la PC: una base SQLite (con `tauri-plugin-sql`) para la información y una carpeta por canción para el audio. La IA propone; lo que el usuario edita se guarda aparte y nunca se sobrescribe.

**Tablas locales**

| Tabla | Campos principales |
| --- | --- |
| `songs` | id, título, artista, duración\_ms, tonalidad, estado, creado\_en |
| `stems` | id, song\_id, instrumento, ruta\_flac, vacía, volumen\_export, en\_export, volumen\_estudio, mute, solo |
| `tempo_map` | song\_id, inicio\_compás, bpm, compás (permite cambios de tempo y de compás) |
| `beats` | song\_id, lista de tiempos en ms con marca de primer tiempo (JSON) |
| `sections` | id, song\_id, nombre, número, inicio\_compás, fin\_compás, confianza, editada, orden |
| `cues` | id, song\_id, compás, tiempo, frase\_id, tipo (sección, conteo, aviso) |
| `chords` | id, song\_id, acorde, inicio\_ms, fin\_ms, confianza, editado |
| `lyrics` | song\_id, palabras con tiempo (JSON) |
| `phrases` | id, texto, ruta\_wav, origen (Piper o grabada), paquete |
| `sequence_settings` | song\_id, conteo\_entrada, anticipación, subdivisión, sonido\_click, volúmenes, paquete\_voz |
| `edits_log` | id, song\_id, tipo, antes, después, fecha (para deshacer y para entrenar después) |
| `settings` | clave, valor (modo de análisis, carpeta de exportación, afinación) |

**Carpeta de cada canción**

```text
Documentos/Desglose/<cancion>/
  original.mp3
  stems/   voz.flac  bateria.flac  bajo.flac  guitarra.flac  piano.flac  otros.flac
  analysis.json        # lo que propuso la IA (no se edita)
  export/              # se llena al exportar (sección 11)
```

**`analysis.json` que devuelve la IA**

```json
{
  "version": 1,
  "duration_ms": 245300,
  "tempo_map": [ { "bar": 1, "bpm": 72.0, "meter": "4/4" } ],
  "beats": [ { "t": 1020, "downbeat": true }, { "t": 1853, "downbeat": false } ],
  "key": { "tonic": "D", "mode": "major", "confidence": 0.82 },
  "sections": [
    { "name": "Intro", "number": null, "start_bar": 1, "end_bar": 9, "confidence": "alta" },
    { "name": "Verso", "number": 1, "start_bar": 9, "end_bar": 25, "confidence": "media" }
  ],
  "chords": [ { "start": 1020, "end": 4350, "label": "D", "confidence": 0.9 } ],
  "lyrics": [ { "word": "Santo", "start": 13200, "end": 13650 } ],
  "stems": [ { "name": "guitarra", "empty": false } ]
}
```

**Transcripción de notas (bajo demanda)**

```json
{
  "stem": "guitarra",
  "start_ms": 0,
  "end_ms": 20000,
  "notes": [ { "start": 1020, "end": 1300, "midi": 64, "name": "E4", "velocity": 78,
               "tab": { "string": 1, "fret": 0 } } ]
}
```

`midi` es el número estándar de nota (60 = C central); de él salen el nombre (E4) y la posición en la tablatura.

## 9. App de escritorio (Tauri + React)

Tauri 2 empaqueta la interfaz React como programa de Windows. La interfaz solo dibuja y manda órdenes; el audio, los archivos y la exportación los hace Rust, y la interfaz recibe la posición de reproducción por eventos de Tauri.

**Paquetes** (todos gratuitos; verificar versiones al iniciar)

| Necesidad | Paquete |
| --- | --- |
| App de escritorio | Tauri 2 (`@tauri-apps/api`, `@tauri-apps/cli`), instalador NSIS |
| Interfaz | React + TypeScript + Vite |
| Estilos | Tailwind CSS |
| Componentes accesibles | Radix UI (menús, diálogos, sliders) |
| Animaciones | Motion (antes Framer Motion) |
| Estado | Zustand (con historial para deshacer y rehacer) |
| Navegación | React Router |
| Tipos del backend | `openapi-typescript` (generados desde el backend) |
| Base local | `tauri-plugin-sql` (SQLite) |
| Archivos y diálogos | `tauri-plugin-fs`, `tauri-plugin-dialog` |
| Programas internos | `tauri-plugin-shell` (Piper) |
| Audio (Rust) | `cpal`, `symphonia`, `rubato`, `signalsmith-stretch`, `hound` |
| Comprimir exportación | `zip` (Rust) |
| Línea de tiempo, ondas, piano roll, tablatura | Dibujo propio con Canvas |
| Pruebas | Vitest (interfaz), `cargo test` (audio) |

**Estructura**

```text
app/
  src/                   # interfaz React
    main.tsx
    app/                 # rutas, tema oscuro, atajos de teclado
    lib/
      api/               # cliente de la API + tipos generados
      engine.ts          # órdenes al motor de audio (invoke + eventos)
      db/                # tablas y consultas SQLite
      music/             # acordes, notas, compases, tablatura
    features/
      library/  import-song/  editor/  click-guide/
      mixer/  study/  phrases/  export/  settings/
    components/          # botones, sliders, paneles comunes
  src-tauri/
    src/
      main.rs
      commands.rs        # órdenes que llama la interfaz
      audio/
        engine.rs        # reloj, mezcla y salida (cpal)
        track.rs         # lectura de cada pista desde el disco
        click.rs         # metrónomo desde el mapa de tempo
        guide.rs         # disparo de frases de la guía
        stretch.rs       # tempo y tono
        render.rs        # exportación a WAV
      export/
        rpp.rs           # proyecto de REAPER
        package.rs       # carpeta o zip
    binaries/            # piper.exe y voz en español
    tauri.conf.json
```

**Pantallas**

| Pantalla | Qué contiene |
| --- | --- |
| Biblioteca | Canciones, búsqueda, botón "Nueva canción", estado del análisis |
| Nueva canción | Arrastrar archivo, nombre, botón "Crear secuencia", avance por etapa |
| Editor (principal) | Línea de tiempo con ondas, compases, secciones de colores, acordes y avisos; transporte; panel de pistas |
| Panel de pistas | Por pista: en exportación sí o no, volumen de exportación, mute, solo |
| Click y guía | Conteo de entrada, anticipación, subdivisión, sonido, volúmenes, paquete de voz |
| Estudio | Elegir pista y tramo; acordes, notas, piano roll, tablatura, letra; velocidad y bucle |
| Frases de voz | Lista de frases, escribir y generar con Piper, grabar, escuchar |
| Exportar | Qué pistas, formato, carpeta o `.zip`, vista previa del proyecto de REAPER |
| Ajustes | Carpeta por defecto, afinación, salida de audio, créditos usados del mes |

**Estado (Zustand)**

- `useLibrary`: canciones.
- `useAnalysisJob(songId)`: avance del análisis.
- `useSequence(songId)`: secciones, tempo, avisos, con deshacer y rehacer.
- `useTransport`: posición, reproduciendo, velocidad, bucle.
- `useMix(songId)`: estado de cada pista para exportar y para estudiar.
- `useStudy`: tramo y transcripción.

## 10. Motor de audio

El motor de audio está en Rust y lee cada pista desde el disco en bloques pequeños, así una canción de 8 pistas se reproduce con unas decenas de MB de RAM. Reproducción y exportación usan el mismo código, así lo que se escucha es exactamente lo que llega a REAPER. Es la parte de mayor riesgo y se prototipa primero (Fase 0).

**Cómo funciona**

| Necesidad | Cómo |
| --- | --- |
| Leer pistas | `symphonia` decodifica FLAC por bloques; un hilo por canción llena un búfer adelantado |
| Reloj único | Un contador de samples manda sobre todas las pistas, el click y la guía |
| Mezcla | Suma de pistas con su ganancia; mute, solo y volumen con rampa corta para evitar chasquidos |
| Salida | `cpal` con WASAPI en modo compartido; búfer generoso para no cortar en PCs lentas |
| Velocidad y tono de estudio | Signalsmith Stretch sobre la mezcla, solo cuando se usa |
| Click | Se genera desde el mapa de tempo y compases; no es audio grabado |
| Guía | Clips cortos de frases (en memoria, pesan poco) disparados en el sample exacto |
| Bucle y saltos | Reposiciona la lectura de todas las pistas a la vez |
| Reordenar arreglo | Lista de tramos por compás; el motor salta entre ellos con fundidos cortos |
| Exportar | Render sin tarjeta de sonido, más rápido que tiempo real, a WAV 24 bits con `hound` |
| Formas de onda | Se dibujan con los picos que manda la nube; no hace falta decodificar el audio para verlas |
| Comunicación con la interfaz | Órdenes por `invoke` (play, mute, buscar) y posición por eventos unas 30 veces por segundo |

**Puntos delicados**

- Medir en la Fase 0 con 8 pistas durante 5 minutos: desfase, cortes, RAM y uso de CPU, ojalá en una PC modesta.
- Si la CPU no da para tempo y tono en vivo, se renderiza la versión lenta antes de reproducir.
- Los cortes del arreglo deben caer en primer tiempo de compás para que no se note el salto.
- El estiramiento de tiempo es solo para estudiar; la exportación siempre va a velocidad original.

## 10.1 Voces guía: cómo funcionan y qué dicen

En las secuencias de alabanza la guía anuncia la siguiente sección **un compás antes**, y termina con el conteo: "Coro, 2, 3, 4" y entra el coro. Así lo hacen los proveedores grandes de multitracks y las apps de click.

**Cómo suena en un compás de 4/4**

| Tiempo 1 | Tiempo 2 | Tiempo 3 | Tiempo 4 | Siguiente compás |
| --- | --- | --- | --- | --- |
| "Coro" | "2" | "3" | "4" | Empieza el coro |

Al inicio de la canción se usa un conteo de entrada (por ejemplo un compás de click más "Intro, 2, 3, 4").

**Lo que se encontró**

- **Un compás antes:** la guía avisa una barra antes de cada sección mientras los músicos siguen su cifrado ([Mark Cole](https://www.apostolic.edu/wp-content/uploads/2020/07/MUSIC-2-USING-MULTITRACKS-WITH-YOUR-WORSHIP-TEAM.docx)). Hay quien la siente justa en tempos rápidos ([Worship Artistry](https://worshipartistry.com/greenroom/keyboard/the-cue-dilemma)), por eso la anticipación debe ser configurable.
- **Secciones numeradas:** MultiTracks numera las secciones que se repiten con letra distinta (Coro 1, Coro 2, Puente 1, Puente 2) y tiene guías grabadas también en español ([MultiTracks](https://www.multitracks.com/blog/updated-song-sections-guide-cues)).
- **Nombres largos necesitan espacio:** la app Click Set da más tiempo a frases como "Instrumental 3" para que terminen antes del conteo; maneja 17 tipos de sección y 43 frases ([Click Set](https://apps.apple.com/app/id6761139173)).
- **Avisos de dinámica:** además del nombre, se agregan instrucciones como "puente, batería a medio tiempo", "corte en el 4, luego solo piano" o "primera vez, solo guitarra" ([Loop Community](https://loopcommunity.com/blog/?p=6607)).
- **Ruteo:** click y guía van solo a los in-ears de los músicos, en canales propios, nunca al sonido de la congregación ([Churchfront](https://churchfront.com/2023/06/11/how-to-setup-a-click-and-tracks-for-worship-bands/)).
- **Problema común:** cuando la banda reorganiza la canción, la guía grabada sigue la estructura original y anuncia la sección equivocada ([Worship Artistry](https://worshipartistry.com/greenroom/keyboard/the-cue-dilemma)). En esta app la guía se genera desde las secciones, así que si se mueve una sección, la guía la sigue.

**Vocabulario de secciones propuesto (español)**

| La guía dice | Qué es |
| --- | --- |
| Intro | Entrada de la canción |
| Verso 1, Verso 2 | Estrofas |
| Pre-coro | Sube hacia el coro |
| Coro 1, Coro 2 | Parte principal que se repite |
| Post-coro | Frase o gancho que sigue al coro |
| Puente | Sección distinta, normalmente una vez hacia el final |
| Instrumental | Parte sin voz, larga |
| Interludio | Transición corta de 1 o 2 compases |
| Vuelta (turnaround) | Retoma la idea de la intro entre secciones |
| Refrán | Vuelta con una frase cantada encima |
| Solo | Solo de un instrumento |
| Tag | Frase final que se repite |
| Vamp | Se repite libremente hasta que se indique |
| Rap | Parte hablada o rapeada |
| Final | Cierre de la canción |

**Avisos de dinámica propuestos** (frases libres que el equipo puede agregar, editar o borrar): "Todos", "Solo voz", "Solo piano", "Bajamos", "Subimos", "Corte", "Última vez", "Repetimos", "Fuera en el 3", "Medio tiempo", "Ritardando".

**Reglas que usa la app (decididas con base en lo anterior)**

1. **Conteo de entrada:** 1 compás de click y luego "Intro, 2, 3, 4" (o "1, 2, 3, 4" si la canción arranca con voz). Configurable a 2 compases.
2. **Anticipación por defecto:** 1 compás antes de cada sección, que es lo estándar en secuencias de alabanza.
3. **Tempos rápidos:** si un compás dura menos de 1,6 segundos (por ejemplo, más de 150 BPM en 4/4), la app sugiere 2 compases de anticipación para que el nombre se alcance a decir. Es un valor inicial que se ajusta al probar.
4. **Nombres largos:** si el nombre no cabe en un tiempo, se recorta el conteo ("Instrumental... 3, 4").
5. **Compases distintos:** en 3/4 el conteo es "Coro, 2, 3"; en 6/8 se cuenta en 2 ("Coro, 2") a tempo lento o en 6 si se prefiere.
6. **Secciones de menos de un compás** no llevan aviso.
7. **Todo editable:** por canción y por sección se puede cambiar la anticipación, quitar la guía o agregar avisos libres.

**Cómo se generan las voces**

1. **Banco de frases:** cada frase ("Coro", "2", "Última vez") es un clip WAV corto guardado en la PC.
2. **Voz sintetizada con Piper:** escribes el texto y la app genera el audio en segundos, sin internet. La app trae un paquete inicial en español con todo el vocabulario de arriba.
3. **Grabar la propia:** cualquier frase se puede reemplazar por una grabación con micrófono.
4. **Paquetes de voz:** se pueden tener varios ("Voz Piper", "Voz de Oscar") y elegir cuál usa cada canción.

## 11. Exportación a REAPER

La app entrega un paquete igual al de una secuencia descargada de internet: el encargado lo abre en REAPER y sigue con su flujo de siempre hacia la consola.

**Contenido del paquete**

```text
Coro de Alabanza - 72bpm - D/
  Coro de Alabanza.RPP      # proyecto de REAPER listo
  01 CLICK.wav
  02 GUIA.wav
  03 Bateria.wav
  04 Bajo.wav
  05 Guitarra.wav
  06 Piano.wav
  07 Otros.wav
  08 Voz.wav                # solo si se incluyó
  Split.wav                 # opcional: click y guía a la izquierda, secuencia a la derecha
  Acordes.txt               # secciones con sus acordes
```

**Reglas del paquete**

- Todos los WAV empiezan en el mismo punto y duran lo mismo, incluido el conteo de entrada.
- Solo van las pistas marcadas "en exportación", con el volumen elegido.
- El nombre de la carpeta lleva tempo y tonalidad, como suelen venir las secuencias.
- Se puede guardar como carpeta o como `.zip` para pasarlo por WhatsApp, Drive o USB.

**Qué trae el proyecto `.RPP`**

Los proyectos de REAPER son texto plano, así que la app los escribe directamente:

- Una pista por archivo, con CLICK y GUIA primero.
- El tempo y el compás, incluidos los cambios si los hay.
- Cada sección como **región** con su nombre (Intro, Verso 1, Coro 1...). Así el encargado puede saltar o repetir una sección en vivo y la guía se repite con ella.
- Las salidas de las pistas se dejan por defecto: el encargado las enruta a la consola como ya lo hace.

Ejemplo simplificado:

```text
<REAPER_PROJECT 0.1 "7.0"
  TEMPO 72 4 4
  MARKER 1 0.000 "Intro" 1
  MARKER 1 26.667 "" 1
  MARKER 2 26.667 "Verso 1" 1
  MARKER 2 53.333 "" 1
  <TRACK
    NAME "CLICK"
    <ITEM
      POSITION 0
      LENGTH 245.3
      <SOURCE WAVE
        FILE "01 CLICK.wav"
      >
    >
  >
>
```

En la Fase 0 se abre un `.RPP` generado en el REAPER del encargado para confirmar que carga sin errores y que el formato se parece a las secuencias que usa hoy.

## 12. Costo cero

Es un proyecto personal sin financiación, así que todo se elige para costar cero. El único servicio externo es Modal, y se usa dentro de sus créditos gratis.

| Parte | Costo | Límite o nota |
| --- | --- | --- |
| Tauri, React, Rust y todas las librerías | Gratis | Código abierto |
| Modelos de IA | Gratis | Código abierto; se revisa la licencia de cada uno en la Fase 0 |
| Piper (voz) | Gratis | Corre en la PC, es liviano |
| Modal (IA en la nube) | Gratis con créditos | Plan Starter: 1 USD al mes sin método de pago; agregar tarjeta desbloquea 29 USD más. Una GPU T4 cuesta unos 0,59 USD por hora, sin contar CPU y memoria ([precios](https://modal.com/pricing)). Tema abierto en `docs/decisiones.md` |
| Código en GitHub | Gratis | Repositorio privado |
| Instalador de Windows | Gratis | Sin firma de código: Windows muestra un aviso al instalar; se acepta con "Ejecutar de todas formas" |
| Android (después) | Gratis | Se instala el APK directo; no hace falta Play Store |

Con el uso de una iglesia (unas pocas canciones por semana), los créditos gratis deberían alcanzar de sobra. El gasto real por canción se mide en la Fase 0, y la app muestra un aviso si se acerca al límite del mes.

## 13. Riesgos y legal

| Riesgo | Impacto | Qué hacer |
| --- | --- | --- |
| Motor de audio en Rust (sincronía, cortes en PC lenta) | Alto | Prototiparlo primero y medirlo en una PC modesta |
| PC de la iglesia muy lenta para tempo y tono en vivo | Medio | Renderizar la versión lenta antes de reproducir |
| Secciones mal detectadas | Medio | Indicador de confianza, edición rápida y uso de la letra para corregir |
| Acordes imprecisos | Medio | Comparar BTC con otra opción en la Fase 0; edición manual |
| Calidad baja con audio en vivo | Medio | Recomendar versiones de estudio; corrección manual |
| Guitarra mezclada con otros instrumentos | Medio | Mejor modelo de separación; multitracks cuando haya |
| El `.RPP` no carga como se espera | Medio | Probarlo en la Fase 0 con el REAPER del encargado |
| Sin internet en la iglesia al crear una secuencia | Bajo | Crear la secuencia en otra parte (por ejemplo en casa) y llevar la canción ya procesada; todo lo demás es offline |
| Se acaban los créditos de Modal | Bajo | Medir en la Fase 0; aviso en la app; esperar al mes siguiente |
| Licencias de modelos | Bajo | Uso personal y no comercial; Demucs (MIT) como respaldo |

**Derechos de autor**

- La app solo acepta archivos que ustedes ya tengan; no descarga de YouTube, porque va contra sus términos y cada canción tiene derechos de autor.
- Las secuencias son para uso interno de la iglesia y no se publican ni se venden.
- Usar canciones en cultos o transmisiones puede requerir licencias de uso musical (por ejemplo CCLI); eso es aparte de la app y conviene confirmarlo con el liderazgo.
- Este documento no es asesoría legal.

## 14. Plan por fases

La Fase 1 ya entrega lo principal: crear la secuencia sola, editarla y exportarla a REAPER. No hay fechas porque dependen del tiempo libre disponible.

| Fase | Contenido | Puerta para pasar |
| --- | --- | --- |
| 0 · Pruebas | Motor de audio con 8 pistas, IA con 3-5 canciones, abrir .RPP en REAPER, medir costo de Modal | Audio sin desfase, IA útil y .RPP que abre |
| 1 · Secuencia | Crear secuencia automática, editar secciones, tempo y compases, click y voz guía, pistas para exportar, exportar a REAPER, estudio básico | Una secuencia propia usada en un culto |
| 2 · Estudio | Acordes y tonalidad, notas y piano roll, tablatura y letra, reordenar arreglo, transponer | La banda la usa cada semana |
| 3 · Después | Exportar MIDI, entrenar la IA con sus correcciones, versión Android | — |

Cada fase termina en una puerta: no se pasa a la siguiente hasta cumplirla.

| Fase | Requerimientos |
| --- | --- |
| 0 · Pruebas | Ninguno de la lista: prototipos y mediciones (ver lista abajo) |
| 1 · Secuencia | RF-01 a RF-11, RF-13, RF-15 a RF-18, RF-20 a RF-33, RF-40 a RF-45, RF-47 |
| 2 · Estudio | RF-12, RF-14, RF-19, RF-34 a RF-39 |
| 3 · Después | RF-46, entrenar la IA con sus correcciones, versión Android |

**Fase 0: qué se prueba antes de construir pantallas**

- [ ] Motor de audio en Rust dentro de una app Tauri mínima: 8 pistas durante 5 minutos sin desfase ni cortes, con menos de 400 MB de RAM.
- [ ] Cambio de tempo con Signalsmith Stretch y exportación a WAV exacta.
- [ ] Instalador NSIS probado en otra PC con Windows 10 y 4 GB de RAM (o lo más parecido que haya).
- [ ] Pipeline de IA en Modal con 3 a 5 canciones de su repertorio: revisar a oído pistas, tempo y secciones.
- [ ] Comparar BS-RoFormer-SW contra Demucs y SongFormer contra All-In-One con esas canciones.
- [ ] Probar BTC para acordes contra lo que ustedes tocan.
- [ ] Generar un `.RPP` y abrirlo en el REAPER del encargado.
- [ ] Generar el paquete de voz en español con Piper y escucharlo sobre el click.
- [ ] Medir cuánto crédito de Modal gasta cada canción.

## 15. Decisiones y próximos pasos

Todo lo de alcance está decidido; solo falta elegir las canciones de prueba.

| Tema | Decisión |
| --- | --- |
| Tipo de app | Escritorio para Windows, instalable en una PC modesta; Android después |
| Modelo de referencia | Moises (funciones) y StemDeck (arquitectura) |
| Equipo mínimo | Windows 10 de 64 bits, 4 GB de RAM, sin tarjeta de video |
| Función principal | La IA crea la secuencia completa y el equipo la edita |
| Entrega | Paquete para REAPER; el encargado sigue con su flujo hacia la consola |
| Interfaz | Tauri 2 + React + TypeScript |
| Audio | Motor en Rust que lee desde el disco |
| IA | Siempre en la nube: Python en Modal con FastAPI, uv, SSE y contrato tipado |
| Usuarios y nube de datos | No por ahora; Supabase si un día hay usuarios |
| Voz guía | Piper (sintetizada, sin internet) más grabación opcional; todo editable |
| Anticipación | 1 compás por defecto, 2 sugeridos en tempos rápidos, editable |
| Click | Cualquier compás, cambios de tempo, subdivisión, todo editable |
| Cifrado | Americano: C, D, Em, G/B |
| Costo | Cero: todo gratuito o con créditos gratis |
| Nombre y diseño | Desglose, modo oscuro |

**Próximos pasos**

- [ ] Elegir 3 a 5 canciones de prueba: una de estudio, una en vivo, una con guitarra eléctrica protagonista y una en 6/8 o 3/4 si tocan alguna.
- [ ] Crear la cuenta gratis de Modal.
- [ ] Pedirle al encargado una secuencia de las que descarga hoy, para copiar su formato.
- [ ] Empezar la Fase 0 por el núcleo de audio.

## Fuentes

- [MultiTracks: secciones y guías](https://www.multitracks.com/blog/updated-song-sections-guide-cues)
- [Loop Community: cómo hacer una pista de guía](https://loopcommunity.com/blog/?p=6607)
- [Worship Artistry: problemas comunes de las guías](https://worshipartistry.com/greenroom/keyboard/the-cue-dilemma)
- [Click Set (App Store)](https://apps.apple.com/app/id6761139173)
- [Churchfront: ruteo de click y pistas](https://churchfront.com/2023/06/11/how-to-setup-a-click-and-tracks-for-worship-bands/)
- [SongFormer (paper)](https://arxiv.org/html/2510.02797)
- [All-In-One Music Structure Analyzer](https://github.com/mir-aidj/all-in-one)
- [Beat This! (paper)](https://arxiv.org/html/2407.21658v1)
- [MVSep: comparación de modelos de separación](https://mvsep.com/en/algorithms)
- [Modal: precios](https://modal.com/pricing)
- [Moises en el App Store](https://apps.apple.com/us/app/moises-the-musicians-app/id1515796612)
- [Moises: qué incluye Premium](https://help.moises.ai/hc/en-us/articles/9410960985628)
- [StemDeck](https://github.com/stemdeckapp/stemdeck)
- [audio-separator](https://pypi.org/project/audio-separator/0.44.3/)
- [BTC: reconocimiento de acordes](https://github.com/jayg996/BTC-ISMIR19)
- [signalsmith-stretch (Rust)](https://lib.rs/crates/signalsmith-stretch)
