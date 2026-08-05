import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContentHeader } from "./ContentHeader";

afterEach(cleanup);

describe("ContentHeader heading semantics", () => {
  it("renders the route title as the page h1 by default", () => {
    render(<ContentHeader title="Zadania" />);

    expect(screen.getByRole("heading", { level: 1, name: "Zadania" })).toBeInTheDocument();
  });

  it("can keep a visual-only header out of the document outline", () => {
    render(<ContentHeader title="Filtr" headingLevel={false} />);

    expect(screen.queryByRole("heading", { name: "Filtr" })).not.toBeInTheDocument();
  });
});
