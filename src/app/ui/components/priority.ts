import type { SelectOptionTone } from "./Select";

export type PriorityLevel = "none" | "normal" | "low" | "medium" | "high";

export function priorityOptionTone(level: PriorityLevel): SelectOptionTone {
  if (level === "high") return "danger";
  if (level === "medium") return "warning";
  if (level === "low") return "primary";
  return "default";
}
