import { describe, expect, it } from "vitest";
import { buildRootineAssistantInstructions } from "./system-instructions";

describe("Rootine Assistant system instructions", () => {
  it("includes current context, truth policy, and configured voice privacy", () => {
    const prompt = buildRootineAssistantInstructions({
      module: "work",
      timezone: "Europe/Warsaw",
      locale: "pl-PL",
      privacyMode: true,
    }, ["work"], "silent_sensitive");
    expect(prompt).toContain("success=true");
    expect(prompt).toContain("silent_sensitive");
    expect(prompt).toContain('"privacyMode":true');
    expect(prompt).toContain("Nie generuj HTML");
  });
});
