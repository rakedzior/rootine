import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage } from "./LegalPage";

describe("LegalPage", () => {
  it("renders the terms document with a public way back to Rootine", () => {
    render(<LegalPage document="terms" />);

    expect(screen.getByRole("heading", { name: "Regulamin Rootine" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("wersja robocza");
    expect(screen.getByRole("link", { name: "Wróć do Rootine" })).toHaveAttribute("href", "/");
  });

  it("renders the privacy document", () => {
    render(<LegalPage document="privacy" />);

    expect(screen.getByRole("heading", { name: "Polityka prywatności Rootine" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Jakie dane mogą być przetwarzane" })).toBeInTheDocument();
  });
});
