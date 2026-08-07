import { expect, openRootineRoute, test } from "./fixtures";

const NOTES_STORAGE_KEY = "rootine.notes-workspace.v1";

test.describe("Calm Layered Workspace", { tag: "@shared" }, () => {
  test("nutrition uses soft meal sections and consistent summary cards", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/odzywianie");

    const mealCards = page.locator(".nutrition-meal-card");
    const summaryCards = page.locator(".nutrition-summary-card");
    await expect(mealCards).toHaveCount(4);
    await expect(summaryCards).toHaveCount(3);

    for (const collection of [mealCards, summaryCards]) {
      const styles = await collection.evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderWidth: Number.parseFloat(style.borderTopWidth),
          radius: Number.parseFloat(style.borderTopLeftRadius),
          shadow: style.boxShadow,
        };
      }));

      for (const style of styles) {
        expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(style.borderWidth).toBeGreaterThanOrEqual(1);
        expect(style.radius).toBeGreaterThanOrEqual(12);
        expect(style.shadow).toBe("none");
      }
    }
  });

  test("note cards stay equal while only their content area scrolls", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/dzisiaj");
    await page.evaluate(({ key, longBody }) => {
      const now = "2026-08-05T10:00:00.000Z";
      window.localStorage.setItem(key, JSON.stringify({
        version: 1,
        updatedAt: now,
        lists: [{ id: "list-test", name: "Test", createdAt: now }],
        notes: [
          {
            id: "note-long",
            title: "Długa notatka",
            body: longBody,
            kind: "text",
            items: [],
            tags: ["test"],
            listId: "list-test",
            color: "blue",
            pinned: false,
            archived: false,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "note-short",
            title: "Krótka notatka",
            body: "Jedno zdanie.",
            kind: "text",
            items: [],
            tags: [],
            listId: "list-test",
            color: "amber",
            pinned: false,
            archived: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }));
    }, {
      key: NOTES_STORAGE_KEY,
      longBody: Array.from({ length: 32 }, (_, index) => `Wiersz ${index + 1}: spokojna, długa treść notatki.`).join("\n"),
    });

    await openRootineRoute(page, "/notatki");
    const cards = page.locator(".notes-grid--cards .notes-card");
    await expect(cards).toHaveCount(2);

    const heights = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

    const longCard = cards.filter({ hasText: "Długa notatka" });
    const scrollArea = longCard.locator(".notes-card__content-scroll");
    const footer = longCard.locator(".notes-card__footer");
    await expect.poll(() => scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    const footerBefore = await footer.boundingBox();
    await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const footerAfter = await footer.boundingBox();
    expect(footerBefore).not.toBeNull();
    expect(footerAfter).not.toBeNull();
    expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Widok listy" }).click();
    await expect(page.locator(".notes-grid--list")).toBeVisible();
    const listPreview = page.locator(".notes-grid--list .notes-card__body p").first();
    await expect(listPreview).toHaveCSS("-webkit-line-clamp", "2");
    await expect(page.locator(".notes-grid--list .notes-card__content-scroll").first()).toHaveCSS("overflow-y", "hidden");
  });

  test("sport history shows ten workouts per page and exposes the remaining entries", async ({ rootinePage: page }) => {
    await openRootineRoute(page, "/sport?widok=history");

    const entries = page.locator(".sport-history-entry");
    const pagination = page.getByRole("navigation", { name: "Paginacja" });
    await expect(entries).toHaveCount(10);
    await expect(pagination).toContainText("Strona 1 z 2");

    await pagination.getByRole("button", { name: "Następna" }).click();
    await expect(entries).toHaveCount(4);
    await expect(pagination).toContainText("Strona 2 z 2");
    await expect(pagination.getByRole("button", { name: "Poprzednia" })).toBeEnabled();
  });
});
