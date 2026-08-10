import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { WorkWorkspace } from "../data/workWorkspace";
import Praca from "./Praca";

const testState = vi.hoisted(() => ({
  saveWorkspace: vi.fn((_workspace: WorkWorkspace) => true),
  flushWrites: vi.fn(async () => undefined),
}));

vi.mock("../data/workWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/workWorkspace")>();
  return {
    ...actual,
    loadWorkWorkspace: () => actual.createDefaultWorkWorkspace(),
    saveWorkWorkspace: testState.saveWorkspace,
  };
});

vi.mock("../data/localRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/localRepository")>();
  return {
    ...actual,
    flushLocalWorkspaceWrites: testState.flushWrites,
    subscribeToLocalWorkspace: () => () => undefined,
  };
});

function openCompanyEditor() {
  const addMenuTrigger = document.querySelector<HTMLButtonElement>('button[aria-controls="work-add-menu"]');
  expect(addMenuTrigger).not.toBeNull();
  fireEvent.click(addMenuTrigger!);
  fireEvent.click(screen.getByText("Dodaj firmę"));
}

describe("Praca persistence lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testState.saveWorkspace.mockClear();
    testState.flushWrites.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("flushes the latest quick task when SPA navigation unmounts Praca before 260 ms", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
      { path: "/dzisiaj", element: <div>Dzisiaj</div> },
    ], { initialEntries: ["/praca"] });

    render(<RouterProvider router={router} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    testState.saveWorkspace.mockClear();
    testState.flushWrites.mockClear();

    fireEvent.change(screen.getByLabelText("Nazwa nowego zadania w pracy"), {
      target: { value: "Zapisz mnie przed nawigacją" },
    });
    fireEvent.click(screen.getByLabelText("Dodaj zadanie"));

    expect(testState.saveWorkspace).not.toHaveBeenCalled();

    await act(async () => {
      await router.navigate("/dzisiaj");
    });

    expect(screen.getByText("Dzisiaj")).toBeInTheDocument();
    expect(testState.saveWorkspace).toHaveBeenCalledTimes(1);
    const savedWorkspace = testState.saveWorkspace.mock.calls[0]?.[0];
    expect(savedWorkspace).toBeDefined();
    expect(savedWorkspace?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Zapisz mnie przed nawigacją" }),
    ]));
    expect(testState.flushWrites).toHaveBeenCalledTimes(1);
  });

  it("replaces stale company and project parameters with the canonical today workspace", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca?firma=missing-company&projekt=missing-project&q=brief"] });

    render(<RouterProvider router={router} />);
    await act(async () => undefined);

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("firma")).toBeNull();
    expect(params.get("projekt")).toBeNull();
    expect(params.get("widok")).toBeNull();
    expect(params.get("q")).toBe("brief");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getAllByText("Dzisiaj").length).toBeGreaterThan(0);
  });

  it("keeps a valid project and replaces a stale company with its canonical owner", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca?firma=missing-company&projekt=project-redesign"] });

    render(<RouterProvider router={router} />);
    await act(async () => undefined);

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("firma")).toBe("company-studio");
    expect(params.get("projekt")).toBe("project-redesign");
    expect(params.get("widok")).toBe("project");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getAllByText("Nowa strona").length).toBeGreaterThan(0);
  });

  it("falls back from a stale project to a valid requested company", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca?firma=company-atlas&projekt=missing-project"] });

    render(<RouterProvider router={router} />);
    await act(async () => undefined);

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("firma")).toBe("company-atlas");
    expect(params.get("projekt")).toBeNull();
    expect(params.get("widok")).toBe("company");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getAllByText("Atlas").length).toBeGreaterThan(0);
  });

  it("keeps a browser POP as the URL source of truth instead of restoring stale local state", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca", "/praca?widok=week"], initialIndex: 1 });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: "Ten tydzień" })).toBeInTheDocument();

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.search).toBe("");
    expect(screen.getByRole("heading", { name: "Dzisiaj w pracy" })).toBeInTheDocument();
  });

  it("blocks SPA navigation for a dirty editor and proceeds only after explicit discard", async () => {
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
      { path: "/dzisiaj", element: <div>Dzisiaj route</div> },
    ], { initialEntries: ["/praca"] });
    render(<RouterProvider router={router} />);

    openCompanyEditor();
    fireEvent.change(screen.getByLabelText("Nazwa"), { target: { value: "Firma w szkicu" } });

    expect(window.sessionStorage.getItem("rootine.work-editor-draft.company.add.new")).toContain("Firma w szkicu");

    await act(async () => {
      await router.navigate("/dzisiaj");
    });

    expect(screen.getByText("Odrzucić niezapisane zmiany?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Firma w szkicu")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Kontynuuj edycję"));
    expect(screen.queryByText("Odrzucić niezapisane zmiany?")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Firma w szkicu")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("/dzisiaj");
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Odrzuć zmiany"));
      await Promise.resolve();
    });

    expect(screen.getByText("Dzisiaj route")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("rootine.work-editor-draft.company.add.new")).toBeNull();
  });

  it("recovers a session draft and clears it after a successful submit", async () => {
    const draftKey = "rootine.work-editor-draft.company.add.new";
    window.sessionStorage.setItem(draftKey, JSON.stringify({
      name: "Odzyskana firma",
      description: "Opis odzyskany po przeładowaniu",
    }));
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca"] });
    render(<RouterProvider router={router} />);

    openCompanyEditor();

    expect(screen.getByDisplayValue("Odzyskana firma")).toBeInTheDocument();
    expect(screen.getByLabelText("Opis (opcjonalnie)")).toHaveValue("Opis odzyskany po przeładowaniu");

    const editorForm = document.getElementById("work-editor-form");
    expect(editorForm).not.toBeNull();
    fireEvent.submit(editorForm!);

    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
    expect(screen.queryByDisplayValue("Odzyskana firma")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    const savedWorkspace = testState.saveWorkspace.mock.calls.at(-1)?.[0];
    expect(savedWorkspace?.companies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Odzyskana firma", description: "Opis odzyskany po przeładowaniu" }),
    ]));
  });

  it("isolates new-project drafts by their company context", async () => {
    const studioContext = encodeURIComponent(JSON.stringify(["company-studio"]));
    window.sessionStorage.setItem(`rootine.work-editor-draft.project.add.new.${studioContext}`, JSON.stringify({
      name: "Projekt tylko dla Studio",
      companyId: "company-studio",
    }));
    const router = createMemoryRouter([
      { path: "/praca", element: <Praca /> },
    ], { initialEntries: ["/praca?firma=company-atlas"] });
    render(<RouterProvider router={router} />);
    await act(async () => undefined);

    const addMenuTrigger = document.querySelector<HTMLButtonElement>('button[aria-controls="work-add-menu"]');
    expect(addMenuTrigger).not.toBeNull();
    fireEvent.click(addMenuTrigger!);
    fireEvent.click(screen.getByText("Dodaj projekt"));

    const dialog = screen.getByRole("dialog", { name: "Nowy projekt" });
    expect(within(dialog).getByLabelText("Firma")).toHaveTextContent("Atlas");
    expect(within(dialog).getByLabelText("Nazwa")).not.toHaveValue("Projekt tylko dla Studio");

    fireEvent.change(within(dialog).getByLabelText("Nazwa"), { target: { value: "Projekt Atlas" } });
    const atlasContext = encodeURIComponent(JSON.stringify(["company-atlas"]));
    expect(window.sessionStorage.getItem(`rootine.work-editor-draft.project.add.new.${atlasContext}`)).toContain("Projekt Atlas");
  });
});
