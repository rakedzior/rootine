import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissLocalPersistenceIssue,
  listLocalPersistenceIssues,
  writeLocalWorkspace,
} from "../data/localRepository";
import { RecoveryCenterButton } from "./RecoveryCenter";

describe("Recovery Center", () => {
  beforeEach(() => {
    window.localStorage.clear();
    listLocalPersistenceIssues().forEach((issue) => dismissLocalPersistenceIssue(issue.id));
  });

  it("surfaces an ordinary quota failure and lets the user retry the retained draft", async () => {
    const key = "routine.sidebar.modules";
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function mockedSetItem(
      this: Storage,
      itemKey,
      value,
    ) {
      if (itemKey === key) throw new DOMException("full", "QuotaExceededError");
      return originalSetItem.call(this, itemKey, value);
    });
    expect(writeLocalWorkspace(key, { version: 1, modules: ["today"] })).toBe(false);
    setItem.mockRestore();

    const user = userEvent.setup();
    render(<RecoveryCenterButton />);
    await user.click(screen.getByRole("button", { name: /Kopia i odzyskiwanie · 1/ }));

    expect(screen.getByRole("heading", { name: "Zmiany wymagające uwagi" })).toBeInTheDocument();
    expect(screen.getByText("Brak miejsca")).toBeInTheDocument();
    expect(screen.getByText(key)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ponów zapis" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Zmiany wymagające uwagi" })).not.toBeInTheDocument();
    });
    expect(JSON.parse(window.localStorage.getItem(key) ?? "{}")).toEqual({
      version: 1,
      modules: ["today"],
    });
  });
});
