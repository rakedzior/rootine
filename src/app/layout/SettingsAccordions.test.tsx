import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SunMedium } from "lucide-react";
import { AppExperienceProviders } from "../experience/preferences";
import { SettingsAccordions } from "./SettingsAccordions";

function renderSettings() {
  return render(
    <AppExperienceProviders>
      <SettingsAccordions
        idPrefix="test-settings"
        isSidebarCollapsed={false}
        onToggleSidebar={vi.fn()}
        weatherStatus="ready"
        weatherLabel="Słonecznie"
        weatherIcon={SunMedium}
        onRefreshWeather={vi.fn()}
        comfortContent={<div>Komfort testowy</div>}
        themeContent={<div>Motyw testowy</div>}
        modulesContent={<div>Moduły testowe</div>}
        onOpenHelp={vi.fn()}
      />
    </AppExperienceProviders>,
  );
}

describe("SettingsAccordions", () => {
  it("starts collapsed and keeps only one section open", async () => {
    const user = userEvent.setup();
    renderSettings();

    const panelTrigger = screen.getByRole("button", { name: "Panel: Panel boczny i lokalizacja pogody" });
    const comfortTrigger = screen.getByRole("button", { name: /Komfort interfejsu/ });
    const panel = document.getElementById("test-settings-panel-panel");
    const comfort = document.getElementById("test-settings-comfort-panel");

    expect(panelTrigger).toHaveAttribute("aria-expanded", "false");
    expect(comfortTrigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(comfort).toHaveAttribute("aria-hidden", "true");

    await user.click(panelTrigger);
    expect(panelTrigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");

    await user.click(comfortTrigger);
    expect(panelTrigger).toHaveAttribute("aria-expanded", "false");
    expect(comfortTrigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(comfort).toHaveAttribute("aria-hidden", "false");

    await user.click(comfortTrigger);
    expect(comfortTrigger).toHaveAttribute("aria-expanded", "false");
  });
});
