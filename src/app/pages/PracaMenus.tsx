import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Menu, MenuItem, MenuTrigger } from "../ui";

export type InlineMenuOption = {
  value: string;
  label: string;
  leadingIcon?: ReactNode;
  selected?: boolean;
  className?: string;
};

type FloatingMenuPosition = CSSProperties | null;

function useFloatingMenuPosition(
  triggerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  minWidth: number,
  preferredHeight: number,
): FloatingMenuPosition {
  const [position, setPosition] = useState<FloatingMenuPosition>(null);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 12;
      const menuWidth = Math.max(rect.width, minWidth);
      const spaceBelow = window.innerHeight - rect.bottom - viewportGap;
      const spaceAbove = rect.top - viewportGap;
      const opensAbove = spaceBelow < Math.min(preferredHeight, 180) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(48, Math.min(preferredHeight, opensAbove ? spaceAbove : spaceBelow));
      setPosition({
        position: "fixed",
        zIndex: 260,
        left: Math.max(viewportGap, Math.min(rect.left, window.innerWidth - menuWidth - viewportGap)),
        top: opensAbove ? Math.max(viewportGap, rect.top - maxHeight - 6) : rect.bottom + 6,
        minWidth: Math.min(menuWidth, window.innerWidth - viewportGap * 2),
        maxHeight,
        overflowY: "auto",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [minWidth, open, preferredHeight, triggerRef]);

  return position;
}

type TaskInlineMenuProps = {
  value: string;
  options: InlineMenuOption[];
  ariaLabel: string;
  triggerClassName: string;
  onChange: (value: string) => void;
  children: ReactNode;
};

export function TaskInlineMenu({ value, options, ariaLabel, triggerClassName, onChange, children }: TaskInlineMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const position = useFloatingMenuPosition(triggerRef, open, 190, Math.min(300, options.length * 42 + 12));

  const close = () => setOpen(false);

  return (
    <div className="work-inline-control">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => open ? close() : setOpen(true)}
      >
        {children}
      </button>
      {open && position && createPortal(
        <Menu className="work-inline-menu" style={position} triggerRef={triggerRef} onDismiss={close} initialFocus="selected">
          {options.map((option) => (
            <MenuItem
              key={option.value}
              className={option.className}
              leadingIcon={option.leadingIcon}
              selected={option.selected ?? option.value === value}
              onClick={() => {
                onChange(option.value);
                close();
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </Menu>,
        document.body,
      )}
    </div>
  );
}

type WorkProjectActionsMenuProps = {
  projectId: string;
  projectName: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function WorkProjectActionsMenu({ projectId, projectName, onEdit, onDelete }: WorkProjectActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const position = useFloatingMenuPosition(triggerRef, open, 178, 86);
  const menuId = `work-project-actions-${projectId}`;

  const close = () => setOpen(false);

  return (
    <div className="work-project-actions-menu">
      <MenuTrigger
        ref={triggerRef}
        open={open}
        menuId={menuId}
        className="work-project-actions-menu__trigger"
        aria-label={`Więcej akcji dla projektu ${projectName}`}
        title="Więcej akcji"
        onClick={() => open ? close() : setOpen(true)}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </MenuTrigger>
      {open && position && createPortal(
        <Menu id={menuId} className="work-project-actions-menu__panel" style={position} triggerRef={triggerRef} onDismiss={close} initialFocus="first">
          <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { onEdit(); close(); }}>Edytuj projekt</MenuItem>
          <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { onDelete(); close(); }}>Usuń projekt</MenuItem>
        </Menu>,
        document.body,
      )}
    </div>
  );
}
