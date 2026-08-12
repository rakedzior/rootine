import { Flag } from "lucide-react";
import type { PriorityLevel } from "./priority";

/** One flag grammar for priority controls in every domain. */
export function PriorityIcon({ level }: { level: PriorityLevel }) {
  const emphasized = level === "low" || level === "medium" || level === "high";
  return (
    <Flag
      size={13}
      strokeWidth={1.7}
      fill={emphasized ? "currentColor" : "none"}
      className={`ui-priority-icon ui-priority-icon--${level}`}
      aria-hidden="true"
    />
  );
}
