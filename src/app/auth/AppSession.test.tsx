import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TASK_STORAGE_KEY, type TaskWorkspace } from "../data/taskWorkspace";
import { AppSessionProvider, useAppSession } from "./AppSession";
import { deactivateEphemeralTestWorkspaceForTests } from "./ephemeralWorkspace";

function SessionProbe() {
  const session = useAppSession();
  return (
    <>
      <output>
        {session.isTestAccount ? "konto testowe" : session.isLocalAccount ? "dane lokalne" : "zwykła sesja"}
      </output>
      <button type="button" onClick={session.enterLocalAccount}>wejdź lokalnie</button>
      <button type="button" onClick={session.exitToAuthScreen}>wyjdź</button>
    </>
  );
}

describe("AppSessionProvider", () => {
  afterEach(() => {
    cleanup();
    deactivateEphemeralTestWorkspaceForTests();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("re-enters a fresh test account after a hard-refresh-equivalent remount", () => {
    window.history.replaceState(null, "", "/?konto=testowe");
    const firstRender = render(<AppSessionProvider><SessionProbe /></AppSessionProvider>);

    expect(screen.getByText("konto testowe")).toBeInTheDocument();
    const initial = window.localStorage.getItem(TASK_STORAGE_KEY);
    const edited = JSON.parse(initial ?? "null") as TaskWorkspace;
    edited.tasks = [];
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(edited));

    firstRender.unmount();
    deactivateEphemeralTestWorkspaceForTests();
    render(<AppSessionProvider><SessionProbe /></AppSessionProvider>);

    expect(screen.getByText("konto testowe")).toBeInTheDocument();
    expect(window.localStorage.getItem(TASK_STORAGE_KEY)).toBe(initial);
  });

  it("opens local data and returns to the auth screen", async () => {
    const user = userEvent.setup();
    render(<AppSessionProvider><SessionProbe /></AppSessionProvider>);

    await user.click(screen.getByRole("button", { name: "wejdź lokalnie" }));
    expect(screen.getByText("dane lokalne")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dzisiaj");
    expect(window.location.search).toBe("?konto=lokalne");

    await user.click(screen.getByRole("button", { name: "wyjdź" }));
    expect(screen.getByText("zwykła sesja")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });
});
