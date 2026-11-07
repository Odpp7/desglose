import { useRef, useState } from "react";

// Campo para escribir un nombre en el mismo lugar donde estaba el texto
// (renombrar una canción o una colección, crear una colección).
// Enter guarda, Escape cancela, y al hacer clic afuera también guarda.

type Props = {
  inicial: string;
  etiqueta: string;
  alGuardar: (valor: string) => void;
  alCancelar: () => void;
};

export function CampoTexto({ inicial, etiqueta, alGuardar, alCancelar }: Props) {
  const [valor, setValor] = useState(inicial);
  // Evita responder dos veces: Enter cierra el campo y eso también dispara onBlur.
  const terminado = useRef(false);

  function terminar(guardarCambios: boolean) {
    if (terminado.current) return;
    terminado.current = true;
    const limpio = valor.trim();
    // Vacío o igual que antes: no hay nada que guardar.
    if (guardarCambios && limpio && limpio !== inicial) alGuardar(limpio);
    else alCancelar();
  }

  return (
    <input
      autoFocus
      value={valor}
      aria-label={etiqueta}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => terminar(true)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") terminar(true);
        if (e.key === "Escape") terminar(false);
      }}
      className="w-full min-w-0 rounded-md border border-accent bg-ink-0 px-2 py-1 text-fg outline-none"
    />
  );
}
