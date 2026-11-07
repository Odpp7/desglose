// Título de pantalla con un texto de ayuda y, a la derecha, acciones opcionales.

type Props = {
  titulo: string;
  ayuda?: string;
  children?: React.ReactNode;
};

export function Encabezado({ titulo, ayuda, children }: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-line px-6 py-4">
      <div className="min-w-0">
        <h1 className="m-0 font-display text-lg font-semibold tracking-tight">{titulo}</h1>
        {ayuda && <p className="m-0 mt-1 text-fg-3">{ayuda}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}
