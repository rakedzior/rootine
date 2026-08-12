import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { uiLayers } from "../tokens";

export type AnchoredPopoverAlign = "start" | "end";
export type AnchoredPopoverPlacement = "auto" | "bottom" | "top" | "left" | "right";
export type AnchoredPopoverInitialFocus = "none" | "first";
export type AnchoredPopoverDismissReason = "escape" | "pointer-outside" | "focus-outside";

export interface AnchoredPopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: (reason: AnchoredPopoverDismissReason) => void;
  align?: AnchoredPopoverAlign;
  placement?: AnchoredPopoverPlacement;
  layer?: keyof typeof uiLayers;
  initialFocus?: AnchoredPopoverInitialFocus;
  restoreFocus?: boolean;
  dismissOnFocusOutside?: boolean;
  matchAnchorWidth?: boolean;
  minWidth?: number;
  maxHeight?: number;
  offset?: number;
  viewportPadding?: number;
  portalRoot?: Element | null;
}

const FOCUSABLE_SELECTOR = [
  "[data-autofocus]",
  "button:not(:disabled)",
  "[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const ANCHORED_POPOVER_SELECTOR = ".ui-anchored-popover[data-ui-owned-overlay='anchored-popover']";

/**
 * Portalled descendants are React children but not necessarily DOM children.
 * DOM order still reflects the layer opening order, including a child mounted
 * into its parent portal. Only the last open shared layer may consume a
 * dismissal gesture; otherwise every document listener handles one Escape or
 * outside event and collapses the whole nested stack.
 */
function isTopmostAnchoredPopover(popover: HTMLElement | null) {
  if (!popover?.isConnected) return false;
  const openPopovers = Array.from(document.querySelectorAll<HTMLElement>(ANCHORED_POPOVER_SELECTOR));
  return openPopovers.at(-1) === popover;
}

/**
 * A shared, non-modal floating layer anchored to a trigger.
 *
 * The component owns portal rendering, viewport collision, outside dismissal,
 * Escape and focus restoration. Content keeps ownership of its ARIA pattern
 * (`menu`, `listbox`, `dialog`, etc.) and its internal arrow-key behaviour.
 */
export const AnchoredPopover = forwardRef<HTMLDivElement, AnchoredPopoverProps>(function AnchoredPopover(
  {
    open,
    anchorRef,
    onDismiss,
    align = "start",
    placement = "auto",
    layer = "popover",
    initialFocus = "none",
    restoreFocus = true,
    dismissOnFocusOutside = true,
    matchAnchorWidth = false,
    minWidth = 148,
    maxHeight = 320,
    offset = 6,
    viewportPadding = 12,
    portalRoot,
    className = "",
    children,
    ...props
  },
  forwardedRef,
) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);

  useImperativeHandle(forwardedRef, () => popoverRef.current as HTMLDivElement);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const measuredRect = popover.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
      const naturalWidth = matchAnchorWidth
        ? anchorRect.width
        : Math.max(minWidth, measuredRect.width || minWidth);
      const width = Math.min(naturalWidth, availableWidth);
      const below = Math.max(0, window.innerHeight - anchorRect.bottom - offset - viewportPadding);
      const above = Math.max(0, anchorRect.top - offset - viewportPadding);
      const spaceRight = Math.max(0, window.innerWidth - anchorRect.right - offset - viewportPadding);
      const spaceLeft = Math.max(0, anchorRect.left - offset - viewportPadding);
      const desiredHeight = Math.min(maxHeight, popover.scrollHeight || maxHeight);
      const horizontalPlacement = placement === "left" || placement === "right";
      const opensLeft = horizontalPlacement && (placement === "left" || spaceRight < naturalWidth) && spaceLeft >= spaceRight;
      const opensRight = horizontalPlacement && !opensLeft;
      const opensAbove = !horizontalPlacement && (placement === "top"
        || (placement === "auto" && below < Math.min(desiredHeight, 160) && above > below));
      const availableHeight = horizontalPlacement
        ? Math.max(0, window.innerHeight - viewportPadding * 2)
        : opensAbove ? above : below;
      const constrainedHeight = Math.max(0, Math.min(maxHeight, availableHeight));
      const preferredLeft = opensLeft
        ? anchorRect.left - offset - width
        : opensRight
          ? anchorRect.right + offset
          : align === "end" ? anchorRect.right - width : anchorRect.left;
      const left = Math.max(
        viewportPadding,
        Math.min(preferredLeft, window.innerWidth - width - viewportPadding),
      );
      const renderedHeight = Math.min(desiredHeight, constrainedHeight);
      const top = horizontalPlacement
        ? Math.max(viewportPadding, Math.min(anchorRect.top, window.innerHeight - renderedHeight - viewportPadding))
        : opensAbove
          ? Math.max(viewportPadding, anchorRect.top - offset - renderedHeight)
          : Math.min(anchorRect.bottom + offset, window.innerHeight - viewportPadding);

      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
      popover.style.width = `${Math.round(width)}px`;
      popover.style.maxHeight = `${Math.round(constrainedHeight)}px`;
      popover.style.zIndex = uiLayers[layer];
      popover.dataset.placement = opensLeft ? "left" : opensRight ? "right" : opensAbove ? "top" : "bottom";
      popover.dataset.positioned = "true";
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(anchor);
    resizeObserver.observe(popover);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, anchorRef, layer, matchAnchorWidth, maxHeight, minWidth, offset, open, placement, viewportPadding]);

  useEffect(() => {
    if (!open) return;
    const frame = initialFocus === "first"
      ? requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus())
      : null;

    const dismiss = (reason: AnchoredPopoverDismissReason, returnFocus: boolean) => {
      onDismissRef.current(reason);
      if (returnFocus && restoreFocus) requestAnimationFrame(() => anchorRef.current?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isTopmostAnchoredPopover(popoverRef.current)) return;
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      dismiss("pointer-outside", false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!dismissOnFocusOutside || !isTopmostAnchoredPopover(popoverRef.current)) return;
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      dismiss("focus-outside", false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopmostAnchoredPopover(popoverRef.current)) return;
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss("escape", true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef, dismissOnFocusOutside, initialFocus, open, restoreFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`ui-anchored-popover ${className}`.trim()}
      {...props}
      data-ui-owned-overlay="anchored-popover"
    >
      {children}
    </div>,
    portalRoot ?? document.body,
  );
});
