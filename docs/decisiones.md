# Decisiones

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
- [ ] Crear la cuenta gratis de Modal (ya hay un `.modal.toml` en la PC de desarrollo; falta confirmar que esté activa).
- [ ] Pedirle al encargado una secuencia de las que descarga hoy, para copiar su formato.
- [ ] Empezar la Fase 0 por el núcleo de audio.

## Historial

- 2026-10-30: se cambió Flutter + Rust por Tauri 2 + React + TypeScript. Motivo: reutilizar lo que ya se domina e interfaz reutilizable para Android.
- 2026-11-05: Moises y StemDeck como referencia. La app se instala en una PC modesta (4 GB, Windows 10), así que: IA siempre en la nube (sin motor local), audio en Rust leyendo del disco (Web Audio gastaba demasiada RAM), y backend reordenado al estilo StemDeck (uv, FastAPI, SSE, etapas independientes, contrato tipado).
- 2026-11-05: temas abiertos tras revisar el proyecto, sin decidir todavía: frecuencia de trabajo (el pipeline da 44.1 kHz, la exportación usa 48 kHz por defecto y Windows suele ir a 48 kHz), instalador de menos de 30 MB frente al peso de Piper y su voz (medir en el paso 4), y `Acordes.txt` en el paquete de la Fase 1 cuando los acordes (RF-12) son de la Fase 2.

Si una decisión cambia, se agrega aquí con la fecha y el motivo.
