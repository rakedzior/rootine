import { describe, expect, it } from "vitest";
import { domainEventBus } from "../../infrastructure/events";
import { UndoManager, type UndoCompensation } from "./undoManager";

describe("UndoManager", () => {
  it("expires a compensation after its TTL", async () => {
    let now = 1_000;
    const manager = new UndoManager(100, () => now);
    const event = domainEventBus.create({
      type: "task.created",
      domain: "tasks",
      entityId: "1",
      payload: { title: "Test", dueDate: null },
    });
    const inverse: UndoCompensation = async () => ({
      success: true,
      updatedSnapshot: null,
      message: "redo",
      inverse,
    });
    const token = manager.register({ event, compensate: inverse });
    now += 101;
    const result = await manager.undo(token);
    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
  });
});
