// Íconos dibujados a mano en SVG: pesan casi nada y no necesitan librería.
// Toman el color del texto (currentColor).

type Props = { size?: number };

function Trazo({ size = 18, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Logo({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <rect x="2" y="7" width="2.4" height="6" rx="1.2" />
      <rect x="6.2" y="3" width="2.4" height="14" rx="1.2" />
      <rect x="10.4" y="5.5" width="2.4" height="9" rx="1.2" />
      <rect x="14.6" y="8.5" width="2.4" height="3" rx="1.2" />
    </svg>
  );
}

export const IconoBiblioteca = (p: Props) => (
  <Trazo {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M4 9h16M9 4v16" />
  </Trazo>
);

export const IconoEditor = (p: Props) => (
  <Trazo {...p}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </Trazo>
);

export const IconoAjustes = (p: Props) => (
  <Trazo {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Trazo>
);

export const IconoMas = (p: Props) => (
  <Trazo {...p}>
    <path d="M12 5v14M5 12h14" />
  </Trazo>
);

export const IconoBuscar = (p: Props) => (
  <Trazo {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </Trazo>
);

export const IconoCarpeta = (p: Props) => (
  <Trazo {...p}>
    <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </Trazo>
);

export const IconoNota = (p: Props) => (
  <Trazo {...p}>
    <circle cx="8" cy="17" r="3" />
    <path d="M11 17V5l8-2v12" />
    <circle cx="16" cy="15" r="3" />
  </Trazo>
);

export const IconoSubir = (p: Props) => (
  <Trazo {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </Trazo>
);

export const IconoAtras = (p: Props) => (
  <Trazo {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Trazo>
);

export function IconoPuntos({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function IconoPlay({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

export function IconoPausa({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}

export function IconoInicio({ size = 16 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
      <path d="M19 5v14l-10-7z" />
    </svg>
  );
}
