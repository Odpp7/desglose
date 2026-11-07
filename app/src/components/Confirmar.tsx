import { useEffect } from "react";

// Ventanita para confirmar algo que no se puede deshacer, como borrar.
// Se dibuja encima de todo; Escape o "Cancelar" la cierran.

type Props = {
  titulo: string;
  texto: string;
  boton: string;
  alConfirmar: () => void;
  alCancelar: () => void;
};

export function Confirmar({ titulo, texto, boton, alConfirmar, alCancelar }: Props) {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && alCancelar();
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [alCancelar]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55"
      onMouseDown={alCancelar}
    >
      <div
        role="alertdialog"
        aria-labelledby="confirmar-titulo"
        aria-describedby="confirmar-texto"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[380px] rounded-xl border border-line-2 bg-ink-2 p-5"
      >
        <h2 id="confirmar-titulo" className="m-0 font-display text-base font-semibold">
          {titulo}
        </h2>
        <p id="confirmar-texto" className="mt-2 mb-5 leading-relaxed text-fg-2">
          {texto}
        </p>
        <div className="flex justify-end gap-2">
          <button
            autoFocus
            onClick={alCancelar}
            className="rounded-lg border border-line-2 px-4 py-2 text-fg-2 hover:text-fg"
          >
            Cancelar
          </button>
          <button
            onClick={alConfirmar}
            className="rounded-lg bg-[#c94a5c] px-4 py-2 font-semibold text-white hover:brightness-110"
          >
            {boton}
          </button>
        </div>
      </div>
    </div>
  );
}
