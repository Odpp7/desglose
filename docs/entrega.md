# Entrega: instalar Desglose en la PC de la iglesia

Lista para el día de la instalación (paso 10 de la Fase 1). La PC de la iglesia
no necesita nada más: ni Python, ni Node, ni FFmpeg.

## Antes de ir (en la PC de desarrollo)

1. Tener el instalador: `app/src-tauri/target/release/bundle/nsis/Desglose_<versión>_x64-setup.exe`
   (o, cuando exista la actualización automática, el de la página *Releases* de GitHub).
2. Tener a mano la **clave de MVSep** (está en tu cuenta de mvsep.com → API token).
3. Llevar la **clave de Modal**: en la PC de desarrollo corre
   `powershell -ExecutionPolicy Bypass -File backend\scripts\copiar-clave.ps1`
   y pégala en un lugar seguro para llevarla (por ejemplo, una nota en tu teléfono).
   No la subas a ningún lado ni la mandes por chat.
4. Llevar una canción de prueba (MP3) en una memoria USB.

## En la PC de la iglesia

1. **Instalar.** Doble clic en el instalador. Windows va a mostrar *"Windows protegió
   su PC"* porque el instalador no tiene firma de Microsoft (cuesta dinero cada año):
   **Más información → Ejecutar de todas formas**. Solo pasa esta vez.
   Si la PC no tiene WebView2 (el motor que dibuja la app), el instalador lo baja
   solo: necesita internet en ese momento.
2. **Abrir Desglose** desde el menú Inicio.
3. **Ajustes:** pegar la clave de MVSep y la clave de Modal. Las dos deben decir *Guardada*.
4. **Probar una secuencia completa** con la canción de la USB:
   - Agregar canción → Crear secuencia (MVSep; puede tardar según la fila).
   - Definir el BPM (Tocar el tempo), el compás y el primer tiempo.
   - Secciones: Proponer con IA (unos 3 minutos) o marcarlas a mano.
   - Escuchar con click y voz guía.
   - Exportar a REAPER y abrir el `.RPP` en el REAPER del encargado.
5. **Medir** con la canción abierta (8 pistas): en el Administrador de tareas,
   Desglose debe usar **menos de 1 GB de memoria** y sonar sin cortes.
6. Pasa la prueba cuando el encargado diga *"esto es como lo que uso"*.

## Qué anotar

- Cuánto tardó cada parte (MVSep, IA de secciones, exportar).
- Si hubo cortes de audio o la interfaz se sintió lenta.
- Qué cambiaría el encargado en el paquete (nombres, orden de las pistas, 44,1 o 48 kHz).
