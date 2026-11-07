import { createHashRouter } from "react-router";
import { Layout } from "./Layout";
import { LibraryPage } from "../features/library/LibraryPage";
import { CancionPage } from "../features/song/CancionPage";
import { EditorPage } from "../features/editor/EditorPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "cancion/:id", element: <CancionPage /> },
      { path: "editor", element: <EditorPage /> },
      { path: "ajustes", element: <SettingsPage /> },
    ],
  },
]);
