import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260902120000_rootine_server_notifications.sql"),
  "utf8",
);

describe("notification schema ownership guards", () => {
  it("uses composite task/habit ownership FKs and never unscoped entity FKs", () => {
    expect(migration).toMatch(/foreign key \(user_id, task_id\)\s+references public\.tasks \(user_id, id\)/);
    expect(migration).toMatch(/foreign key \(user_id, habit_id\)\s+references public\.habits \(user_id, id\)/);
    expect(migration).not.toMatch(/foreign key \(task_id\)\s+references public\.tasks \(id\)/);
    expect(migration).not.toMatch(/foreign key \(habit_id\)\s+references public\.habits \(id\)/);
  });

  it("forces preference writes through the validated RPC", () => {
    expect(migration).toMatch(
      /revoke insert, update on table public\.rootine_notification_preferences from authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.rootine_save_notification_preferences\(/,
    );
    expect(migration).not.toMatch(
      /grant insert, update on table public\.rootine_notification_preferences to authenticated/,
    );
  });
});
