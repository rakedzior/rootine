import { lazy } from "react";
import { createBrowserRouter, redirect } from "react-router";
import Layout from "./layout/Layout";
import { RouteErrorState, RouteLoadingState, RouteNotFoundState } from "./RouteStates";
import ZadaniaPage from "./pages/Zadania";
import KalendarzPage from "./pages/Kalendarz";

const DzisiajPage = lazy(() => import("./pages/Dzisiaj"));
const NotatkiPage = lazy(() => import("./pages/Notatki"));
const CelePage = lazy(() => import("./pages/Cele"));
const CelSzczegolyPage = lazy(() => import("./pages/CelSzczegoly"));
const SportPage = lazy(() => import("./pages/Sport"));
const OdzywianiePage = lazy(() => import("./pages/Odzywanie"));
const PracaPage = lazy(() => import("./pages/Praca"));
const SprawyPage = lazy(() => import("./pages/Sprawy"));
const PodrozePage = lazy(() => import("./pages/Podroze"));

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: RouteErrorState,
    HydrateFallback: RouteLoadingState,
    children: [
      {
        ErrorBoundary: RouteErrorState,
        HydrateFallback: RouteLoadingState,
        children: [
          { index: true,           loader: () => redirect("/dzisiaj") },
          { path: "dzisiaj",       Component: DzisiajPage },
          { path: "zadania",       Component: ZadaniaPage },
          { path: "kalendarz",     Component: KalendarzPage },
          { path: "notatki",       Component: NotatkiPage },
          { path: "cele",          Component: CelePage },
          { path: "cele/:goalId",  Component: CelSzczegolyPage },
          { path: "sport",         Component: SportPage },
          { path: "odzywianie",    Component: OdzywianiePage },
          { path: "praca",         Component: PracaPage },
          { path: "sprawy",        Component: SprawyPage },
          { path: "podroze",       Component: PodrozePage },
          { path: "podroze/:tripId", Component: PodrozePage },
          // Legacy bookmarks only: these are intentionally absent from APP_MODULES/navigation.
          { path: "biuro",         loader: () => redirect("/praca") },
          { path: "finanse",       loader: () => redirect("/sprawy?widok=budget") },
          { path: "jdg",           loader: () => redirect("/sprawy?widok=jdg") },
          { path: "*",             Component: RouteNotFoundState },
        ],
      },
    ],
  },
]);
