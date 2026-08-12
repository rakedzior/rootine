import { Archive, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AnchoredPopover, Menu, MenuItem, MenuTrigger, PropertyMenu } from "../ui";

export type InlineMenuOption = {
  value: string;
  label: string;
  leadingIcon?: ReactNode;
  selected?: boolean;
  className?: string;
};

type TaskInlineMenuProps = {
  value: string;
  options: InlineMenuOption[];
  ariaLabel: string;
  triggerClassName: string;
  onChange: (value: string) => void;
  children: ReactNode;
};

export function TaskInlineMenu({ value, options, ariaLabel, triggerClassName, onChange, children }: TaskInlineMenuProps) {
  return (
    <PropertyMenu
      className="work-inline-control"
      value={value}
      options={options.map(({ selected: _selected, ...option }) => option)}
      ariaLabel={ariaLabel}
      triggerClassName={triggerClassName}
      layer="featurePopup"
      onChange={onChange}
    >
      {children}
    </PropertyMenu>
  );
}

type WorkProjectActionsMenuProps = {
  projectId: string;
  projectName: string;
  onEdit: () => void;
  onOpenDetails: () => void;
  onDelete: () => void;
};

type WorkCompanyActionsMenuProps = {
  companyId: string;
  companyName: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

export function WorkCompanyActionsMenu({ companyId, companyName, onEdit, onArchive, onDelete }: WorkCompanyActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = `work-company-actions-${companyId}`;
  const triggerId = `${menuId}-trigger`;
  const close = () => setOpen(false);

  return (
    <div className="work-project-actions-menu">
      <MenuTrigger
        ref={triggerRef}
        id={triggerId}
        open={open}
        menuId={menuId}
        className="work-project-actions-menu__trigger"
        aria-label={`Więcej akcji dla firmy ${companyName}`}
        title="Więcej akcji"
        onClick={() => open ? close() : setOpen(true)}
      >
        <MoreHorizontal size={13} aria-hidden="true" />
      </MenuTrigger>
      <AnchoredPopover
        open={open}
        anchorRef={triggerRef}
        onDismiss={close}
        placement="auto"
        layer="featurePopup"
        minWidth={190}
        maxHeight={128}
        className="work-project-actions-menu__popover"
      >
        <Menu id={menuId} aria-labelledby={triggerId} className="work-project-actions-menu__panel" triggerRef={triggerRef} onDismiss={close} initialFocus="first" dismissOnFocusOut={false}>
          <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { onEdit(); close(); }}>Edytuj firmę</MenuItem>
          <MenuItem leadingIcon={<Archive size={13} />} onClick={() => { onArchive(); close(); }}>Archiwizuj firmę</MenuItem>
          <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { onDelete(); close(); }}>Usuń firmę</MenuItem>
        </Menu>
      </AnchoredPopover>
    </div>
  );
}

export function WorkProjectActionsMenu({ projectId, projectName, onEdit, onOpenDetails, onDelete }: WorkProjectActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = `work-project-actions-${projectId}`;
  const triggerId = `${menuId}-trigger`;

  const close = () => setOpen(false);

  return (
    <div className="work-project-actions-menu">
      <MenuTrigger
        ref={triggerRef}
        id={triggerId}
        open={open}
        menuId={menuId}
        className="work-project-actions-menu__trigger"
        aria-label={`Więcej akcji dla projektu ${projectName}`}
        title="Więcej akcji"
        onClick={() => open ? close() : setOpen(true)}
      >
        <MoreHorizontal size={13} aria-hidden="true" />
      </MenuTrigger>
      <AnchoredPopover
        open={open}
        anchorRef={triggerRef}
        onDismiss={close}
        placement="auto"
        layer="featurePopup"
        minWidth={178}
        maxHeight={128}
        className="work-project-actions-menu__popover"
      >
        <Menu id={menuId} aria-labelledby={triggerId} className="work-project-actions-menu__panel" triggerRef={triggerRef} onDismiss={close} initialFocus="first" dismissOnFocusOut={false}>
          <MenuItem leadingIcon={<FolderOpen size={13} />} onClick={() => { onOpenDetails(); close(); }}>Szczegóły projektu</MenuItem>
          <MenuItem leadingIcon={<Pencil size={13} />} onClick={() => { onEdit(); close(); }}>Edytuj projekt</MenuItem>
          <MenuItem tone="danger" leadingIcon={<Trash2 size={13} />} onClick={() => { onDelete(); close(); }}>Usuń projekt</MenuItem>
        </Menu>
      </AnchoredPopover>
    </div>
  );
}
