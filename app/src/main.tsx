import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { iniciarSecuencias } from "./lib/secuencia";
import "./index.css";

// Escucha el avance de "Crear secuencia" para toda la app, desde que abre.
iniciarSecuencias();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
