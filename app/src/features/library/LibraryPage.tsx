import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { Confirmar } from "../../components/Confirmar";
import { IconoBuscar, IconoMas, IconoSubir } from "../../components/icons";
import { FORMATOS, borrarCarpetaCancion } from "../../lib/archivos";
import * as db from "../../lib/db";
import type { Cancion, Coleccion } from "../../lib/db";
import { Colecciones, type Filtro } from "./Colecciones";
import { FilaCancion } from "./FilaCancion";
import { importarCanciones } from "./importar";
import { useSoltarArchivos } from "./useSoltarArchivos";

// Biblioteca: colecciones a la izquierda; buscador y canciones a la derecha.
// Se agregan canciones con "Nueva canción" o arrastrándolas a la ventana.
// La lista completa se lee una vez de SQLite y se filtra aquí: son pocas
// decenas de filas de texto, y así buscar es instantáneo.

type Aviso = { tipo: "bien" | "error"; texto: string };
type PorBorrar = { tipo: "cancion"; cancion: Cancion } | { tipo: "coleccion"; coleccion: Coleccion };

export function LibraryPage() {
  const navegar = useNavigate();
  const [canciones, setCanciones] = useState<Cancion[]>([]);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [importando, setImportando] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [porBorrar, setPorBorrar] = useState<PorBorrar | null>(null);

  const recargar = useCallback(async () => {
    try {
      const [c, col] = await Promise.all([db.listarCanciones(), db.listarColecciones()]);
      setCanciones(c);
      setColecciones(col);
    } catch (e) {
      setAviso({ tipo: "error", texto: `No se pudo leer la biblioteca: ${String(e)}` });
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Los avisos buenos se van solos; los errores se quedan hasta cerrarlos.
  useEffect(() => {
    if (aviso?.tipo !== "bien") return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Ejecuta una acción, muestra el error si falla y recarga la lista.
  async function hacer(accion: () => Promise<unknown>) {
    try {
      await accion();
    } catch (e) {
      setAviso({ tipo: "error", texto: String(e) });
    }
    await recargar();
  }

  const coleccionActual = typeof filtro === "number" ? filtro : null;

  async function agregar(rutas: string[]) {
    setAviso(null);
    setImportando(rutas.length);
    const r = await importarCanciones(rutas, coleccionActual);
    setImportando(0);
    await recargar();
    if (r.errores.length > 0) {
      setAviso({ tipo: "error", texto: r.errores.join("\n") });
    } else if (r.agregadas > 0) {
      setAviso({ tipo: "bien", texto: r.agregadas === 1 ? "Canción agregada" : `${r.agregadas} canciones agregadas` });
    }
  }

  async function elegirArchivos() {
    const elegidos = await open({
      multiple: true,
      title: "Elegir canciones",
      filters: [{ name: "Canciones", extensions: FORMATOS }],
    });
    if (elegidos && elegidos.length > 0) agregar(elegidos);
  }

  const encima = useSoltarArchivos((rutas) => {
    if (importando === 0) agregar(rutas);
  });

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setPorBorrar(null);
    if (porBorrar.tipo === "cancion") {
      // Primero el audio: si falla, la canción sigue en la lista y se puede reintentar.
      const id = porBorrar.cancion.id;
      await hacer(async () => {
        await borrarCarpetaCancion(id);
        await db.borrarCancion(id);
      });
    } else {
      const id = porBorrar.coleccion.id;
      if (filtro === id) setFiltro("todas");
      await hacer(() => db.borrarColeccion(id));
    }
  }

  // Cuántas canciones hay en cada filtro, para mostrarlo al lado de cada nombre.
  const totales = useMemo(() => {
    const t = new Map<Filtro, number>([["todas", canciones.length]]);
    for (const c of canciones) {
      const clave: Filtro = c.coleccion_id ?? "sin-ordenar";
      t.set(clave, (t.get(clave) ?? 0) + 1);
    }
    return t;
  }, [canciones]);

  const visibles = useMemo(() => {
    const texto = normalizar(busqueda.trim());
    return canciones.filter((c) => {
      if (filtro === "sin-ordenar" && c.coleccion_id !== null) return false;
      if (typeof filtro === "number" && c.coleccion_id !== filtro) return false;
      return !texto || normalizar(`${c.titulo} ${c.artista}`).includes(texto);
    });
  }, [canciones, filtro, busqueda]);

  const tituloLista =
    filtro === "todas"
      ? "Todas las canciones"
      : filtro === "sin-ordenar"
        ? "Sin ordenar"
        : (colecciones.find((c) => c.id === filtro)?.nombre ?? "");

  return (
    <div className="relative flex h-full">
      <Colecciones
        colecciones={colecciones}
        totales={totales}
        filtro={filtro}
        alFiltrar={setFiltro}
        alCrear={(nombre) =>
          hacer(async () => {
            const id = await db.crearColeccion(nombre);
            setFiltro(id);
          })
        }
        alRenombrar={(id, nombre) => hacer(() => db.renombrarColeccion(id, nombre))}
        alBorrar={(coleccion) => setPorBorrar({ tipo: "coleccion", coleccion })}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h1 className="m-0 truncate font-display text-lg font-semibold tracking-tight">{tituloLista}</h1>
            <p className="m-0 mt-1 text-fg-3">
              {visibles.length === 1 ? "1 canción" : `${visibles.length} canciones`}
            </p>
          </div>

          <label className="ml-auto flex w-72 items-center gap-2 rounded-lg border border-line bg-ink-2 px-3 py-2 text-fg-3 focus-within:border-line-2">
            <IconoBuscar size={16} />
            <input
              id="buscar"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar canción"
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
            />
          </label>

          <button
            onClick={elegirArchivos}
            disabled={importando > 0}
            className="flex items-center gap-2 rounded-[10px] bg-accent px-3.5 py-2 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-50"
          >
            <IconoMas size={16} />
            Nueva canción
          </button>
        </header>

        {aviso && (
          <div
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={`mx-6 mt-3 flex items-start gap-3 rounded-lg px-3 py-2 whitespace-pre-line ${
              aviso.tipo === "error" ? "bg-[#3a1d24] text-[#ffb3bd]" : "bg-[#173a33] text-[#9ce8d6]"
            }`}
          >
            <span className="flex-1">{aviso.texto}</span>
            <button aria-label="Cerrar aviso" onClick={() => setAviso(null)} className="opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {importando > 0 && (
          <p className="mx-6 mt-3 text-fg-2">
            Agregando {importando === 1 ? "la canción" : `${importando} canciones`}…
          </p>
        )}

        {visibles.length > 0 ? (
          <ul className="m-0 flex-1 list-none overflow-auto p-0">
            {visibles.map((c) => (
              <FilaCancion
                key={c.id}
                cancion={c}
                colecciones={colecciones}
                mostrarColeccion={filtro === "todas"}
                alAbrir={() => navegar(`/cancion/${c.id}`)}
                alRenombrar={(titulo) => hacer(() => db.renombrarCancion(c.id, titulo))}
                alMover={(coleccionId) => hacer(() => db.moverCancion(c.id, coleccionId))}
                alBorrar={() => setPorBorrar({ tipo: "cancion", cancion: c })}
              />
            ))}
          </ul>
        ) : (
          <Vacio buscando={busqueda.trim() !== ""} enColeccion={typeof filtro === "number"} />
        )}
      </section>

      {encima && (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-ink-0/85">
          <div className="text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
              <IconoSubir size={22} />
            </div>
            <p className="m-0 font-display text-lg font-semibold">Suelta aquí la canción</p>
            <p className="m-0 mt-1 text-fg-2">
              {coleccionActual !== null ? `Se agregará a "${tituloLista}"` : "MP3, WAV, FLAC o M4A"}
            </p>
          </div>
        </div>
      )}

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
          titulo={`¿Borrar la colección "${porBorrar.coleccion.nombre}"?`}
          texto="Sus canciones no se borran: pasan a Sin ordenar."
          boton="Borrar colección"
          alConfirmar={confirmarBorrado}
          alCancelar={() => setPorBorrar(null)}
        />
      )}
    </div>
  );
}

function Vacio({ buscando, enColeccion }: { buscando: boolean; enColeccion: boolean }) {
  if (buscando) {
    return <p className="px-6 py-10 text-center text-fg-3">Ninguna canción coincide con la búsqueda.</p>;
  }
  return (
    <div className="grid flex-1 place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <h2 className="m-0 font-display text-base font-semibold">
          {enColeccion ? "Esta colección está vacía" : "Agrega tu primera canción"}
        </h2>
        <p className="mt-2 leading-relaxed text-fg-3">
          Arrastra un MP3, WAV, FLAC o M4A a esta ventana, o usa "Nueva canción".
          {enColeccion && " También puedes mover canciones aquí desde su menú."}
        </p>
      </div>
    </div>
  );
}

/** Minúsculas y sin tildes: "Canción" y "cancion" se encuentran igual. */
function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
