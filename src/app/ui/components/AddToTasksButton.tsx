import { ListPlus } from "lucide-react";
import { useState } from "react";
import { addExternalTask, type ExternalTaskInput } from "../../data/taskLinks";
import { Button } from "./Button";

export function AddToTasksButton({ input, compact = false, onAdded }: { input: ExternalTaskInput; compact?: boolean; onAdded?: (taskId: number) => void }) {
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");
  const label = status === "added" ? "Dodano do zadań" : "Dodaj do zadań";

  return (
    <Button
      type="button"
      variant={status === "added" ? "quiet" : "ghost"}
      size="sm"
      iconOnly={compact}
      aria-label={label}
      title={label}
      disabled={status === "added"}
      leadingIcon={<ListPlus size={12} />}
      onClick={() => {
        const result = addExternalTask(input);
        setStatus(result.status === "added" || result.status === "exists" ? "added" : "error");
        if (result.status === "added" || result.status === "exists") onAdded?.(result.task.id);
      }}
    >
      {!compact && (status === "error" ? "Spróbuj ponownie" : label)}
    </Button>
  );
}
