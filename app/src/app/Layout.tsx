import { NavLink, Outlet } from "react-router";
import { IconoAjustes, IconoBiblioteca, IconoEditor, Logo } from "../components/icons";


const enlaces = [
  { to: "/", label: "Biblioteca", Icono: IconoBiblioteca, end: true },
  { to: "/editor", label: "Editor", Icono: IconoEditor, end: false },
];

function Enlace({ to, label, Icono, end }: (typeof enlaces)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex w-12 flex-col items-center gap-1 rounded-[10px] pt-2 pb-1.5 text-[10.5px] ${
          isActive ? "bg-ink-3 text-fg" : "text-fg-3 hover:bg-ink-2 hover:text-fg-2"
        }`
      }
    >
      <Icono />
      {label}
    </NavLink>
  );
}

export function Layout() {
  return (
    <div className="grid h-full grid-cols-[64px_1fr]">
      <nav aria-label="Navegación" className="flex flex-col items-center gap-1.5 border-r border-line bg-ink-0 py-3.5">
        <div className="mb-3.5 grid size-[34px] place-items-center rounded-[10px] bg-accent text-accent-ink">
          <Logo />
        </div>
        {enlaces.map((e) => ( <Enlace key={e.to} {...e} />))}
        <div className="mt-auto"> <Enlace to="/ajustes" label="Ajustes" Icono={IconoAjustes} end={false} /></div>
      </nav>

      <main className="min-w-0 overflow-auto bg-ink-1">
        <Outlet />
      </main>
    </div>
  );
}
