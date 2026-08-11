import { expect, openRootineRoute, test } from "./fixtures";

test.describe("taxonomy edit mode", { tag: "@desktop" }, () => {
  test("reveals row actions only after entering edit mode", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/zadania?widok=wszystkie");
    const tasksSidebar = page.getByRole("complementary", { name: "Widoki i listy zadań" });

  await tasksSidebar.getByRole("button", { name: "Listy", exact: true }).click();
    await expect(tasksSidebar.locator('button[aria-label^="Edytuj listę "]')).toHaveCount(0);
    await tasksSidebar.getByRole("button", { name: "Edytuj listy" }).click();
    await expect(tasksSidebar.locator('button[aria-label^="Edytuj listę "]')).not.toHaveCount(0);

  await tasksSidebar.getByRole("button", { name: "Tagi", exact: true }).click();
    await expect(tasksSidebar.locator('button[aria-label^="Edytuj tag #"]')).toHaveCount(0);
    await tasksSidebar.getByRole("button", { name: "Edytuj tagi" }).click();
    await expect(tasksSidebar.locator('button[aria-label^="Edytuj tag #"]')).not.toHaveCount(0);

    await openRootineRoute(page, "/cele");
    const goalsSidebar = page.getByRole("complementary", { name: "Widoki i kategorie celów" });
    await goalsSidebar.getByRole("button", { name: "Kategorie", exact: true }).click();
    await expect(goalsSidebar.locator('button[aria-label^="Edytuj kategorię "]')).toHaveCount(0);
    await goalsSidebar.getByRole("button", { name: "Edytuj kategorie" }).click();
    await expect(goalsSidebar.locator('button[aria-label^="Edytuj kategorię "]')).not.toHaveCount(0);

    await openRootineRoute(page, "/notatki");
    const notesSidebar = page.getByRole("complementary", { name: "Widoki notatek" });
    await expect(notesSidebar.locator('button[aria-label^="Zmień nazwę listy "]')).toHaveCount(0);
    await notesSidebar.getByRole("button", { name: "Edytuj listy" }).click();
    await expect(notesSidebar.locator('button[aria-label^="Zmień nazwę listy "]')).not.toHaveCount(0);

    await notesSidebar.getByRole("button", { name: /^Tagi/ }).click();
    await expect(notesSidebar.getByPlaceholder("Filtruj tagi")).toHaveCount(0);
    await notesSidebar.getByRole("button", { name: "Szukaj tagu" }).click();
    await expect(notesSidebar.getByPlaceholder("Filtruj tagi")).toBeVisible();
    await expect(notesSidebar.locator('button[aria-label^="Zmień nazwę tagu "]')).toHaveCount(0);
    await notesSidebar.getByRole("button", { name: "Edytuj tagi" }).click();
    await expect(notesSidebar.locator('button[aria-label^="Zmień nazwę tagu "]')).not.toHaveCount(0);
  });
});
