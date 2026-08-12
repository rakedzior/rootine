import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  panelId?: string;
  tabId?: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
  activationMode?: "automatic" | "manual";
  density?: "compact" | "standard";
  fill?: boolean;
}

export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel,
  id,
  className = "",
  orientation = "horizontal",
  activationMode = "automatic",
  density = "standard",
  fill = false,
}: TabsProps) {
  const generatedId = useId();
  const tabsId = id ?? generatedId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled);
  const activeIndex = items.findIndex((item) => item.id === activeId && !item.disabled);
  const tabbableIndex = activeIndex >= 0 ? activeIndex : enabled[0]?.itemIndex ?? -1;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (activationMode === "manual" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (!items[index]?.disabled) onChange(items[index].id);
      return;
    }
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    if (![previousKey, nextKey, "Home", "End"].includes(event.key) || !enabled.length) return;
    event.preventDefault();
    const enabledIndex = enabled.findIndex(({ itemIndex }) => itemIndex === index);
    let next = enabledIndex >= 0 ? enabledIndex : 0;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    if (event.key === previousKey) next = (next - 1 + enabled.length) % enabled.length;
    if (event.key === nextKey) next = (next + 1) % enabled.length;
    const nextIndex = enabled[next]?.itemIndex;
    if (nextIndex === undefined) return;
    if (activationMode === "automatic") onChange(items[nextIndex].id);
    refs.current[nextIndex]?.focus();
  };

  return (
    <div
      id={tabsId}
      className={`ui-tabs ui-tabs--${density} ${fill ? "ui-tabs--fill" : ""} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
    >
      {items.map((item, index) => {
        const tabId = item.tabId ?? `${tabsId}-tab-${index}`;
        return (
          <button
            key={item.id}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            id={tabId}
            aria-selected={activeId === item.id}
            aria-controls={item.panelId}
            tabIndex={tabbableIndex === index ? 0 : -1}
            disabled={item.disabled}
            className="ui-tab"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
