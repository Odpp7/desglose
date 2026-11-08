import { useEffect, useRef, useState } from "react";
import { escucharEstado } from "../../lib/engine";

// La línea de tiempo: regla con los segundos, las ondas de todas las pistas en
// UN solo canvas, y el cursor de reproducción.
//
// Clic en la onda: salta a ese punto. En una pista propia, ARRASTRAR la mueve
// en el tiempo (su desfase) para alinearla con la canción.
//
// Para la PC de la iglesia (procesador débil):
//   - Las ondas se dibujan solo cuando cambia algo (llegan las ondas, se
//     silencia una pista, se arrastra, cambia el tamaño). No 30 veces por segundo.
//   - El cursor es un <div> que se mueve con `transform` desde el aviso del
//     motor, sin pasar por el estado de React.

export const ALTO_REGLA = 28;

export type FilaOnda = {
  clave: string;
  color: string;
  /** 100 valores por segundo, de 0 a 255. `undefined` mientras se calcula. */
  picos: Uint8Array | undefined;
  /** Silenciada (o tapada por un solo): se dibuja más tenue. */
  apagada: boolean;
  /** Segundos que la pista está corrida respecto de la canción. */
  desfase: number;
  /** Se puede arrastrar para alinearla (las pistas propias). */
  movible: boolean;
};

type Props = {
  filas: FilaOnda[];
  /** Alto de cada fila en píxeles: las pistas se estiran para llenar la pantalla. */
  altoFila: number;
  /** Segundos. */
  duracion: number;
  alSaltar: (segundos: number) => void;
  /** Se soltó una pista propia en otro lugar: su nuevo desfase en segundos. */
  alMover: (clave: string, desfase: number) => void;
};

/** Píxeles que hay que mover el mouse para que cuente como arrastre y no como clic. */
const UMBRAL_ARRASTRE = 4;

export function LineaTiempo({ filas, altoFila, duracion, alSaltar, alMover }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const sombra = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  // Mientras se arrastra una pista: cuál y adónde va (solo para dibujarla ahí).
  const [arrastre, setArrastre] = useState<{ clave: string; desfase: number } | null>(null);

  // El ancho cambia al agrandar la ventana: se mide con ResizeObserver.
  useEffect(() => {
    const elemento = caja.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada.contentRect.width)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const dibujadas = arrastre
      ? filas.map((f) => (f.clave === arrastre.clave ? { ...f, desfase: arrastre.desfase } : f))
      : filas;
    dibujarOndas(canvas.current, dibujadas, altoFila, ancho, duracion);
  }, [filas, altoFila, ancho, duracion, arrastre]);

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

  function alPresionar(evento: React.MouseEvent) {
    const rect = caja.current?.getBoundingClientRect();
    if (!rect || duracion <= 0 || ancho <= 0) return;
    const segundosPorPixel = duracion / ancho;
    const inicioX = evento.clientX;
    const y = evento.clientY - rect.top - ALTO_REGLA;
    const fila = y >= 0 ? filas[Math.floor(y / altoFila)] : undefined;

    const saltar = (x: number) => alSaltar(Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * duracion);

    // En la regla o en una pista normal: es un clic para saltar.
    if (!fila?.movible) {
      saltar(inicioX);
      return;
    }

    // En una pista propia: si se mueve, se arrastra; si no, se salta.
    let movido = false;
    let nuevo = fila.desfase;
    const alMoverMouse = (e: MouseEvent) => {
      const dx = e.clientX - inicioX;
      if (!movido && Math.abs(dx) < UMBRAL_ARRASTRE) return;
      movido = true;
      // Se redondea a milisegundos: es lo que se guarda.
      nuevo = Math.round((fila.desfase + dx * segundosPorPixel) * 1000) / 1000;
      setArrastre({ clave: fila.clave, desfase: nuevo });
    };
    const alSoltar = (e: MouseEvent) => {
      window.removeEventListener("mousemove", alMoverMouse);
      window.removeEventListener("mouseup", alSoltar);
      setArrastre(null);
      if (movido) alMover(fila.clave, nuevo);
      else saltar(e.clientX);
    };
    window.addEventListener("mousemove", alMoverMouse);
    window.addEventListener("mouseup", alSoltar);
  }

  return (
    <div ref={caja} onMouseDown={alPresionar} className="relative min-w-0 cursor-pointer select-none">
      <Regla duracion={duracion} ancho={ancho} />
      <canvas ref={canvas} className="block" style={{ height: filas.length * altoFila }} />
      <div ref={sombra} className="pointer-events-none absolute top-0 left-0 h-full bg-ink-0/35" style={{ width: 0 }} />
      <div ref={cursor} className="pointer-events-none absolute top-0 left-0 h-full w-0.5 bg-fg will-change-transform">
        <div className="absolute -top-px -left-[5px] border-x-[6px] border-t-[7px] border-x-transparent border-t-fg" />
      </div>
      {arrastre && (
        <div className="pointer-events-none absolute top-1 right-2 rounded-md bg-accent px-2 py-0.5 font-mono text-[12px] font-semibold text-accent-ink">
          {formatoDesfase(arrastre.desfase)}
        </div>
      )}
    </div>
  );
}

/** 1.25 → "+1.250 s" */
export function formatoDesfase(segundos: number) {
  return `${segundos >= 0 ? "+" : "−"}${Math.abs(segundos).toFixed(3)} s`;
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
 * Cada pista empieza donde dice su desfase.
 */
function dibujarOndas(
  lienzo: HTMLCanvasElement | null,
  filas: FilaOnda[],
  altoFila: number,
  ancho: number,
  duracion: number,
) {
  if (!lienzo || ancho <= 0) return;
  const escala = window.devicePixelRatio || 1;
  const alto = filas.length * altoFila;
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
  const pxPorSegundo = duracion > 0 ? ancho / duracion : 0;
  filas.forEach((fila, i) => {
    const arriba = i * altoFila;
    const centro = arriba + altoFila / 2;
    const maximo = altoFila / 2 - 10;
    g.fillStyle = fila.movible ? "#141a26" : "transparent";
    if (fila.movible) g.fillRect(0, arriba, ancho, altoFila);
    g.fillStyle = "#232a38";
    g.fillRect(0, arriba + altoFila - 1, ancho, 1);

    const picos = fila.picos;
    if (!picos || picos.length === 0) {
      g.fillStyle = "#6a7387";
      g.font = "12px 'Segoe UI', sans-serif";
      g.fillText("Calculando la onda…", 10, centro + 4);
      return;
    }

    g.fillStyle = fila.color;
    g.globalAlpha = fila.apagada ? 0.22 : 0.9;
    // Dónde empieza y cuánto mide la pista en píxeles (100 picos por segundo).
    const x0 = fila.desfase * pxPorSegundo;
    const largo = (picos.length / 100) * pxPorSegundo;
    const desde = Math.max(0, Math.floor(x0 / PASO) * PASO);
    const hasta = Math.min(ancho, x0 + largo);
    for (let x = desde; x < hasta; x += PASO) {
      const a = Math.max(0, Math.floor(((x - x0) / largo) * picos.length));
      const b = Math.max(a + 1, Math.floor(((x - x0 + PASO) / largo) * picos.length));
      let pico = 0;
      for (let k = a; k < b && k < picos.length; k++) if (picos[k] > pico) pico = picos[k];
      const h = pico === 0 ? 0.5 : Math.max(1, Math.sqrt(pico / 255) * maximo);
      g.fillRect(x, centro - h, 2, h * 2);
    }
    g.globalAlpha = 1;
  });
}
