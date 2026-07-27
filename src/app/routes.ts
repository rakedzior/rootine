import { createBrowserRouter, redirect } from "react-router";
import Layout from "./layout/Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true,           loader: () => redirect("/zadania") },
      { path: "zadania",       lazy: async () => ({ Component: (await import("./pages/Zadania")).default }) },
      { path: "kalendarz",     lazy: async () => ({ Component: (await import("./pages/Kalendarz")).default }) },
      { path: "cele",          lazy: async () => ({ Component: (await import("./pages/Cele")).default }) },
      { path: "cele/:goalId",  lazy: async () => ({ Component: (await import("./pages/CelSzczegoly")).default }) },
      { path: "sport",         lazy: async () => ({ Component: (await import("./pages/Sport")).default }) },
      { path: "odzywianie",    lazy: async () => ({ Component: (await import("./pages/Odzywanie")).default }) },
      { path: "praca",         lazy: async () => ({ Component: (await import("./pages/Praca")).default }) },
      { path: "sprawy",        lazy: async () => ({ Component: (await import("./pages/Sprawy")).default }) },
      { path: "jdg",           loader: () => redirect("/sprawy?widok=jdg") },
      { path: "*",             loader: () => redirect("/zadania") },
    ],
  },
]);
