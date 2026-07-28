import { beforeEach, describe, expect, it } from "vitest";
import {
  JDG_PROFILE_TEMPLATE_ID,
  JDG_STORAGE_KEY,
  applyJdgMonthTemplate,
  createDefaultJdgWorkspace,
  createJdgMonthForWorkspace,
  createJdgTemplateFromMonth,
  deleteJdgMonthItem,
  isJdgWorkspace,
  loadJdgWorkspaceResult,
  resetJdgMonth,
  saveJdgWorkspace,
  undoJdgAuditEvent,
  updateJdgTaxProfile,
  type JdgChecklistItem,
  type JdgWorkspace,
} from "./jdgWorkspace";

const NOW = "2026-07-28T10:00:00.000Z";

function customItem(id = "custom-quarterly-review"): JdgChecklistItem {
  return {
    id,
    label: "Sprawdziłem rozliczenie kwartalne",
    group: "control",
    required: false,
    dueDay: 25,
    done: false,
    doneAt: "",
  };
}

describe("JDG workspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
    loadJdgWorkspaceResult();
  });

  it("starts unconfigured and builds a neutral profile template", () => {
    const workspace = createDefaultJdgWorkspace(new Date(2026, 6, 28, 12));
    const profileTemplate = workspace.templates.find((template) => (
      template.id === JDG_PROFILE_TEMPLATE_ID
    ));
    const labels = profileTemplate?.items.map((item) => item.label).join(" ") ?? "";

    expect(workspace.version).toBe(2);
    expect(workspace.taxProfile).toMatchObject({
      taxForm: "unconfigured",
      vatStatus: "unconfigured",
      vatCadence: null,
      zusScheme: "unconfigured",
      accountingMode: "unconfigured",
    });
    expect(labels).not.toContain("PIT-28");
    expect(labels).not.toContain("JPK_V7M");
    expect(labels).toContain("Sprawdziłem obowiązek");
    expect(isJdgWorkspace(workspace)).toBe(true);
  });

  it("deeply migrates the stored version-one workspace without changing its key or months", () => {
    const legacyMonth = {
      month: "2026-07",
      note: "Korekta do wyjaśnienia",
      items: [{
        id: "settlements-pit",
        label: "Opłaciłem PIT-28",
        group: "settlements",
        done: true,
        doneAt: "2026-07-20T08:00:00.000Z",
        required: true,
        dueDay: 20,
      }],
    };
    window.localStorage.setItem(JDG_STORAGE_KEY, JSON.stringify({
      version: 1,
      months: [legacyMonth],
    }));

    const result = loadJdgWorkspaceResult();

    expect(result.status).toBe("migrated");
    expect(result.workspace.months).toEqual([legacyMonth]);
    expect(result.workspace.defaultTemplateId).toBe("legacy-monthly");
    expect(result.workspace.templates.find((template) => template.id === "legacy-monthly")?.items[0])
      .toMatchObject({ label: "Opłaciłem PIT-28", dueDay: 20 });
    expect(result.workspace.taxProfile.taxForm).toBe("unconfigured");
    expect(result.workspace.history.at(-1)?.type).toBe("workspace-migrated");
    expect(saveJdgWorkspace(result.workspace)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(JDG_STORAGE_KEY) ?? "{}").version).toBe(2);
  });

  it("routes malformed nested legacy data through local recovery instead of accepting it", () => {
    window.localStorage.setItem(JDG_STORAGE_KEY, JSON.stringify({
      version: 1,
      months: [{
        month: "2026-07",
        note: "",
        items: [{
          id: "bad-due-day",
          label: "Nieprawidłowy termin",
          group: "settlements",
          done: false,
          doneAt: "",
          required: true,
          dueDay: 40,
        }],
      }],
    }));

    const result = loadJdgWorkspaceResult();

    expect(result.status).toBe("corrupt");
    expect(result.recoveryId).toBeTruthy();
    expect(result.workspace.version).toBe(2);
  });

  it("regenerates only the profile template and can undo the profile change", () => {
    const workspace = createDefaultJdgWorkspace(new Date(2026, 6, 28, 12));
    const configured = updateJdgTaxProfile(workspace, {
      taxForm: "linear",
      vatStatus: "active",
      vatCadence: "quarterly",
      zusScheme: "none",
      accountingMode: "self",
    }, {
      occurredAt: NOW,
      eventId: "event-profile",
    });
    const labels = configured.templates
      .find((template) => template.id === JDG_PROFILE_TEMPLATE_ID)
      ?.items.map((item) => item.label) ?? [];

    expect(configured.taxProfile).toMatchObject({
      taxForm: "linear",
      vatStatus: "active",
      vatCadence: "quarterly",
      zusScheme: "none",
      accountingMode: "self",
    });
    expect(labels).toContain("Opłaciłem zaliczkę na PIT-36L");
    expect(labels).toContain("Rozliczyłem VAT / JPK_V7K");
    expect(labels).not.toContain("Opłaciłem składki ZUS");
    expect(configured.history.at(-1)).toMatchObject({
      id: "event-profile",
      type: "profile-updated",
    });

    const undone = undoJdgAuditEvent(configured, "event-profile", {
      occurredAt: "2026-07-28T10:05:00.000Z",
      eventId: "event-profile-undo",
    });

    expect(undone.taxProfile.taxForm).toBe("unconfigured");
    expect(undone.history.map((event) => event.id)).toEqual([
      "event-profile",
      "event-profile-undo",
    ]);
    expect(undone.history.at(-1)).toMatchObject({
      type: "undo",
      revertsEventId: "event-profile",
    });
  });

  it("saves a reusable month template, merges it safely, and audits reversible cleanup", () => {
    const initial = createDefaultJdgWorkspace(new Date(2026, 6, 28, 12));
    const sourceMonth = initial.months[0];
    const withCustomItem: JdgWorkspace = {
      ...initial,
      months: [{
        ...sourceMonth,
        items: [...sourceMonth.items, customItem()],
      }],
    };
    const withTemplate = createJdgTemplateFromMonth(withCustomItem, "2026-07", {
      id: "quarterly-template",
      name: "Kwartalne rozliczenie",
    }, {
      occurredAt: NOW,
      eventId: "event-template",
    });
    const withTargetMonth = createJdgMonthForWorkspace(withTemplate, "2026-08");
    const targetMonth = withTargetMonth.months.find((month) => month.month === "2026-08");
    const targetWithCompletion: JdgWorkspace = {
      ...withTargetMonth,
      months: withTargetMonth.months.map((month) => month.month === "2026-08"
        ? {
            ...month,
            note: "Nie usuwaj",
            items: month.items.map((item, index) => index === 0
              ? { ...item, done: true, doneAt: NOW }
              : item),
          }
        : month),
    };

    expect(targetMonth).toBeDefined();
    const merged = applyJdgMonthTemplate(
      targetWithCompletion,
      "2026-08",
      "quarterly-template",
      "merge",
      { occurredAt: NOW, eventId: "event-apply" },
    );
    const mergedMonth = merged.months.find((month) => month.month === "2026-08");
    const mergedCustom = mergedMonth?.items.find((item) => item.id.startsWith("custom-quarterly-review"));

    expect(mergedMonth?.note).toBe("Nie usuwaj");
    expect(mergedMonth?.items[0].done).toBe(true);
    expect(mergedCustom?.id).toBe("custom-quarterly-review-2026-08");

    const deleted = deleteJdgMonthItem(
      merged,
      "2026-08",
      mergedCustom?.id ?? "",
      { occurredAt: NOW, eventId: "event-delete" },
    );
    expect(deleted.months.find((month) => month.month === "2026-08")?.items)
      .not.toContainEqual(expect.objectContaining({ id: "custom-quarterly-review-2026-08" }));

    const restored = undoJdgAuditEvent(deleted, "event-delete", {
      occurredAt: NOW,
      eventId: "event-delete-undo",
    });
    expect(restored.months.find((month) => month.month === "2026-08")?.items)
      .toContainEqual(expect.objectContaining({ id: "custom-quarterly-review-2026-08" }));

    const reset = resetJdgMonth(restored, "2026-08", {
      occurredAt: NOW,
      eventId: "event-reset",
    });
    expect(reset.months.find((month) => month.month === "2026-08")?.items.every((item) => (
      !item.done && item.doneAt === ""
    ))).toBe(true);
    expect(isJdgWorkspace(reset)).toBe(true);
  });

  it("refuses to persist a workspace with deeply invalid template data", () => {
    const workspace = createDefaultJdgWorkspace(new Date(2026, 6, 28, 12));
    const invalid = structuredClone(workspace) as JdgWorkspace;
    invalid.templates[0].items[0].dueDay = 99;

    expect(saveJdgWorkspace(invalid)).toBe(false);
    expect(window.localStorage.getItem(JDG_STORAGE_KEY)).toBeNull();
  });
});
