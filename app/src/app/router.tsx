import { createHashRouter } from "react-router";
import { Layout } from "./Layout";
import { LibraryPage } from "../features/library/LibraryPage";
import { NewSongPage } from "../features/import-song/NewSongPage";
import { EditorPage } from "../features/editor/EditorPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "nueva", element: <NewSongPage /> },
      { path: "editor", element: <EditorPage /> },
      { path: "ajustes", element: <SettingsPage /> },
    ],
  },
]);
