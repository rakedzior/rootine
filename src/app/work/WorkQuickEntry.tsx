import { CalendarDays, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../ui";

export function WorkQuickEntry({ onCreate }: { onCreate: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const normalizedTitle = title.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedTitle) return;
    onCreate(normalizedTitle);
    setTitle("");
  };

  return (
    <form className="work-quick-entry" aria-label="Szybkie dodawanie zadania do pracy" onSubmit={submit}>
      <button type="submit" className="work-quick-entry__lead" aria-label="Dodaj zadanie" disabled={!normalizedTitle}>
        <Plus size={13} aria-hidden="true" />
      </button>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Nazwa nowego zadania w pracy"
        placeholder="Dodaj zadanie do „Dzisiaj”"
      />
      <span className="work-quick-entry__date"><CalendarDays size={12} aria-hidden="true" /> Dziś</span>
      <Button variant="quiet" size="sm" type="submit" disabled={!normalizedTitle}>Dodaj</Button>
    </form>
  );
}
