import { describe, expect, it } from "vitest";
import { createDefaultAssistantSettings } from "../config/assistant-settings";
import { canUseAssistantTool } from "./permissions";

describe("assistant permissions", () => {
  it("denies sensitive scopes by default", () => {
    const settings = createDefaultAssistantSettings();
    expect(canUseAssistantTool(settings, ["notes"], "read").allowed).toBe(false);
    expect(canUseAssistantTool(settings, ["finance"], "confirmed_write").allowed).toBe(false);
    expect(canUseAssistantTool(settings, ["body_data"], "read").allowed).toBe(false);
  });

  it("never allows destructive tools", () => {
    const settings = createDefaultAssistantSettings();
    expect(canUseAssistantTool(settings, ["tasks"], "destructive")).toMatchObject({
      allowed: false,
      code: "PERMISSION",
    });
  });

  it("distinguishes read and write permissions", () => {
    const settings = createDefaultAssistantSettings();
    settings.permissions.tasks.write = false;
    expect(canUseAssistantTool(settings, ["tasks"], "read").allowed).toBe(true);
    expect(canUseAssistantTool(settings, ["tasks"], "reversible_write").allowed).toBe(false);
  });

  it("requires read provenance permission for every write", () => {
    const settings = createDefaultAssistantSettings();
    settings.permissions.tasks = { read: false, write: true };
    expect(canUseAssistantTool(settings, ["tasks"], "reversible_write")).toMatchObject({
      allowed: false,
      code: "PERMISSION",
    });
  });

  it("honors the panels feature flag while keeping the recovery scope writable", () => {
    const settings = createDefaultAssistantSettings();
    settings.assistantPanelsEnabled = false;
    expect(canUseAssistantTool(settings, ["presentation"], "read").allowed).toBe(false);
    expect(canUseAssistantTool(settings, ["presentation"], "reversible_write").allowed).toBe(true);
  });
});
