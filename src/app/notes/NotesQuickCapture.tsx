import { FileText, Folder, Hash, Palette, Pin, Plus } from "lucide-react";
import { Button, PropertyMenu, QuickComposer, type PropertyMenuOption } from "../ui";

type QuickNoteColor = "graphite" | "blue" | "green" | "amber" | "violet" | "coral";
type QuickEditorSection = "content" | "tags";

type NotesQuickCaptureProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onOpenFullEditor: (section?: QuickEditorSection) => void;
  listId: string;
  listOptions: PropertyMenuOption[];
  onListChange: (value: string) => void;
  color: QuickNoteColor;
  colorOptions: PropertyMenuOption[];
  onColorChange: (value: QuickNoteColor) => void;
  pinned: boolean;
  onPinnedChange: (value: boolean) => void;
};

export function NotesQuickCapture({
  value,
  onChange,
  onSubmit,
  onOpenFullEditor,
  listId,
  listOptions,
  onListChange,
  color,
  colorOptions,
  onColorChange,
  pinned,
  onPinnedChange,
}: NotesQuickCaptureProps) {
  return (
    <QuickComposer
      className="notes-quick-capture"
      density="compact"
      aria-label="Szybko dodaj notatkę"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      leadingAction={(
        <button
          type="submit"
          className="notes-quick-capture__submit"
          aria-label="Dodaj notatkę"
          disabled={!value.trim()}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      )}
      editor={(
        <input
          aria-label="Tytuł nowej notatki"
          className="notes-quick-capture__input"
          value={value}
          placeholder="Dodaj notatkę…"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      propertyControls={(
        <>
          <PropertyMenu
            value={listId}
            options={listOptions}
            onChange={onListChange}
            ariaLabel="Lista nowej notatki"
            title="Lista"
            triggerClassName="notes-quick-capture__property"
          >
            <Folder size={14} aria-hidden="true" />
          </PropertyMenu>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Dodaj tagi do notatki"
            title="Tagi"
            className="notes-quick-capture__property"
            onClick={() => onOpenFullEditor("tags")}
          >
            <Hash size={14} aria-hidden="true" />
          </Button>
          <PropertyMenu
            value={color}
            options={colorOptions}
            onChange={(value) => onColorChange(value as QuickNoteColor)}
            ariaLabel="Kolor nowej notatki"
            title="Kolor"
            triggerClassName={`notes-quick-capture__property notes-quick-capture__property--color notes-color--${color}`}
            align="end"
          >
            <Palette size={14} aria-hidden="true" />
          </PropertyMenu>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={pinned ? "Odepnij nową notatkę" : "Przypnij nową notatkę"}
            aria-pressed={pinned}
            title={pinned ? "Przypięte" : "Przypnij"}
            className={`notes-quick-capture__property ${pinned ? "is-active" : ""}`}
            onClick={() => onPinnedChange(!pinned)}
          >
            <Pin size={14} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Dodaj treść notatki"
            title="Treść"
            className="notes-quick-capture__property"
            onClick={() => onOpenFullEditor("content")}
          >
            <FileText size={14} aria-hidden="true" />
          </Button>
        </>
      )}
    />
  );
}
