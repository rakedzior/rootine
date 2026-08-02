import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { AppThemePreference } from "../theme/appTheme";
import { ThemeSettings } from "./ThemeSettings";

function ThemeSettingsFixture() {
  const [theme, setTheme] = useState<AppThemePreference>("rootine-cobalt");
  return (
    <ThemeSettings
      idPrefix="test"
      value={theme}
      onChange={setTheme}
    />
  );
}

describe("ThemeSettings", () => {
  it("offers six named themes plus system mode and updates the selected radio", async () => {
    const user = userEvent.setup();
    render(<ThemeSettingsFixture />);

    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("radio", { name: /Rootine Midnight Instrument/ })).toHaveAttribute("aria-checked", "true");

    const warmTheme = screen.getByRole("radio", { name: /Rootine Warm Linen/ });
    await user.click(warmTheme);

    expect(warmTheme).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Rootine Midnight Instrument/ })).toHaveAttribute("aria-checked", "false");
  });
});
