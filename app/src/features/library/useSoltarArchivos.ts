// Arrastrar archivos desde el Explorador de Windows a la ventana.
// Lo avisa Tauri (no el navegador), y por eso entrega la ruta completa
// de cada archivo, que es lo que Rust necesita para copiarlo.

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Devuelve `true` mientras hay archivos encima de la ventana. */
export function useSoltarArchivos(alSoltar: (rutas: string[]) => void) {
  const [encima, setEncima] = useState(false);

  // Se guarda la última versión de `alSoltar` en un ref para no tener que
  // volver a suscribirse cada vez que el componente se dibuja.
  const ultimo = useRef(alSoltar);
  ultimo.current = alSoltar;

  useEffect(() => {
    const dejar = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") {
        setEncima(true);
      } else if (payload.type === "leave") {
        setEncima(false);
      } else if (payload.type === "drop") {
        setEncima(false);
        if (payload.paths.length > 0) ultimo.current(payload.paths);
      }
    });
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  return encima;
}
