import { RouterProvider } from "react-router";
import { router } from "./routes";
import PaletteProposals from "./PaletteProposals";

// Set to true to preview palettes, false to run the real app
const SHOW_PALETTES = false;

export default function App() {
  if (SHOW_PALETTES) return <PaletteProposals />;
  return <RouterProvider router={router} />;
}
