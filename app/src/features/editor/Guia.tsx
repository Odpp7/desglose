import { useEffect, useRef, useState } from "react";
import { segundosPorCompas, type Click } from "../../lib/click";
import type { AvisoLibre } from "../../lib/db";
import { alTiempo, type Marca } from "../../lib/guia";
import { colorDe, type Seccion } from "../../lib/secciones";
import { ALTO_GUIA } from "./LineaTiempo";

// La franja GUÍA, debajo de la de secciones: lo que dice la voz guía.
//
//   │ Intro · 2 3 4 │          │ Verso 1 · 2 3 4 │      │ Bajamos │ ...
//
// - Los avisos de sección salen solos de las secciones (`src/lib/guia.ts`). Clic:
//   cambiar la frase, los compases de anticipación o quitarle el aviso. Arrastrar:
//   cambia los compases de anticipación (se pega al compás).
// - Los avisos libres ("Bajamos", "Última vez") los agrega el encargado. Clic:
//   cambiar la frase o borrarlo. Arrastrar: lo mueve (se pega al tiempo).
// - Sin BPM no hay guía: no sabría dónde contar.

type Props = {
  marcas: Marca[];
  secciones: Seccion[] | undefined;
  click: Click;
  duracion: number;
  ancho: number;
  /** Nombres de las frases grabadas, para elegir. */
  frases: string[];
  alCambiarSeccion: (indice: number, cambio: Partial<Seccion>) => void;
  alCambiarLibre: (aviso: AvisoLibre) => void;
  alBorrarLibre: (id: number) => void;
  alSaltar: (segundos: number) => void;
};

type Arrastre = { clave: string; inicio: number };

export function FranjaGuia(props: Props) {
  const { marcas, click, duracion, ancho } = props;
  const [menu, setMenu] = useState<{ clave: string; top: number; left: number } | null>(null);
  // Mientras se arrastra: dónde queda el inicio de esa marca (solo para dibujarla).
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);

  const base = "relative border-b border-line bg-ink-0";
  if (duracion <= 0 || ancho <= 0) return <div style={{ height: ALTO_GUIA }} className={base} />;
  if (!click.bpm) {
    return (
      <div
        style={{ height: ALTO_GUIA }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${base} flex cursor-default items-center px-3 text-[11.5px] text-fg-3`}
      >
        Define el BPM (arriba, en la fila de datos) para que la voz guía sepa dónde contar.
      </div>
    );
  }

  const x = (s: number) => (s / duracion) * ancho;
  const compas = segundosPorCompas(click);

  function arrastrar(evento: React.MouseEvent, marca: Marca, clave: string) {
    evento.stopPropagation();
    evento.preventDefault();
    const segundosPorPixel = duracion / ancho;
    const inicioX = evento.clientX;
    const original = marca.clase === "seccion" ? marca.inicio : marca.aviso.segundo;
    let movido = false;
    let destino = original;

    const alMoverMouse = (e: MouseEvent) => {
      const dx = e.clientX - inicioX;
      if (!movido && Math.abs(dx) < 4) return;
      movido = true;
      const libre = original + dx * segundosPorPixel;
      if (marca.clase === "seccion") {
        // Intro solo se puede adelantar hasta donde haya espacio para un compás completo.
        const maximo = marca.indice === 0
          ? Math.max(1, Math.min(4, Math.floor((marca.fin + 1e-9) / compas)))
          : 4;
        const compases = Math.min(maximo, Math.max(1, Math.round((marca.fin - libre) / compas)));
        destino = marca.fin - compases * compas;
      } else {
        destino = Math.min(duracion, alTiempo(libre, click));
      }
      setArrastre({ clave, inicio: destino });
    };
    const alSoltar = (e: MouseEvent) => {
      window.removeEventListener("mousemove", alMoverMouse);
      window.removeEventListener("mouseup", alSoltar);
      setArrastre(null);
      if (!movido) {
        setMenu({ clave, top: e.clientY + 8, left: Math.min(e.clientX, window.innerWidth - 300) });
        return;
      }
      if (marca.clase === "seccion") {
        props.alCambiarSeccion(marca.indice, { anticipacion: Math.round((marca.fin - destino) / compas) });
      } else if (destino !== original) {
        props.alCambiarLibre({ ...marca.aviso, segundo: Math.round(destino * 1000) / 1000 });
      }
    };
    window.addEventListener("mousemove", alMoverMouse);
    window.addEventListener("mouseup", alSoltar);
  }

  const claveDe = (m: Marca) => (m.clase === "seccion" ? `s${m.indice}` : `l${m.aviso.id}`);
  const marcaDelMenu = menu ? marcas.find((m) => claveDe(m) === menu.clave) : undefined;

  return (
    <div style={{ height: ALTO_GUIA }} onMouseDown={(e) => e.stopPropagation()} className={base}>
      {marcas.map((m) => {
        const clave = claveDe(m);
        const movida = arrastre?.clave === clave ? arrastre.inicio : null;
        if (m.clase === "seccion") {
          const inicio = Math.max(0, movida ?? m.inicio);
          const color = colorDe(props.secciones?.[m.indice]?.tipo ?? "");
          return (
            <div
              key={clave}
              onMouseDown={(e) => arrastrar(e, m, clave)}
              title={m.apagada ? "Sin aviso. Clic para volver a ponerlo." : `${m.texto} · arrastra para avisar antes o después`}
              style={{
                left: x(inicio),
                width: Math.max(14, x(m.fin) - x(inicio)),
                borderColor: color,
                background: m.apagada ? "transparent" : color + "22",
              }}
              className={`absolute top-1 bottom-1 cursor-pointer overflow-hidden rounded-r-sm border-l-2 px-1 text-[10.5px] leading-[16px] whitespace-nowrap hover:brightness-125 ${
                m.apagada ? "border-dashed opacity-40" : ""
              } ${menu?.clave === clave ? "brightness-150" : ""}`}
            >
              <span style={{ color }}>{m.apagada ? "sin aviso" : m.texto}</span>
            </div>
          );
        }
        const segundo = movida ?? m.aviso.segundo;
        return (
          <div
            key={clave}
            onMouseDown={(e) => arrastrar(e, m, clave)}
            title={`${m.aviso.frase} · arrastra para moverlo`}
            style={{ left: x(segundo) }}
            className={`absolute top-1 bottom-1 cursor-pointer rounded-sm border border-line-2 bg-ink-3 px-1.5 text-[10.5px] leading-[14px] whitespace-nowrap text-fg hover:border-accent ${
              menu?.clave === clave ? "border-accent" : ""
            }`}
          >
            {m.aviso.frase}
          </div>
        );
      })}

      {menu && marcaDelMenu && (
        <MenuAviso
          posicion={{ top: menu.top, left: menu.left }}
          marca={marcaDelMenu}
          seccion={marcaDelMenu.clase === "seccion" ? props.secciones?.[marcaDelMenu.indice] : undefined}
          frases={props.frases}
          alCerrar={() => setMenu(null)}
          alSaltar={props.alSaltar}
          alCambiarSeccion={props.alCambiarSeccion}
          alCambiarLibre={props.alCambiarLibre}
          alBorrarLibre={props.alBorrarLibre}
        />
      )}
    </div>
  );
}

function MenuAviso(props: {
  posicion: { top: number; left: number };
  marca: Marca;
  seccion: Seccion | undefined;
  frases: string[];
  alCerrar: () => void;
  alSaltar: (segundos: number) => void;
  alCambiarSeccion: (indice: number, cambio: Partial<Seccion>) => void;
  alCambiarLibre: (aviso: AvisoLibre) => void;
  alBorrarLibre: (id: number) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const { alCerrar, marca } = props;

  useEffect(() => {
    const alClicAfuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) alCerrar();
    };
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("mousedown", alClicAfuera);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClicAfuera);
      document.removeEventListener("keydown", alTecla);
    };
  }, [alCerrar]);

  const escuchar = () => {
    // Un compás antes del aviso, para oírlo entrar.
    props.alSaltar(Math.max(0, (marca.clase === "seccion" ? marca.inicio : marca.aviso.segundo) - 2));
    alCerrar();
  };

  return (
    <div
      ref={caja}
      style={props.posicion}
      className="fixed z-50 w-[290px] cursor-default space-y-3 rounded-xl border border-line-2 bg-ink-2 p-3 text-[12.5px] shadow-xl shadow-black/40"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-[14px] font-semibold">
          {marca.clase === "seccion" ? marca.texto : marca.aviso.frase}
        </span>
        <button onClick={escuchar} className="ml-auto text-accent hover:underline">
          Escuchar
        </button>
      </div>

      {marca.clase === "seccion" && props.seccion && (
        <>
          <Fila titulo="Dice">
            <select
              value={props.seccion.aviso ?? ""}
              onChange={(e) => props.alCambiarSeccion(marca.indice, { aviso: e.target.value || null })}
              className="min-w-0 flex-1 rounded-md border border-line bg-ink-1 px-2 py-1 text-fg"
            >
              <option value="">El nombre de la sección</option>
              {props.frases.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Fila>
          <Fila titulo="Avisa">
            {[1, 2].map((n) => (
              <Opcion
                key={n}
                elegida={marca.compases === n}
                onClick={() => props.alCambiarSeccion(marca.indice, { anticipacion: n })}
              >
                {n} {n === 1 ? "compás" : "compases"} antes
              </Opcion>
            ))}
          </Fila>
          <button
            onClick={() => props.alCambiarSeccion(marca.indice, { sin_aviso: marca.apagada ? 0 : 1 })}
            className="rounded-md px-2 py-1 text-fg-2 hover:bg-ink-3 hover:text-fg"
          >
            {marca.apagada ? "Volver a poner el aviso" : "Quitar el aviso de esta sección"}
          </button>
        </>
      )}

      {marca.clase === "libre" && (
        <>
          <Fila titulo="Dice">
            <select
              value={marca.aviso.frase}
              onChange={(e) => props.alCambiarLibre({ ...marca.aviso, frase: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-line bg-ink-1 px-2 py-1 text-fg"
            >
              {props.frases.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Fila>
          <button
            onClick={() => {
              props.alBorrarLibre(marca.aviso.id);
              alCerrar();
            }}
            className="rounded-md px-2 py-1 text-[#ff9aa8] hover:bg-[#3a1d24]"
          >
            Borrar este aviso
          </button>
        </>
      )}
    </div>
  );
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 flex-none text-[10px] font-semibold tracking-wider text-fg-3 uppercase">{titulo}</span>
      {children}
    </div>
  );
}

function Opcion(props: { elegida: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-md border px-2 py-1 text-[12px] ${
        props.elegida
          ? "border-accent bg-[#22305e] text-accent"
          : "border-line bg-ink-1 text-fg-2 hover:border-line-2 hover:text-fg"
      }`}
    >
      {props.children}
    </button>
  );
}
