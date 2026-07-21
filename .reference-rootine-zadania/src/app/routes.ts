import { createBrowserRouter } from "react-router";
import Layout from "./layout/Layout";
import Dzisiaj from "./pages/Dzisiaj";
import Zadania from "./pages/Zadania";
import Cele from "./pages/Cele";
import Sport from "./pages/Sport";
import Odzywanie from "./pages/Odzywanie";
import Praca from "./pages/Praca";
import Finanse from "./pages/Finanse";
import Notatki from "./pages/Notatki";
import Sprawy from "./pages/Sprawy";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true,           Component: Dzisiaj   },
      { path: "zadania",       Component: Zadania   },
      { path: "cele",          Component: Cele      },
      { path: "sport",         Component: Sport     },
      { path: "odzywanie",     Component: Odzywanie },
      { path: "praca",         Component: Praca     },
      { path: "finanse",       Component: Finanse   },
      { path: "notatki",       Component: Notatki   },
      { path: "sprawy",        Component: Sprawy    },
    ],
  },
]);
