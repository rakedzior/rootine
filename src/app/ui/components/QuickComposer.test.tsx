import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QuickComposer } from "./QuickComposer";
import uiCss from "../../../styles/ui.css?raw";

afterEach(cleanup);

describe("QuickComposer", () => {
  it("keeps editor and actions in one labelled form with a named property group", () => {
    render(
      <QuickComposer
        aria-label="Dodaj zadanie"
        density="compact"
        leadingAction={<button type="button" aria-label="Rozwiń dodawanie">+</button>}
        editor={<input aria-label="Nazwa zadania" />}
        propertyControls={<button type="button">Priorytet</button>}
        scheduleControl={<button type="button">Termin</button>}
        submitAction={<button type="submit">Dodaj</button>}
      />,
    );

    const form = screen.getByRole("form", { name: "Dodaj zadanie" });
    expect(form).toHaveClass("ui-quick-composer--compact");
    expect(within(form).getByRole("group", { name: "Właściwości nowego elementu" })).toBeInTheDocument();
    expect(within(form).getByRole("textbox", { name: "Nazwa zadania" })).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Dodaj" })).toHaveAttribute("type", "submit");
  });

  it("owns the coarse-pointer 44px target contract without changing desktop density", () => {
    expect(uiCss).toContain("@media (pointer: coarse)");
    expect(uiCss).toContain(".ui-quick-composer--compact .ui-property-menu__trigger");
    expect(uiCss).toContain(".ui-quick-composer--compact .ui-date-trigger--compact");
    expect(uiCss).toContain(".ui-quick-composer--compact .ui-time-picker--compact .ui-time-picker__input");
    expect(uiCss).toContain(".ui-quick-composer--compact .ui-time-picker--compact .ui-time-picker__list-trigger");
    expect(uiCss).toContain("height: var(--component-option-height-touch)");
    expect(uiCss).toContain(".ui-quick-composer__properties > button { min-height: var(--control-height-sm)");
    expect(uiCss).toContain(".ui-date-trigger--compact { height: var(--control-height-sm)");
  });

  it("reflows from its workspace width when a docked detail panel narrows the main column", () => {
    expect(uiCss).toContain("@container workspace (max-width: 760px)");
    expect(uiCss).toMatch(
      /@container workspace \(max-width: 760px\)[\s\S]*?\.ui-quick-composer\s*\{[^}]*display: grid;[^}]*grid-template-columns: auto minmax\(0, 1fr\)/,
    );
    expect(uiCss).toMatch(
      /@container workspace \(max-width: 760px\)[\s\S]*?\.ui-quick-composer__actions\s*\{[^}]*grid-column: 1 \/ -1;[^}]*width: 100%/,
    );
    expect(uiCss).toMatch(
      /@container workspace \(max-width: 760px\)[\s\S]*?\.ui-quick-composer__properties\s*\{[^}]*flex-wrap: wrap/,
    );
  });
});
