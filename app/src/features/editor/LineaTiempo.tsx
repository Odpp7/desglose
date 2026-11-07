import { useEffect, useRef, useState } from "react";
import { escucharEstado } from "../../lib/engine";

// La línea de tiempo: regla con los segundos, las ondas de todas las pistas en
// UN solo canvas, y el cursor de reproducción.
//
// Para la PC de la iglesia (procesador débil):
//   - Las ondas se dibujan solo cuando cambia algo (llegan las ondas, se
//     silencia una pista, cambia el tamaño). No 30 veces por segundo.
//   - El cursor es un <div> que se mueve con `transform` desde el aviso del
//     motor, sin pasar por el estado de React.

export const ALTO_REGLA = 28;

export type FilaOnda = {
  instrumento: string;
  color: string;
  /** 100 valores por segundo, de 0 a 255. `undefined` mientras se calcula. */
  picos: Uint8Array | undefined;
  /** Silenciada (o tapada por un solo): se dibuja más tenue. */
  apagada: boolean;
};

type Props = {
  filas: FilaOnda[];
  /** Alto de cada fila en píxeles: las pistas se estiran para llenar la pantalla. */
  altoFila: number;
  /** Segundos. */
  duracion: number;
  alSaltar: (segundos: number) => void;
};

export function LineaTiempo({ filas, altoFila, duracion, alSaltar }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const sombra = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  // El ancho cambia al agrandar la ventana: se mide con ResizeObserver.
  useEffect(() => {
    const elemento = caja.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada.contentRect.width)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    dibujarOndas(canvas.current, filas, altoFila, ancho, duracion);
  }, [filas, altoFila, ancho, duracion]);

  // Cursor y parte ya sonada: directo al DOM desde el aviso del motor.
  const anchoActual = useRef(0);
  anchoActual.current = ancho;
  useEffect(() => {
    const dejar = escucharEstado((estado) => {
      if (duracion <= 0) return;
      const x = Math.min(1, estado.posicion / duracion) * anchoActual.current;
      if (cursor.current) cursor.current.style.transform = `translateX(${x}px)`;
      if (sombra.current) sombra.current.style.width = `${x}px`;
    });
    return () => {
      dejar.then((f) => f());
    };
  }, [duracion]);

  function saltar(evento: React.MouseEvent) {
    const rect = caja.current?.getBoundingClientRect();
    if (!rect || duracion <= 0) return;
    const fraccion = Math.max(0, Math.min(1, (evento.clientX - rect.left) / rect.width));
    alSaltar(fraccion * duracion);
  }

  return (
    <div ref={caja} onMouseDown={saltar} className="relative min-w-0 cursor-pointer select-none">
      <Regla duracion={duracion} ancho={ancho} />
      <canvas ref={canvas} className="block" style={{ height: filas.length * altoFila }} />
      <div ref={sombra} className="pointer-events-none absolute top-0 left-0 h-full bg-ink-0/35" style={{ width: 0 }} />
      <div ref={cursor} className="pointer-events-none absolute top-0 left-0 h-full w-0.5 bg-fg will-change-transform">
        <div className="absolute -top-px -left-[5px] border-x-[6px] border-t-[7px] border-x-transparent border-t-fg" />
      </div>
    </div>
  );
}

/** Marcas de tiempo, cada 5, 10, 15, 30 o 60 s según cuánto espacio haya. */
function Regla({ duracion, ancho }: { duracion: number; ancho: number }) {
  if (duracion <= 0 || ancho <= 0) return <div style={{ height: ALTO_REGLA }} className="border-b border-line" />;
  const paso = [5, 10, 15, 30, 60].find((s) => (s / duracion) * ancho >= 70) ?? 120;
  const marcas = [];
  for (let s = 0; s < duracion; s += paso) marcas.push(s);

  return (
    <div style={{ height: ALTO_REGLA }} className="relative border-b border-line bg-ink-0">
      {marcas.map((s) => (
        <span
          key={s}
          className="absolute top-0 bottom-0 border-l border-line-2 pt-1.5 pl-1.5 font-mono text-[10.5px] text-fg-3"
          style={{ left: (s / duracion) * ancho }}
        >
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

/**
 * Dibuja todas las filas. Cada barra (2 px de ancho, cada 3 px) muestra el pico
 * más alto de su tramo. La raíz cuadrada hace visibles las partes suaves.
 */
function dibujarOndas(
  lienzo: HTMLCanvasElement | null,
  filas: FilaOnda[],
  ALTO_FILA: number,
  ancho: number,
  duracion: number,
) {
  if (!lienzo || ancho <= 0) return;
  const escala = window.devicePixelRatio || 1;
  const alto = filas.length * ALTO_FILA;
  lienzo.width = ancho * escala;
  lienzo.height = alto * escala;
  lienzo.style.width = `${ancho}px`;
  const g = lienzo.getContext("2d");
  if (!g) return;
  g.setTransform(escala, 0, 0, escala, 0, 0);
  g.clearRect(0, 0, ancho, alto);

  // Líneas suaves cada 30 segundos, como guía.
  g.fillStyle = "#232a38";
  if (duracion > 0) {
    for (let s = 30; s < duracion; s += 30) g.fillRect(Math.round((s / duracion) * ancho), 0, 1, alto);
  }

  const PASO = 3;
  filas.forEach((fila, i) => {
    const centro = i * ALTO_FILA + ALTO_FILA / 2;
    const maximo = ALTO_FILA / 2 - 10;
    g.fillStyle = "#232a38";
    g.fillRect(0, (i + 1) * ALTO_FILA - 1, ancho, 1);

    const picos = fila.picos;
    if (!picos || picos.length === 0) {
      g.globalAlpha = 1;
      g.fillStyle = "#6a7387";
      g.font = "12px 'Segoe UI', sans-serif";
      g.fillText("Calculando la onda…", 10, centro + 4);
      return;
    }

    g.fillStyle = fila.color;
    g.globalAlpha = fila.apagada ? 0.22 : 0.9;
    // Los picos cubren la duración de la pista; se reparten en el ancho total de la canción.
    const total = duracion > 0 ? (picos.length / 100 / duracion) * ancho : ancho;
    for (let x = 0; x < Math.min(ancho, total); x += PASO) {
      const desde = Math.floor((x / total) * picos.length);
      const hasta = Math.max(desde + 1, Math.floor(((x + PASO) / total) * picos.length));
      let pico = 0;
      for (let k = desde; k < hasta && k < picos.length; k++) if (picos[k] > pico) pico = picos[k];
      const h = pico === 0 ? 0.5 : Math.max(1, Math.sqrt(pico / 255) * maximo);
      g.fillRect(x, centro - h, 2, h * 2);
    }
    g.globalAlpha = 1;
  });
}
