import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { AppThemeId } from "../theme/appTheme";
import { ThemeSettings } from "./ThemeSettings";

function ThemeSettingsFixture() {
  const [theme, setTheme] = useState<AppThemeId>("onyx-ebony-stone");
  return (
    <ThemeSettings
      idPrefix="test"
      value={theme}
      onChange={setTheme}
    />
  );
}

describe("ThemeSettings", () => {
  it("offers five named themes and updates the selected radio", async () => {
    const user = userEvent.setup();
    render(<ThemeSettingsFixture />);

    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: /Onyx · Ebony · Stone/ })).toHaveAttribute("aria-checked", "true");

    const puttyTheme = screen.getByRole("radio", { name: /Putty · Natural Oak · Calacatta/ });
    await user.click(puttyTheme);

    expect(puttyTheme).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Onyx · Ebony · Stone/ })).toHaveAttribute("aria-checked", "false");
  });
});
