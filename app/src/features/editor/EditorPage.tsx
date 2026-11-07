import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Encabezado } from "../../components/Encabezado";
import { carpetaPistas } from "../../lib/archivos";
import { IconoInicio, IconoPausa, IconoPlay } from "../../components/icons";
import { escucharEstado, formatoTiempo, motor, type EstadoMotor } from "../../lib/engine";

// Editor, versión del paso 1: una prueba del motor dentro de la app real.
// Se carga una carpeta con pistas y se reproduce, pausa y salta.
// En el paso 4 esto se reemplaza por la línea de tiempo con ondas.
//
// Importante para la PC de la iglesia: la posición llega 30 veces por segundo
// y NO pasa por el estado de React (eso gastaba mucho procesador en la Fase 0).
// Se escribe directo en el canvas y en el texto, usando refs.

type Pista = { nombre: string; volumen: number; mute: boolean; solo: boolean };

export function EditorPage() {
  const [carpeta, setCarpeta] = useState("");
  const [pistas, setPistas] = useState<Pista[]>([]);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiempoRef = useRef<HTMLSpanElement>(null);
  const cortesRef = useRef<HTMLSpanElement>(null);
  const ultimo = useRef<EstadoMotor | null>(null);

  useEffect(() => {
    const dejar = escucharEstado((estado) => {
      ultimo.current = estado;
      dibujar(canvasRef.current, estado);
      if (tiempoRef.current) tiempoRef.current.textContent = formatoTiempo(estado.posicion);
      if (cortesRef.current) cortesRef.current.textContent = String(estado.cortes);
      // Esto sí va al estado de React, pero solo cambia al tocar play o pausa.
      setReproduciendo((antes) => (antes === estado.reproduciendo ? antes : estado.reproduciendo));
    });
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  async function ejecutar(accion: () => Promise<unknown>) {
    setError("");
    try {
      await accion();
    } catch (e) {
      setError(String(e));
    }
  }

  // Si viene de una canción (`#/editor?cancion=7`), carga sus pistas separadas.
  const cancionId = useSearchParams()[0].get("cancion");
  useEffect(() => {
    if (!cancionId) return;
    carpetaPistas(Number(cancionId)).then((ruta) => {
      setCarpeta(ruta);
      cargar(ruta);
    });
  }, [cancionId]);

  async function cargar(ruta = carpeta) {
    setError("");
    try {
      // Quita las comillas que agrega "Copiar como ruta de acceso" en Windows.
      const limpia = ruta.trim().replace(/^"|"$/g, "");
      const nombres = await motor.cargarCarpeta(limpia);
      setPistas(nombres.map((n) => ({ nombre: sinExtension(n), volumen: 1, mute: false, solo: false })));
      // El click llega en el paso 5: por ahora queda callado.
      await motor.mute(nombres.length, true);
    } catch (e) {
      setPistas([]);
      setError(String(e));
    }
  }

  function cambiar(indice: number, cambio: Partial<Pista>) {
    setPistas((actuales) => actuales.map((p, i) => (i === indice ? { ...p, ...cambio } : p)));
  }

  function saltar(evento: React.MouseEvent<HTMLCanvasElement>) {
    const estado = ultimo.current;
    if (!estado || estado.duracion === 0) return;
    const caja = evento.currentTarget.getBoundingClientRect();
    const fraccion = (evento.clientX - caja.left) / caja.width;
    ejecutar(() => motor.buscar(fraccion * estado.duracion));
  }

  const cargadas = pistas.length > 0;

  return (
    <div className="flex h-full flex-col">
      <Encabezado titulo="Editor" ayuda="Prueba del motor: carga una carpeta con las pistas de una canción." />

      <div className="flex gap-2 border-b border-line px-6 py-3">
        <input
          id="carpeta"
          value={carpeta}
          onChange={(e) => setCarpeta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="C:\...\samples\cancion2\mvsep\final"
          aria-label="Carpeta con las pistas"
          className="min-w-0 flex-1 rounded-lg border border-line bg-ink-2 px-3 py-2 font-mono text-[12px] placeholder:text-fg-3"
        />
        <button
          onClick={() => cargar()}
          className="rounded-lg border border-line-2 bg-ink-3 px-4 font-semibold hover:text-fg"
        >
          Cargar
        </button>
      </div>

      {error && <p className="mx-6 mt-3 rounded-lg bg-[#3a1d24] px-3 py-2 text-[#ffb3bd]">{error}</p>}

      <ul className="m-0 flex-1 list-none overflow-auto p-0">
        {pistas.map((pista, i) => (
          <li
            key={pista.nombre}
            className="grid grid-cols-[220px_1fr_auto] items-center gap-4 border-b border-line px-6 py-2.5"
          >
            <span className={`truncate font-semibold ${pista.mute ? "text-fg-3" : ""}`}>{pista.nombre}</span>
            <input
              id={`volumen-${i}`}
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={pista.volumen}
              aria-label={`Volumen de ${pista.nombre}`}
              className="max-w-xs accent-accent"
              onChange={(e) => {
                const valor = Number(e.target.value);
                cambiar(i, { volumen: valor });
                ejecutar(() => motor.volumen(i, valor));
              }}
            />
            <div className="flex gap-1">
              <Interruptor
                texto="M"
                etiqueta={`Silenciar ${pista.nombre}`}
                activo={pista.mute}
                colorActivo="bg-[#5a2b33] border-[#7b3a45] text-[#ffb3bd]"
                alCambiar={(v) => {
                  cambiar(i, { mute: v });
                  ejecutar(() => motor.mute(i, v));
                }}
              />
              <Interruptor
                texto="S"
                etiqueta={`Solo ${pista.nombre}`}
                activo={pista.solo}
                colorActivo="bg-[#5a4a1f] border-[#7a6528] text-[#ffe08a]"
                alCambiar={(v) => {
                  cambiar(i, { solo: v });
                  ejecutar(() => motor.solo(i, v));
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <footer className="flex items-center gap-5 border-t border-line bg-ink-0 px-6 py-3">
        <button
          aria-label="Ir al inicio"
          disabled={!cargadas}
          onClick={() => ejecutar(() => motor.buscar(0))}
          className="grid size-[34px] place-items-center rounded-[9px] border border-line bg-ink-2 text-fg-2 hover:text-fg disabled:opacity-40"
        >
          <IconoInicio />
        </button>
        <button
          aria-label={reproduciendo ? "Pausar" : "Reproducir"}
          disabled={!cargadas}
          onClick={() => ejecutar(reproduciendo ? motor.pausa : motor.play)}
          className="grid size-[46px] place-items-center rounded-full bg-fg text-ink-0 disabled:opacity-40"
        >
          {reproduciendo ? <IconoPausa /> : <IconoPlay />}
        </button>
        <div className="flex flex-col">
          <span ref={tiempoRef} className="font-mono text-2xl tabular-nums">
            0:00.0
          </span>
          <span className="text-[11.5px] text-fg-3">
            Cortes: <span ref={cortesRef} className="font-mono">0</span>
          </span>
        </div>
        <canvas
          ref={canvasRef}
          onClick={saltar}
          aria-label="Posición en la canción. Haz clic para saltar."
          className="h-9 min-w-0 flex-1 cursor-pointer"
        />
      </footer>
    </div>
  );
}

function Interruptor(props: {
  texto: string;
  etiqueta: string;
  activo: boolean;
  colorActivo: string;
  alCambiar: (valor: boolean) => void;
}) {
  return (
    <button
      aria-label={props.etiqueta}
      aria-pressed={props.activo}
      onClick={() => props.alCambiar(!props.activo)}
      className={`h-[22px] w-[26px] rounded-[5px] border text-[10.5px] font-semibold ${
        props.activo ? props.colorActivo : "border-line bg-ink-2 text-fg-3 hover:text-fg"
      }`}
    >
      {props.texto}
    </button>
  );
}

function sinExtension(nombre: string) {
  return nombre.replace(/\.(flac|wav)$/i, "");
}

// Barra de posición: fondo, parte ya sonada y cursor.
function dibujar(canvas: HTMLCanvasElement | null, estado: EstadoMotor) {
  if (!canvas) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = canvas.clientWidth;
  const alto = canvas.clientHeight;
  if (canvas.width !== ancho * escala || canvas.height !== alto * escala) {
    canvas.width = ancho * escala;
    canvas.height = alto * escala;
  }
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(escala, 0, 0, escala, 0, 0);
  g.clearRect(0, 0, ancho, alto);

  const y = alto / 2 - 3;
  g.fillStyle = "#1e2431";
  g.fillRect(0, y, ancho, 6);
  if (estado.duracion <= 0) return;

  const x = (estado.posicion / estado.duracion) * ancho;
  g.fillStyle = "#8ea2ff";
  g.fillRect(0, y, x, 6);
  g.fillStyle = "#e9ecf3";
  g.fillRect(Math.round(x) - 1, 4, 2, alto - 8);
}
