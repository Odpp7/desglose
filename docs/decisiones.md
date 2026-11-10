# Decisiones

Todo lo de alcance está decidido; solo falta elegir las canciones de prueba.

| Tema | Decisión |
| --- | --- |
| Tipo de app | Escritorio para Windows, instalable en una PC modesta; Android después |
| Modelo de referencia | Moises (funciones) y StemDeck (arquitectura) |
| Equipo mínimo | Windows 10 de 64 bits, 8 GB de RAM, procesador de 2 núcleos (AMD A9-9425), SSD y video integrado |
| Distribución | Instalador normal para la PC de la iglesia |
| Actualizaciones | Automáticas, sin que el usuario haga nada, y nunca en medio de un ensayo |
| Función principal | La IA crea la secuencia completa y el equipo la edita |
| Entrega | Paquete para REAPER; el encargado sigue con su flujo hacia la consola |
| Interfaz | Tauri 2 + React + TypeScript |
| Audio | Motor en Rust que lee desde el disco |
| IA | Siempre en la nube: separar en MVSep; el resto en Modal con FastAPI, uv, SSE y contrato tipado |
| Usuarios y nube de datos | No por ahora; Supabase si un día hay usuarios |
| Voz guía | Voz es_MX-claude-high de Piper, con las frases ya generadas dentro de la app; grabación opcional; todo editable |
| Anticipación | 1 compás por defecto, 2 sugeridos en tempos rápidos, editable |
| Click | Lo define el encargado: BPM, compás e inicio. Cualquier compás, cambios de tempo, subdivisión |
| Cifrado | Americano: C, D, Em, G/B |
| Costo | Cero: todo gratuito o con créditos gratis |
| Nombre y diseño | Desglose, modo oscuro |

**Próximos pasos**

- [ ] Elegir 3 a 5 canciones de prueba: una de estudio, una en vivo, una con guitarra eléctrica protagonista y una en 6/8 o 3/4 si tocan alguna.
- [ ] Crear la cuenta gratis de Modal (ya hay un `.modal.toml` en la PC de desarrollo; falta confirmar que esté activa).
- [ ] Pedirle al encargado una secuencia de las que descarga hoy, para copiar su formato.
- [ ] Empezar la Fase 0 por el núcleo de audio.

## Historial

- 2026-10-30: se cambió Flutter + Rust por Tauri 2 + React + TypeScript. Motivo: reutilizar lo que ya se domina e interfaz reutilizable para Android.
- 2026-11-05: Moises y StemDeck como referencia. La app se instala en una PC modesta (4 GB, Windows 10), así que: IA siempre en la nube (sin motor local), audio en Rust leyendo del disco (Web Audio gastaba demasiada RAM), y backend reordenado al estilo StemDeck (uv, FastAPI, SSE, etapas independientes, contrato tipado).
- 2026-11-05: temas abiertos tras revisar el proyecto, sin decidir todavía: frecuencia de trabajo (el pipeline da 44.1 kHz, la exportación usa 48 kHz por defecto y Windows suele ir a 48 kHz), instalador de menos de 30 MB frente al peso de Piper y su voz (medir en el paso 4), y `Acordes.txt` en el paquete de la Fase 1 cuando los acordes (RF-12) son de la Fase 2.
- 2026-11-05: la app la instalan unas 10 personas como un programa normal, y no hay acceso a la PC modesta hasta que esté lista. Por eso la Fase 0 la simula: 2 núcleos de CPU desde 1c y máquina virtual limpia con 4 GB en 1h. Audio de prueba: pistas sintéticas con FFmpeg. Temas abiertos por esto: créditos de Modal compartidos y aviso de Windows por instalador sin firma.
- 2026-11-05: actualizaciones automáticas con el actualizador de Tauri; deben venir desde la primera versión que se reparta y se prueban en el sub-paso 1i. Los archivos de actualización deben estar en un lugar público (GitHub Releases).
- 2026-11-05: Modal da hoy solo 1 USD al mes sin método de pago; los otros 29 USD exigen agregar tarjeta. Sin decidir: seguir con 1 USD, agregar tarjeta con límite de gasto, o procesar en la PC de desarrollo (RTX 3050). Se decide con el costo real por canción. Mientras tanto, las pruebas de IA de la Fase 0 corren en local y Modal se usa solo para medir.
- 2026-11-05: se agrega `rtrb` al motor de audio: es la cola entre el hilo que lee del disco y la salida de audio, que no puede quedarse esperando. `rubato` entra desde 1b porque la tarjeta suele ir a 48 kHz y las pistas a 44.1 kHz.
- 2026-11-05: en el prototipo cada pista tiene su propio hilo de lectura (la especificación decía uno por canción), porque es lo más simple. Se revisa si la medición con 2 núcleos da problemas.
- 2026-11-05: cambiar el tono (RF-34) sube a prioridad alta y a la Fase 1, porque es importante para el equipo; se prueba junto con la velocidad en 1g, ya que usan la misma librería. El click no pasa por velocidad ni tono: se genera aparte. Sin decidir: si la exportación a REAPER puede salir en otro tono (la especificación dice que siempre sale original).
- 2026-11-05: las pruebas de IA corren en Modal y no en la PC de desarrollo, para no instalar librerías y modelos pesados. Reemplaza lo anotado antes sobre correrlas en local. Falta confirmar si el 1 USD se renueva cada mes.
- 2026-11-05: Modal no permite GPU sin método de pago ("Please add a payment method to use T4 GPU functions"). Sin tarjeta solo hay CPU. Tema abierto: agregar tarjeta con límite de gasto, usar CPU con un modelo más liviano, o procesar en la PC de desarrollo.
- 2026-11-07: terminó la Fase 0. Plan de la Fase 1 aprobado, en `docs/fase-1.md`: 10 pasos, backend mínimo (una función de Modal para secciones), ondas calculadas en la PC e interfaz liviana con canvas.
- 2026-11-07: voz guía elegida a oído: es_MX-claude-high. La app incluye las frases ya generadas (1,2 MB), no la voz completa (60 MB), para no romper el límite del instalador. Falta decidir cómo crear frases nuevas: grabarlas con micrófono o bajar la voz aparte.
- 2026-11-07: acordes y letra quedan fuera por ahora; Oscar decide después. La prioridad es la secuencia: separar, click, secciones, voz guía y exportar. Las secciones se numeran en orden, sin usar la letra.
- 2026-11-07: las secciones las propone SongFormer y el encargado las corrige en la app. Acierta en parte; se probó a oído en REAPER con dos canciones.
- 2026-11-07: el click ya no se detecta solo: el encargado elige BPM, compás y dónde cae el primer tiempo. Beat This! falló en tramos, y si una canción va a 70 o a 140 es una decisión musical. Se quita RF-47.
- 2026-11-07: separar pasa a la API gratuita de MVSep, con una cadena por niveles: BS Roformer SW; voz a Karaoke (opción 6); guitarra a Acoustic Guitar; eléctricas a Lead/Rhythm; otros a Synth. Son 5 trabajos: 10 pistas en 5,7 minutos, aprobado a oído con Yo soy la ofrenda. Reemplaza la regla de una sola guitarra. Salen en FLAC de 16 bits, unos 2,5 dB más bajas que la original; 24 bits y la opción 8 de Karaoke son de pago. Riesgos: dependemos de un servicio externo, la canción se sube a MVSep y sus límites gratis pueden cambiar. BS-RoFormer-SW en Modal queda de respaldo. Modal queda para tempo, secciones, acordes y letra.
- 2026-11-06: BS-RoFormer-SW es el modelo principal, en CPU de Modal: unos 12 centavos por canción (estimado desde fragmentos de 45 s). Probado a oído con dos canciones. MVSep Mega (53 pistas) gusta para coros y synth, pero cuesta unos 40 centavos y suena peor; queda como opción. Los pads quedan en la pista "otros".
- 2026-11-06: regla de guitarras: una sola pista por defecto. La acústica solo se agrega si suena con claridad. No hay método confiable para separar dos eléctricas: se probaron modelo, resta y posición estéreo. Hay Libertad tiene las guitarras al centro; en Yo soy la ofrenda los lados sonaban a la misma guitarra.
- 2026-11-06: la PC de referencia pasa a ser la real: HP Laptop 15-db0xxx, AMD A9-9425 (2 núcleos), 8 GB de RAM, SSD y Radeon R5 integrada. Reemplaza al supuesto de 4 GB. La IA sigue en la nube, porque el procesador no da para correrla. 
- 2026-11-06: solo importa la PC de la iglesia, ya no se diseña para otras PCs. La meta de memoria sube de 400 MB a 1 GB, porque esa PC tiene 8 GB. Sigue vigente leer las pistas desde el disco. El límite real de esa PC es el procesador.
- 2026-11-05: el instalador (1h) y la actualización automática (1i) se dejan para cuando la app real esté terminada, antes de repartirla. Salen de la Puerta 1. La actualización sigue siendo obligatoria en la primera versión que se reparta.
- 2026-11-07: velocidad y tono **también se exportan**, no son solo para estudiar. Motivo: el equipo a veces toca la canción en otro tono o más rápida. El click, las secciones, la voz guía y las regiones del `.RPP` se reajustan solos al nuevo tempo; el click y la voz nunca cambian de tono. Rango propuesto para exportar: 80% a 120% y −4 a +4 semitonos, con aviso fuera de él (para estudiar, 50% a 150%). El paquete lleva el cambio en el nombre, por ejemplo `Hay Libertad (E, 105%)`. Reemplaza "la exportación siempre sale original".
- 2026-11-07: la tonalidad la escribe el encargado; la IA no la detecta. Al transponer, la app muestra el tono nuevo ("D → E (+2)").
- 2026-11-07: se suman a la Fase 1: colecciones en la biblioteca, añadir un instrumento propio (un archivo) como pista, "tocar el tempo" para el click, voz guía editable (mover, cambiar, borrar, añadir) y voz guía propia (grabada o cargada).
- 2026-11-07: el proyecto se limpia a medida que se avanza: cada prototipo se borra cuando su código ya está en la app y probado. Queda en el historial de git.
- 2026-11-07: separar pasa a un **modo rápido por defecto** de 2 trabajos de MVSep (BS Roformer SW y Karaoke), con 7 pistas: voz líder, coros, batería, bajo, piano, guitarra y otros. Separar guitarras (acústica, lead, rítmica) y synth queda como botón opcional, que salta lo vacío. Motivo: en el plan gratis cada trabajo hace la fila completa y solo hay uno a la vez por cuenta; ese día había unos 400 trabajos en fila y la etapa 1 sola tardó 80 minutos, así que la cadena de 5 podía tardar horas. Reemplaza la cadena de 10 pistas por defecto del mismo día.
- 2026-11-07: la app guarda el código de cada trabajo de MVSep en el disco: si se cierra mientras espera, al reintentar se retoma el mismo trabajo sin perder el lugar en la fila. Antes de empezar muestra la fila y una espera estimada.
- 2026-11-07: la clave de MVSep se pega en Ajustes y se guarda en un archivo en la carpeta de la app; la interfaz no puede leerla.
- 2026-11-07: la separación queda **por partes**, y el encargado decide: "Crear secuencia" hace 1 solo trabajo de MVSep (6 pistas: voz, batería, bajo, piano, guitarra y otros), y hay botones aparte para voz líder y coros, guitarras y synth. Reemplaza el modo rápido de 2 trabajos del mismo día. Motivo: Oscar no quiere que la app haga trabajos en fila que quizá no se necesitan.
- 2026-11-07: si la cuenta ya tiene un trabajo en MVSep (por ejemplo, de antes de cerrar la app), la app lo adopta en vez de fallar, y comprueba que las pistas recibidas sean las esperadas. Al terminar, Rust guarda la lista de pistas en `pistas/lista.json`, y al abrir la app la base se pone al día con lo que hay en el disco: un resultado no se pierde aunque se pierda el aviso.
- 2026-11-07: la app es **una sola pantalla**, como la captura de referencia que mandó Oscar (estilo StemDeck): biblioteca siempre a la izquierda (carpetas con sus canciones), la canción abierta a la derecha (botones Separar, datos, pistas, transporte). Ya no hay pantallas aparte de biblioteca ni de editor. Motivo: el diseño anterior no le gustó y la navegación confundía (el editor aparecía vacío y la canción se perdía al salir). La biblioteca se pliega para pantallas chicas.
- 2026-11-07: las ondas se calculan en Rust una vez por pista (100 picos por segundo, 1 byte cada uno) y se guardan junto al audio (`.ondas`). Las separaciones se pueden cancelar: la app le avisa a MVSep y borra lo que quedó a medias.
- 2026-11-07: el motor acepta un desfase por pista (silencio delante si empieza más tarde), y la exportación usa el mismo: así una pista propia se alinea y lo que se escucha es lo que se exporta. La interfaz solo puede pedir archivos dentro de la carpeta de la canción.
- 2026-11-07: velocidad y cambio de tono al escuchar se adelantan del paso 9 al 4b, porque Oscar esperaba que "Tonalidad" cambiara el sonido. "Tonalidad" de la fila de datos es el nombre del tono (lo escribe el encargado); la del transporte transpone el audio y muestra "A → B (+2)". No se guardan: al abrir la canción vuelven a lo normal.

- 2026-11-08: secciones con **dos caminos**: "Proponer con IA" (SongFormer en Modal) o "Marcar a mano" (tecla S mientras suena, sin internet). Motivo: si Modal falla o se acaba el crédito, el encargado igual puede trabajar. La IA solo propone cuando la canción no tiene secciones, y nunca pisa lo marcado a mano.
- 2026-11-08: la función de Modal es una dirección web protegida con una clave propia (secreto `desglose-clave`), que se pega en Ajustes como la de MVSep. Sin ella nadie puede gastar el crédito. Una canción a la vez y corte a los 10 minutos.
- 2026-11-08: el respaldo para separar en Modal (BS-RoFormer-SW) no se conecta a la app por ahora: MVSep funciona y el respaldo gastaría el poco crédito. Queda en el historial de git.

- 2026-11-09: la voz guía se calcula en TypeScript (`src/lib/guia.ts`): dónde dice qué frase. Rust solo hace sonar esa lista, y la misma lista se exportará en el paso 8 (lo que se escucha = lo que se exporta). Reemplaza la idea de `guide.rs` con la lógica en Rust. Frases que faltan: "Coro 4" dice "Coro"; Break y Sección solo cuentan. La voz propia (grabar o cargar) queda para el 7b.

- 2026-11-09: exportar = lo que se escucha. Van las pistas con R (no las vacías; M y S son solo para escuchar), con su volumen; CLICK y GUIA solo si están encendidos; la velocidad y el tono del transporte (el click y la guía no cambian de tono). Fuera de 80–120% o ±4 semitonos se avisa pero se permite. 44,1 kHz por ahora. `Split.wav` y `.zip` quedan para después.

Si una decisión cambia, se agrega aquí con la fecha y el motivo.
