import { useState } from "react";
import { CampoTexto } from "../../components/CampoTexto";
import { IconoCarpeta, IconoMas } from "../../components/icons";
import { Menu, OpcionMenu } from "../../components/Menu";
import type { Coleccion } from "../../lib/db";

// Barra izquierda de la biblioteca: "Todas", "Sin ordenar" y las colecciones.
// Elegir una filtra la lista de canciones.

/** Qué se está mostrando: todo, lo que no tiene colección o una colección (su id). */
export type Filtro = "todas" | "sin-ordenar" | number;

type Props = {
  colecciones: Coleccion[];
  /** Cuántas canciones hay en cada filtro. */
  totales: Map<Filtro, number>;
  filtro: Filtro;
  alFiltrar: (f: Filtro) => void;
  alCrear: (nombre: string) => void;
  alRenombrar: (id: number, nombre: string) => void;
  alBorrar: (coleccion: Coleccion) => void;
};

export function Colecciones(props: Props) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);

  return (
    <aside className="flex w-60 flex-none flex-col gap-0.5 overflow-auto border-r border-line bg-ink-0 p-3">
      <Fila
        nombre="Todas"
        total={props.totales.get("todas") ?? 0}
        activa={props.filtro === "todas"}
        alElegir={() => props.alFiltrar("todas")}
      />
      <Fila
        nombre="Sin ordenar"
        total={props.totales.get("sin-ordenar") ?? 0}
        activa={props.filtro === "sin-ordenar"}
        alElegir={() => props.alFiltrar("sin-ordenar")}
      />

      <div className="mt-4 mb-1 flex items-center px-2 text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">
        Colecciones
        <button
          aria-label="Nueva colección"
          title="Nueva colección"
          onClick={() => setCreando(true)}
          className="ml-auto grid size-6 place-items-center rounded-md hover:bg-ink-3 hover:text-fg"
        >
          <IconoMas size={14} />
        </button>
      </div>

      {props.colecciones.map((c) =>
        editando === c.id ? (
          <div key={c.id} className="px-1 py-0.5">
            <CampoTexto
              inicial={c.nombre}
              etiqueta="Nombre de la colección"
              alGuardar={(nombre) => {
                props.alRenombrar(c.id, nombre);
                setEditando(null);
              }}
              alCancelar={() => setEditando(null)}
            />
          </div>
        ) : (
          <Fila
            key={c.id}
            nombre={c.nombre}
            carpeta
            total={props.totales.get(c.id) ?? 0}
            activa={props.filtro === c.id}
            alElegir={() => props.alFiltrar(c.id)}
            menu={
              <Menu etiqueta={`Opciones de ${c.nombre}`}>
                {(cerrar) => (
                  <>
                    <OpcionMenu onClick={() => (cerrar(), setEditando(c.id))}>Renombrar</OpcionMenu>
                    <OpcionMenu peligro onClick={() => (cerrar(), props.alBorrar(c))}>
                      Borrar colección
                    </OpcionMenu>
                  </>
                )}
              </Menu>
            }
          />
        ),
      )}

      {creando && (
        <div className="px-1 py-0.5">
          <CampoTexto
            inicial=""
            etiqueta="Nombre de la nueva colección"
            alGuardar={(nombre) => {
              props.alCrear(nombre);
              setCreando(false);
            }}
            alCancelar={() => setCreando(false)}
          />
        </div>
      )}

      {props.colecciones.length === 0 && !creando && (
        <p className="m-0 px-2 py-1 leading-relaxed text-fg-3">
          Agrupa canciones por culto o ensayo, por ejemplo "Domingo 10 nov".
        </p>
      )}
    </aside>
  );
}

function Fila(props: {
  nombre: string;
  total: number;
  activa: boolean;
  carpeta?: boolean;
  alElegir: () => void;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-lg pr-1 ${
        props.activa ? "bg-ink-3 text-fg" : "text-fg-2 hover:bg-ink-2"
      }`}
    >
      <button onClick={props.alElegir} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left">
        {props.carpeta && <IconoCarpeta size={15} />}
        <span className="truncate">{props.nombre}</span>
        <span className="ml-auto font-mono text-[11px] text-fg-3">{props.total}</span>
      </button>
      {props.menu && <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">{props.menu}</div>}
    </div>
  );
}
