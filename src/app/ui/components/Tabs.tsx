import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}

export function Tabs({ items, activeId, onChange, ariaLabel, className = "" }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled);
    const enabledIndex = enabled.findIndex(({ itemIndex }) => itemIndex === index);
    let next = enabledIndex;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    if (event.key === "ArrowLeft") next = (enabledIndex - 1 + enabled.length) % enabled.length;
    if (event.key === "ArrowRight") next = (enabledIndex + 1) % enabled.length;
    const nextIndex = enabled[next]?.itemIndex;
    if (nextIndex === undefined) return;
    onChange(items[nextIndex].id);
    refs.current[nextIndex]?.focus();
  };

  return (
    <div className={`ui-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={activeId === item.id}
          aria-controls={`panel-${item.id}`}
          tabIndex={activeId === item.id ? 0 : -1}
          disabled={item.disabled}
          className="ui-tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
