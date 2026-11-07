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
| Voz guía | Piper (sintetizada, sin internet) más grabación opcional; todo editable |
| Anticipación | 1 compás por defecto, 2 sugeridos en tempos rápidos, editable |
| Click | Cualquier compás, cambios de tempo, subdivisión, todo editable |
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
- 2026-11-07: separar pasa a la API gratuita de MVSep, con una cadena por niveles: BS Roformer SW; voz a Karaoke (opción 6); guitarra a Acoustic Guitar; eléctricas a Lead/Rhythm; otros a Synth. Son 5 trabajos: 10 pistas en 5,7 minutos, aprobado a oído con Yo soy la ofrenda. Reemplaza la regla de una sola guitarra. Salen en FLAC de 16 bits, unos 2,5 dB más bajas que la original; 24 bits y la opción 8 de Karaoke son de pago. Riesgos: dependemos de un servicio externo, la canción se sube a MVSep y sus límites gratis pueden cambiar. BS-RoFormer-SW en Modal queda de respaldo. Modal queda para tempo, secciones, acordes y letra.
- 2026-11-06: BS-RoFormer-SW es el modelo principal, en CPU de Modal: unos 12 centavos por canción (estimado desde fragmentos de 45 s). Probado a oído con dos canciones. MVSep Mega (53 pistas) gusta para coros y synth, pero cuesta unos 40 centavos y suena peor; queda como opción. Los pads quedan en la pista "otros".
- 2026-11-06: regla de guitarras: una sola pista por defecto. La acústica solo se agrega si suena con claridad. No hay método confiable para separar dos eléctricas: se probaron modelo, resta y posición estéreo. Hay Libertad tiene las guitarras al centro; en Yo soy la ofrenda los lados sonaban a la misma guitarra.
- 2026-11-06: la PC de referencia pasa a ser la real: HP Laptop 15-db0xxx, AMD A9-9425 (2 núcleos), 8 GB de RAM, SSD y Radeon R5 integrada. Reemplaza al supuesto de 4 GB. La IA sigue en la nube, porque el procesador no da para correrla. 
- 2026-11-06: solo importa la PC de la iglesia, ya no se diseña para otras PCs. La meta de memoria sube de 400 MB a 1 GB, porque esa PC tiene 8 GB. Sigue vigente leer las pistas desde el disco. El límite real de esa PC es el procesador.
- 2026-11-05: el instalador (1h) y la actualización automática (1i) se dejan para cuando la app real esté terminada, antes de repartirla. Salen de la Puerta 1. La actualización sigue siendo obligatoria en la primera versión que se reparta.

Si una decisión cambia, se agrega aquí con la fecha y el motivo.
