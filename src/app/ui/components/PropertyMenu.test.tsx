import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Flag } from "lucide-react";
import { PropertyMenu } from "./PropertyMenu";

afterEach(cleanup);

describe("PropertyMenu", () => {
  it("exposes an icon trigger, radio semantics, keyboard navigation and focus restoration", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PropertyMenu
        value="medium"
        ariaLabel="Priorytet zadania"
        onChange={onChange}
        options={[
          { value: "low", label: "Niski", leadingIcon: <Flag /> },
          { value: "medium", label: "Średni", leadingIcon: <Flag />, meta: "2" },
          { value: "high", label: "Wysoki", leadingIcon: <Flag />, tone: "danger" },
        ]}
      >
        <Flag aria-hidden="true" />
      </PropertyMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Priorytet zadania" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const selected = screen.getByRole("menuitemradio", { name: /Średni.*2/ });
    expect(selected).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(selected).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("high");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
