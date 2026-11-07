import { useState } from "react";
import { CampoTexto } from "../../components/CampoTexto";
import { IconoNota } from "../../components/icons";
import { Menu, OpcionMenu, TituloMenu } from "../../components/Menu";
import type { Cancion, Coleccion } from "../../lib/db";

// Una canción en la lista: nombre, colección, duración, estado y su menú.
// Clic (o Enter) la abre. Doble clic en el nombre, o "Renombrar", lo edita.

type Props = {
  cancion: Cancion;
  colecciones: Coleccion[];
  /** Se muestra la colección solo cuando la lista tiene varias mezcladas. */
  mostrarColeccion: boolean;
  alAbrir: () => void;
  alRenombrar: (titulo: string) => void;
  alMover: (coleccionId: number | null) => void;
  alBorrar: () => void;
};

export function FilaCancion({ cancion, colecciones, mostrarColeccion, ...acciones }: Props) {
  const [editando, setEditando] = useState(false);
  const coleccion = colecciones.find((c) => c.id === cancion.coleccion_id);

  return (
    <li
      tabIndex={0}
      onClick={() => !editando && acciones.alAbrir()}
      onKeyDown={(e) => e.key === "Enter" && !editando && acciones.alAbrir()}
      className="group grid cursor-pointer grid-cols-[36px_1fr_140px_70px_120px_32px] items-center gap-3 border-b border-line px-6 py-2.5 hover:bg-ink-2"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-ink-3 text-fg-3">
        <IconoNota size={16} />
      </span>

      <div className="min-w-0" onDoubleClick={(e) => (e.stopPropagation(), setEditando(true))}>
        {editando ? (
          <CampoTexto
            inicial={cancion.titulo}
            etiqueta="Nombre de la canción"
            alGuardar={(t) => {
              acciones.alRenombrar(t);
              setEditando(false);
            }}
            alCancelar={() => setEditando(false)}
          />
        ) : (
          <div className="truncate font-semibold">{cancion.titulo}</div>
        )}
      </div>

      <span className="truncate text-fg-3">{mostrarColeccion ? (coleccion?.nombre ?? "Sin ordenar") : ""}</span>
      <span className="text-right font-mono text-fg-2 tabular-nums">{formatoDuracion(cancion.duracion_ms)}</span>
      <span>
        <span className="rounded-full bg-ink-3 px-2 py-0.5 text-[11px] text-fg-2">Sin secuencia</span>
      </span>

      <Menu etiqueta={`Opciones de ${cancion.titulo}`}>
        {(cerrar) => (
          <>
            <OpcionMenu onClick={() => (cerrar(), setEditando(true))}>Renombrar</OpcionMenu>
            <TituloMenu>Mover a</TituloMenu>
            <OpcionMenu marcada={cancion.coleccion_id === null} onClick={() => (cerrar(), acciones.alMover(null))}>
              Sin ordenar
            </OpcionMenu>
            {colecciones.map((c) => (
              <OpcionMenu
                key={c.id}
                marcada={cancion.coleccion_id === c.id}
                onClick={() => (cerrar(), acciones.alMover(c.id))}
              >
                {c.nombre}
              </OpcionMenu>
            ))}
            <div className="mt-1 border-t border-line pt-1">
              <OpcionMenu peligro onClick={() => (cerrar(), acciones.alBorrar())}>
                Borrar canción
              </OpcionMenu>
            </div>
          </>
        )}
      </Menu>
    </li>
  );
}

/** 290000 → "4:50" */
export function formatoDuracion(ms: number) {
  if (!ms) return "—";
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}
