import { lazy } from "react";
import { createBrowserRouter, redirect } from "react-router";
import Layout from "./layout/Layout";
import { RouteErrorState, RouteLoadingState, RouteNotFoundState } from "./RouteStates";
import { ROUTE_LOADERS } from "./routePrefetch";

/*
 * The loaders come from routePrefetch.ts so that a route and its hover-prefetch
 * cannot drift apart: there is one dynamic import per page, used both to render
 * it and to warm it.
 */
const DzisiajPage = lazy(ROUTE_LOADERS["/dzisiaj"]);
const ZadaniaPage = lazy(ROUTE_LOADERS["/zadania"]);
const KalendarzPage = lazy(ROUTE_LOADERS["/kalendarz"]);
const NotatkiPage = lazy(ROUTE_LOADERS["/notatki"]);
const CelePage = lazy(ROUTE_LOADERS["/cele"]);
const CelSzczegolyPage = lazy(ROUTE_LOADERS["/cele/:goalId"]);
const SportPage = lazy(ROUTE_LOADERS["/sport"]);
const OdzywianiePage = lazy(ROUTE_LOADERS["/odzywianie"]);
const PracaPage = lazy(ROUTE_LOADERS["/praca"]);
const SprawyPage = lazy(ROUTE_LOADERS["/sprawy"]);
const PodrozePage = lazy(ROUTE_LOADERS["/podroze"]);

/**
 * Reviewable inventory of every URL declared by the router. Runtime layout behavior
 * stays generic in ModuleShell/PageShell; this registry documents coverage without
 * becoming a second routing source of truth.
 */
export const ROUTE_LAYOUT_AUDIT = [
  { path: "/", component: "redirect", moduleId: null, redirectTo: "/dzisiaj", width: "—", moduleSidebar: false, h1: "—", layout: "index redirect" },
  { path: "/dzisiaj", component: "DzisiajPage", moduleId: "today", width: "standard", moduleSidebar: false, h1: "route", layout: "dashboard" },
  {
    path: "/zadania", component: "ZadaniaPage", moduleId: "tasks", width: "fluid", moduleSidebar: true, h1: "route", layout: "list + detail",
    queryViews: ["widok=jutro", "widok=7dni", "widok=30dni", "widok=bezterminu", "widok=wszystkie", "widok=nawyki", "widok=podsumowanie", "widok=ukonczone", "widok=kosz", "zadanie=<taskId>"],
  },
  {
    path: "/kalendarz", component: "KalendarzPage", moduleId: "tasks", width: "fluid", moduleSidebar: true, h1: "route", layout: "calendar",
    queryViews: ["widok=jutro", "widok=7dni", "widok=30dni", "widok=bezterminu", "widok=wszystkie", "zadanie=<taskId>"],
  },
  {
    path: "/notatki", component: "NotatkiPage", moduleId: "notes", width: "standard", moduleSidebar: true, h1: "route", layout: "collection + editor",
    queryViews: ["widok=pinned", "widok=archive", "widok=list:<listId>", "widok=tag:<tagName>"],
  },
  {
    path: "/cele", component: "CelePage", moduleId: "goals", width: "standard", moduleSidebar: true, h1: "route", layout: "collection + detail",
    queryViews: ["widok=overview", "widok=week", "widok=all", "widok=active", "widok=ontrack", "widok=risk", "widok=paused", "widok=completed", "widok=planned", "widok=archived", "widok=category:<categoryId>", "uklad=list|grid", "sort=priority|due|progress|updated|name", "zakres=<goalId>", "cel=<goalId>"],
  },
  { path: "/cele/:goalId", component: "CelSzczegolyPage", moduleId: "goals", width: "fluid", moduleSidebar: false, h1: "route", layout: "detail" },
  {
    path: "/sport", component: "SportPage", moduleId: "sport", width: "wide", moduleSidebar: true, h1: "route", layout: "planner + detail",
    queryViews: ["widok=cycle", "widok=templates", "widok=exercises", "widok=history", "widok=analysis", "tydzien=<number>"],
  },
  { path: "/odzywianie", component: "OdzywianiePage", moduleId: "nutrition", width: "wide", moduleSidebar: true, h1: "route", layout: "daily register" },
  { path: "/odzywianie/posilki", component: "OdzywianiePage", moduleId: "nutrition", width: "wide", moduleSidebar: true, h1: "route", layout: "meal library + editor" },
  { path: "/odzywianie/analiza", component: "OdzywianiePage", moduleId: "nutrition", width: "wide", moduleSidebar: true, h1: "route", layout: "analysis" },
  {
    path: "/praca", component: "PracaPage", moduleId: "work", width: "wide", moduleSidebar: true, h1: "route", layout: "workspace + detail",
    queryViews: ["widok=jutro", "widok=week", "widok=bezterminu", "widok=active", "widok=unassigned", "widok=archive", "firma=<companyId>", "projekt=<projectId>", "q=<query>"],
  },
  {
    path: "/sprawy", component: "SprawyPage", moduleId: "affairs", width: "wide", moduleSidebar: true, h1: "route", layout: "overview + agenda + registers + workspaces",
    queryViews: ["widok=overview", "widok=today", "widok=week", "widok=all", "widok=finances", "widok=finance-one-time", "widok=finance-recurring", "widok=documents", "widok=vehicles", "widok=health", "widok=jdg"],
  },
  { path: "/podroze", component: "PodrozePage", moduleId: "travel", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier" },
  { path: "/podroze/:tripId", component: "PodrozePage", moduleId: "travel", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier detail" },
  { path: "/travel/overview", component: "PodrozePage", moduleId: "travel", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier" },
  { path: "/travel/:tripId/:travelSection", component: "PodrozePage", moduleId: "travel", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier detail" },
  { path: "/travel/:tripId", component: "PodrozePage", moduleId: "travel", width: "wide", moduleSidebar: true, h1: "route", layout: "dossier detail" },
  { path: "/biuro", component: "redirect", moduleId: null, redirectTo: "/praca", width: "—", moduleSidebar: false, h1: "—", layout: "legacy redirect" },
  { path: "/finanse", component: "redirect", moduleId: null, redirectTo: "/sprawy?widok=finances", width: "—", moduleSidebar: false, h1: "—", layout: "legacy redirect" },
  { path: "/jdg", component: "redirect", moduleId: null, redirectTo: "/sprawy?widok=jdg", width: "—", moduleSidebar: false, h1: "—", layout: "legacy redirect" },
  { path: "*", component: "RouteNotFoundState", moduleId: null, width: "route state", moduleSidebar: false, h1: "route", layout: "error state" },
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
          { path: "odzywianie/analiza", Component: OdzywianiePage },
          { path: "praca",         Component: PracaPage },
          { path: "sprawy",        Component: SprawyPage },
          { path: "podroze",       Component: PodrozePage },
          { path: "podroze/:tripId", Component: PodrozePage },
          { path: "travel/overview", Component: PodrozePage },
          { path: "travel/:tripId/:travelSection", Component: PodrozePage },
          { path: "travel/:tripId", Component: PodrozePage },
          // Legacy bookmarks only: these are intentionally absent from APP_MODULES/navigation.
          { path: "biuro",         loader: () => redirect("/praca") },
          { path: "finanse",       loader: () => redirect("/sprawy?widok=finances") },
          { path: "jdg",           loader: () => redirect("/sprawy?widok=jdg") },
          { path: "*",             Component: RouteNotFoundState },
        ],
      },
    ],
  },
]);
