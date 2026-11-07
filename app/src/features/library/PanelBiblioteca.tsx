import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CampoTexto } from "../../components/CampoTexto";
import { Confirmar } from "../../components/Confirmar";
import { EstadoCancion } from "../../components/EstadoCancion";
import { IconoBuscar, IconoCarpeta, IconoFlecha, IconoMas, IconoNota } from "../../components/icons";
import { Menu, OpcionMenu, TituloMenu } from "../../components/Menu";
import { borrarCarpetaCancion, extension } from "../../lib/archivos";
import { avisarCambio, useVersion } from "../../lib/cambios";
import * as db from "../../lib/db";
import type { Cancion, Coleccion } from "../../lib/db";
import { formatoDuracion, normalizar } from "../../lib/formato";
import { recordarCancion, ultimaCancion } from "../../lib/sesion";

// La biblioteca, siempre a la izquierda (como en la captura de referencia):
// buscador, carpetas con sus canciones adentro, y "Agregar canción".
// Elegir una canción la abre a la derecha; la biblioteca no se va.
// La lista completa se lee una vez de SQLite y se filtra aquí: son pocas
// decenas de filas de texto, y así buscar es instantáneo.

type PorBorrar = { tipo: "cancion"; cancion: Cancion } | { tipo: "coleccion"; coleccion: Coleccion };

type Props = {
  /** La canción abierta a la derecha (se resalta). */
  seleccionada: number | null;
  /** Abre la ventana de Windows para elegir canciones (lo maneja el marco). */
  alAgregar: () => void;
  alError: (texto: string) => void;
};

export function PanelBiblioteca({ seleccionada, alAgregar, alError }: Props) {
  const navegar = useNavigate();
  const [canciones, setCanciones] = useState<Cancion[]>([]);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<PorBorrar | null>(null);
  const version = useVersion();

  const recargar = useCallback(async () => {
    try {
      const [c, col] = await Promise.all([db.listarCanciones(), db.listarColecciones()]);
      setCanciones(c);
      setColecciones(col);
    } catch (e) {
      alError(`No se pudo leer la biblioteca: ${String(e)}`);
    }
  }, [alError]);

  useEffect(() => {
    recargar();
  }, [recargar, version]);

  // Ejecuta una acción, muestra el error si falla y avisa a toda la app.
  async function hacer(accion: () => Promise<unknown>) {
    try {
      await accion();
    } catch (e) {
      alError(String(e));
    }
    avisarCambio();
  }

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setPorBorrar(null);
    if (porBorrar.tipo === "cancion") {
      const id = porBorrar.cancion.id;
      // Primero el audio: si falla, la canción sigue en la lista y se puede reintentar.
      await hacer(async () => {
        await borrarCarpetaCancion(id);
        await db.borrarCancion(id);
        if (ultimaCancion() === id) recordarCancion(null);
        if (seleccionada === id) navegar("/");
      });
    } else {
      await hacer(() => db.borrarColeccion(porBorrar.coleccion.id));
    }
  }

  // Grupos: "Sin ordenar" y cada colección, con sus canciones (filtradas por la búsqueda).
  const grupos = useMemo(() => {
    const texto = normalizar(busqueda.trim());
    const coincide = (c: Cancion) => !texto || normalizar(`${c.titulo} ${c.artista}`).includes(texto);
    const lista = [
      { clave: "sin", coleccion: null as Coleccion | null, nombre: "Sin ordenar" },
      ...colecciones.map((c) => ({ clave: `c${c.id}`, coleccion: c as Coleccion | null, nombre: c.nombre })),
    ];
    return lista
      .map((g) => ({
        ...g,
        canciones: canciones.filter((c) => c.coleccion_id === (g.coleccion?.id ?? null) && coincide(c)),
      }))
      .filter((g) => !texto || g.canciones.length > 0);
  }, [canciones, colecciones, busqueda]);

  function alternar(clave: string) {
    setCerradas((antes) => {
      const nuevo = new Set(antes);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  return (
    <aside className="flex min-h-0 w-[264px] flex-none flex-col border-r border-line bg-ink-0">
      <div className="p-3 pb-2">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-ink-1 px-3 py-2 text-fg-3 focus-within:border-line-2">
          <IconoBuscar size={15} />
          <input
            id="buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la biblioteca…"
            className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
          />
        </label>
      </div>

      <div className="flex items-center px-4 pt-1 pb-2">
        <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Colecciones</span>
        <button
          onClick={() => setCreando(true)}
          className="ml-auto flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-[11.5px] text-fg-2 hover:text-fg"
        >
          <IconoCarpeta size={13} />
          Nueva carpeta
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {creando && (
          <div className="px-1 py-1">
            <CampoTexto
              inicial=""
              etiqueta="Nombre de la nueva carpeta"
              alGuardar={(nombre) => {
                setCreando(false);
                hacer(() => db.crearColeccion(nombre));
              }}
              alCancelar={() => setCreando(false)}
            />
          </div>
        )}

        {grupos.map((g) => {
          const cerrada = cerradas.has(g.clave) && !busqueda;
          return (
            <section key={g.clave} className="mb-1">
              <div className="group flex items-center rounded-md pr-1 hover:bg-ink-2">
                {editando === g.clave && g.coleccion ? (
                  <div className="flex-1 px-1 py-1">
                    <CampoTexto
                      inicial={g.nombre}
                      etiqueta="Nombre de la carpeta"
                      alGuardar={(nombre) => {
                        setEditando(null);
                        hacer(() => db.renombrarColeccion(g.coleccion!.id, nombre));
                      }}
                      alCancelar={() => setEditando(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => alternar(g.clave)}
                    aria-expanded={!cerrada}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left text-fg-2"
                  >
                    <span className={`text-fg-3 transition-transform ${cerrada ? "" : "rotate-90"}`}>
                      <IconoFlecha size={13} />
                    </span>
                    <IconoCarpeta size={15} />
                    <span className="truncate">{g.nombre}</span>
                    <span className="ml-auto pl-2 font-mono text-[11px] text-fg-3">{g.canciones.length}</span>
                  </button>
                )}
                {g.coleccion && editando !== g.clave && (
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <Menu etiqueta={`Opciones de ${g.nombre}`}>
                      {(cerrar) => (
                        <>
                          <OpcionMenu onClick={() => (cerrar(), setEditando(g.clave))}>Renombrar</OpcionMenu>
                          <OpcionMenu
                            peligro
                            onClick={() => (cerrar(), setPorBorrar({ tipo: "coleccion", coleccion: g.coleccion! }))}
                          >
                            Borrar carpeta
                          </OpcionMenu>
                        </>
                      )}
                    </Menu>
                  </div>
                )}
              </div>

              {!cerrada && (
                <ul className="m-0 flex list-none flex-col gap-1 py-1 pl-3">
                  {g.canciones.map((c) => (
                    <TarjetaCancion
                      key={c.id}
                      cancion={c}
                      colecciones={colecciones}
                      seleccionada={c.id === seleccionada}
                      editando={editando === `s${c.id}`}
                      alAbrir={() => navegar(`/cancion/${c.id}`)}
                      alEditar={(si) => setEditando(si ? `s${c.id}` : null)}
                      alRenombrar={(titulo) => hacer(() => db.renombrarCancion(c.id, titulo))}
                      alMover={(coleccionId) => hacer(() => db.moverCancion(c.id, coleccionId))}
                      alBorrar={() => setPorBorrar({ tipo: "cancion", cancion: c })}
                    />
                  ))}
                  {g.canciones.length === 0 && (
                    <li className="px-2 py-1 text-[12px] text-fg-3">Vacía</li>
                  )}
                </ul>
              )}
            </section>
          );
        })}

        {busqueda && grupos.length === 0 && (
          <p className="px-3 py-4 text-center text-fg-3">Ninguna canción coincide.</p>
        )}
      </div>

      <div className="border-t border-line p-3">
        <button
          onClick={alAgregar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink hover:brightness-110"
        >
          <IconoMas size={15} />
          Agregar canción
        </button>
        <p className="m-0 mt-1.5 text-center text-[11px] text-fg-3">o arrastra un MP3, WAV, FLAC o M4A</p>
      </div>

      {porBorrar?.tipo === "cancion" && (
        <Confirmar
          titulo={`¿Borrar "${porBorrar.cancion.titulo}"?`}
          texto="Se borran la canción y todo lo que Desglose creó para ella. No se puede deshacer. Tu archivo original no se toca."
          boton="Borrar canción"
          alConfirmar={confirmarBorrado}
          alCancelar={() => setPorBorrar(null)}
        />
      )}
      {porBorrar?.tipo === "coleccion" && (
        <Confirmar
          titulo={`¿Borrar la carpeta "${porBorrar.coleccion.nombre}"?`}
          texto="Sus canciones no se borran: pasan a Sin ordenar."
          boton="Borrar carpeta"
          alConfirmar={confirmarBorrado}
          alCancelar={() => setPorBorrar(null)}
        />
      )}
    </aside>
  );
}

function TarjetaCancion(props: {
  cancion: Cancion;
  colecciones: Coleccion[];
  seleccionada: boolean;
  editando: boolean;
  alAbrir: () => void;
  alEditar: (si: boolean) => void;
  alRenombrar: (titulo: string) => void;
  alMover: (coleccionId: number | null) => void;
  alBorrar: () => void;
}) {
  const { cancion: c } = props;
  return (
    <li
      tabIndex={0}
      onClick={() => !props.editando && props.alAbrir()}
      onKeyDown={(e) => e.key === "Enter" && !props.editando && props.alAbrir()}
      onDoubleClick={() => props.alEditar(true)}
      className={`group flex cursor-pointer items-center gap-2.5 rounded-lg border px-2 py-2 ${
        props.seleccionada ? "border-accent/60 bg-ink-2" : "border-transparent hover:bg-ink-1"
      }`}
    >
      <span className="relative grid size-9 flex-none place-items-center rounded-md border border-line-2 bg-ink-1 text-fg-3">
        <IconoNota size={15} />
        <span className="absolute -bottom-1 rounded-sm bg-accent px-1 font-mono text-[8.5px] font-semibold text-accent-ink uppercase">
          {extension(c.archivo) || "?"}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {props.editando ? (
          <CampoTexto
            inicial={c.titulo}
            etiqueta="Nombre de la canción"
            alGuardar={(t) => {
              props.alEditar(false);
              props.alRenombrar(t);
            }}
            alCancelar={() => props.alEditar(false)}
          />
        ) : (
          <div className="truncate text-[12.5px] font-semibold" title={c.titulo}>
            {c.titulo}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-mono text-[11px] text-fg-3">{formatoDuracion(c.duracion_ms)}</span>
          <EstadoCancion cancionId={c.id} estado={c.estado} />
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <Menu etiqueta={`Opciones de ${c.titulo}`}>
          {(cerrar) => (
            <>
              <OpcionMenu onClick={() => (cerrar(), props.alEditar(true))}>Renombrar</OpcionMenu>
              <TituloMenu>Mover a</TituloMenu>
              <OpcionMenu marcada={c.coleccion_id === null} onClick={() => (cerrar(), props.alMover(null))}>
                Sin ordenar
              </OpcionMenu>
              {props.colecciones.map((col) => (
                <OpcionMenu
                  key={col.id}
                  marcada={c.coleccion_id === col.id}
                  onClick={() => (cerrar(), props.alMover(col.id))}
                >
                  {col.nombre}
                </OpcionMenu>
              ))}
              <div className="mt-1 border-t border-line pt-1">
                <OpcionMenu peligro onClick={() => (cerrar(), props.alBorrar())}>
                  Borrar canción
                </OpcionMenu>
              </div>
            </>
          )}
        </Menu>
      </div>
    </li>
  );
}
