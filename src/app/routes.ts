import { lazy } from "react";
import { createBrowserRouter, redirect } from "react-router";
import Layout from "./layout/Layout";
import { RouteErrorState, RouteLoadingState, RouteNotFoundState } from "./RouteStates";
const DzisiajPage = lazy(() => import("./pages/Dzisiaj"));
const ZadaniaPage = lazy(() => import("./pages/Zadania"));
const KalendarzPage = lazy(() => import("./pages/Kalendarz"));
const NotatkiPage = lazy(() => import("./pages/Notatki"));
const CelePage = lazy(() => import("./pages/Cele"));
const CelSzczegolyPage = lazy(() => import("./pages/CelSzczegoly"));
const SportPage = lazy(() => import("./pages/Sport"));
const OdzywianiePage = lazy(() => import("./pages/Odzywanie"));
const PracaPage = lazy(() => import("./pages/Praca"));
const SprawyPage = lazy(() => import("./pages/Sprawy"));
const PodrozePage = lazy(() => import("./pages/Podroze"));

/**
 * Reviewable inventory of every URL declared by the router. Runtime layout behavior
 * stays generic in ModuleShell/PageShell; this registry documents coverage without
 * becoming a second routing source of truth.
 */
export const ROUTE_LAYOUT_AUDIT = [
  { path: "/dzisiaj", component: "DzisiajPage", width: "standard", moduleSidebar: false, h1: "route", layout: "dashboard" },
  { path: "/zadania", component: "ZadaniaPage", width: "fluid", moduleSidebar: true, h1: "route", layout: "list + detail" },
  { path: "/kalendarz", component: "KalendarzPage", width: "fluid", moduleSidebar: true, h1: "route", layout: "calendar" },
  { path: "/notatki", component: "NotatkiPage", width: "standard", moduleSidebar: true, h1: "route", layout: "collection + editor" },
  { path: "/cele", component: "CelePage", width: "standard", moduleSidebar: true, h1: "route", layout: "collection + detail" },
  { path: "/cele/:goalId", component: "CelSzczegolyPage", width: "fluid", moduleSidebar: false, h1: "route", layout: "detail" },
  { path: "/sport", component: "SportPage", width: "wide", moduleSidebar: true, h1: "route", layout: "planner + detail" },
  { path: "/odzywianie", component: "OdzywianiePage", width: "wide", moduleSidebar: true, h1: "route", layout: "register + analysis" },
  { path: "/odzywianie/posilki", component: "OdzywianiePage", width: "wide", moduleSidebar: true, h1: "route", layout: "library + editor" },
  { path: "/praca", component: "PracaPage", width: "wide", moduleSidebar: true, h1: "route", layout: "workspace + detail" },
  { path: "/sprawy", component: "SprawyPage", width: "wide", moduleSidebar: true, h1: "route", layout: "register + detail" },
  { path: "/sprawy?widok=jdg", component: "JdgWorkspace", width: "wide", moduleSidebar: true, h1: "route", layout: "monthly checklist" },
  { path: "/sprawy?widok=travel", component: "PodrozePage", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier" },
  { path: "/podroze", component: "PodrozePage", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier" },
  { path: "/podroze/:tripId", component: "PodrozePage", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier detail" },
  { path: "/biuro", component: "redirect", width: "—", moduleSidebar: false, h1: "—", layout: "redirect → /praca" },
  { path: "/finanse", component: "redirect", width: "—", moduleSidebar: false, h1: "—", layout: "redirect → /sprawy?widok=budget" },
  { path: "/jdg", component: "redirect", width: "—", moduleSidebar: false, h1: "—", layout: "redirect → /sprawy?widok=jdg" },
  { path: "*", component: "RouteNotFoundState", width: "route state", moduleSidebar: false, h1: "none", layout: "error state" },
] as const;

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
          { path: "odzywianie/posilki", Component: OdzywianiePage },
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
