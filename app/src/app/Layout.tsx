import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { IconoAjustes, IconoBiblioteca, IconoSubir, Logo } from "../components/icons";
import { FORMATOS } from "../lib/archivos";
import { avisarCambio } from "../lib/cambios";
import { importarCanciones } from "../features/library/importar";
import { PanelBiblioteca } from "../features/library/PanelBiblioteca";
import { useSoltarArchivos } from "../features/library/useSoltarArchivos";
import { AvisoVersion } from "./AvisoVersion";

// El marco de toda la app (como en la captura de referencia):
//
//   ┌──┬─────────────┬──────────────────────────────┐
//   │  │ Biblioteca  │  La canción abierta (editor)  │
//   │▤ │ carpetas y  │  o Ajustes                    │
//   │⚙ │ canciones   │                               │
//   └──┴─────────────┴──────────────────────────────┘
//
// La biblioteca está siempre a la izquierda: elegir una canción la abre al lado.
// Se puede plegar con el botón de la barra para ganar espacio (pantallas chicas).
// Arrastrar canciones a cualquier parte de la ventana las agrega.

const CLAVE_PANEL = "desglose.bibliotecaVisible";

function leerPanel() {
  try {
    return localStorage.getItem(CLAVE_PANEL) !== "no";
  } catch {
    return true;
  }
}

export function Layout() {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [panel, setPanel] = useState(leerPanel);
  const [importando, setImportando] = useState(0);
  const [aviso, setAviso] = useState<{ tipo: "bien" | "error"; texto: string } | null>(null);

  const seleccionada = pathname.startsWith("/cancion/") ? Number(pathname.split("/")[2]) : null;

  function alternarPanel() {
    setPanel((visible) => {
      try {
        localStorage.setItem(CLAVE_PANEL, visible ? "no" : "si");
      } catch {
        // Sin almacenamiento, solo no se recuerda.
      }
      return !visible;
    });
  }

  const mostrarError = useCallback((texto: string) => setAviso({ tipo: "error", texto }), []);

  // Los avisos buenos se van solos; los errores se quedan hasta cerrarlos.
  useEffect(() => {
    if (aviso?.tipo !== "bien") return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function agregar(rutas: string[]) {
    setAviso(null);
    setImportando(rutas.length);
    const r = await importarCanciones(rutas, null);
    setImportando(0);
    avisarCambio();
    if (r.errores.length > 0) {
      setAviso({ tipo: "error", texto: r.errores.join("\n") });
    } else if (r.agregadas.length > 0) {
      setAviso({
        tipo: "bien",
        texto: r.agregadas.length === 1 ? "Canción agregada" : `${r.agregadas.length} canciones agregadas`,
      });
    }
    // Se abre la última agregada, lista para crear su secuencia.
    const ultima = r.agregadas[r.agregadas.length - 1];
    if (ultima !== undefined) navegar(`/cancion/${ultima}`);
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

  return (
    <div className="relative flex h-full">
      <nav aria-label="Navegación" className="flex w-14 flex-none flex-col items-center gap-1.5 border-r border-line bg-ink-0 py-3">
        <button
          onClick={() => navegar("/")}
          title="Inicio"
          className="mb-3 grid size-[34px] place-items-center rounded-[10px] bg-accent text-accent-ink"
        >
          <Logo />
        </button>
        <BotonBarra
          label="Biblioteca"
          activo={panel}
          onClick={alternarPanel}
          titulo={panel ? "Plegar la biblioteca" : "Mostrar la biblioteca"}
        >
          <IconoBiblioteca />
        </BotonBarra>
        <div className="mt-auto">
          <BotonBarra label="Ajustes" activo={pathname === "/ajustes"} onClick={() => navegar("/ajustes")}>
            <IconoAjustes />
          </BotonBarra>
        </div>
      </nav>

      {panel && <PanelBiblioteca seleccionada={seleccionada} alAgregar={elegirArchivos} alError={mostrarError} />}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ink-1">
        <AvisoVersion />
        {aviso && (
          <div
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 px-5 py-2 whitespace-pre-line ${
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
          <p className="m-0 bg-ink-2 px-5 py-2 text-fg-2">
            Agregando {importando === 1 ? "la canción" : `${importando} canciones`}…
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet context={{ agregar: elegirArchivos }} />
        </div>
      </main>

      {encima && (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-ink-0/85">
          <div className="text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
              <IconoSubir size={22} />
            </div>
            <p className="m-0 font-display text-lg font-semibold">Suelta aquí la canción</p>
            <p className="m-0 mt-1 text-fg-2">MP3, WAV, FLAC o M4A</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BotonBarra(props: {
  label: string;
  activo: boolean;
  onClick: () => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.titulo ?? props.label}
      aria-pressed={props.activo}
      className={`flex w-12 flex-col items-center gap-1 rounded-[10px] pt-2 pb-1.5 text-[10px] ${
        props.activo ? "bg-ink-3 text-fg" : "text-fg-3 hover:bg-ink-2 hover:text-fg-2"
      }`}
    >
      {props.children}
      {props.label}
    </button>
  );
}
