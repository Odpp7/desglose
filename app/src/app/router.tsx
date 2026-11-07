import { createHashRouter } from "react-router";
import { Layout } from "./Layout";
import { Inicio } from "../features/library/Inicio";
import { CancionPage } from "../features/song/CancionPage";
import { SettingsPage } from "../features/settings/SettingsPage";

// Rutas con "#" (por ejemplo `#/cancion/7`): en una app de escritorio no hay
// servidor, y así recargar la ventana nunca da una página vacía.
export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "cancion/:id", element: <CancionPage /> },
      { path: "ajustes", element: <SettingsPage /> },
    ],
  },
]);
