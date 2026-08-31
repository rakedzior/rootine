type SavedDocumentStyles = {
  bodyOverflow: string;
  bodyPaddingRight: string;
  rootOverflow: string;
};

let documentLockCount = 0;
let savedDocumentStyles: SavedDocumentStyles | null = null;

export const OVERLAY_EXIT_MS = 140;
export const OVERLAY_REDUCED_EXIT_MS = 1;

export function overlayExitDuration(reduced: boolean) {
  return reduced ? OVERLAY_REDUCED_EXIT_MS : OVERLAY_EXIT_MS;
}

export function resolveStableFocusTarget(original: HTMLElement | null) {
  if (!original) return null;
  if (original.isConnected) return original;
  const focusKey = original.dataset.focusReturnKey;
  if (focusKey) {
    const keyed = Array.from(document.querySelectorAll<HTMLElement>("[data-focus-return-key]"))
      .find((element) => element.dataset.focusReturnKey === focusKey);
    if (keyed) return keyed;
  }
  const label = original.getAttribute("aria-label");
  if (label) {
    const labelled = Array.from(document.querySelectorAll<HTMLElement>("[aria-label]"))
      .filter((element) => element.getAttribute("aria-label") === label);
    if (labelled.length === 1) return labelled[0];
  }
  return null;
}

export function lockDocumentScroll() {
  if (documentLockCount === 0) {
    const body = document.body;
    const root = document.documentElement;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    savedDocumentStyles = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: root.style.overflow,
    };
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  documentLockCount += 1;

  let released = false;
  return (delay = 0) => {
    if (released) return;
    released = true;
    window.setTimeout(() => {
      documentLockCount = Math.max(0, documentLockCount - 1);
      if (documentLockCount !== 0 || !savedDocumentStyles) return;
      document.body.style.overflow = savedDocumentStyles.bodyOverflow;
      document.body.style.paddingRight = savedDocumentStyles.bodyPaddingRight;
      document.documentElement.style.overflow = savedDocumentStyles.rootOverflow;
      savedDocumentStyles = null;
    }, delay);
  };
}

type InertSnapshot = {
  inert: boolean;
  ariaHidden: string | null;
  locks: number;
};

const inertSnapshots = new WeakMap<HTMLElement, InertSnapshot>();

function acquireInert(element: HTMLElement) {
  const current = inertSnapshots.get(element);
  if (current) {
    current.locks += 1;
  } else {
    inertSnapshots.set(element, {
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
      locks: 1,
    });
  }
  element.inert = true;
  element.setAttribute("aria-hidden", "true");
}

function releaseInert(element: HTMLElement) {
  const snapshot = inertSnapshots.get(element);
  if (!snapshot) return;
  snapshot.locks -= 1;
  if (snapshot.locks > 0) return;
  element.inert = snapshot.inert;
  if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", snapshot.ariaHidden);
  inertSnapshots.delete(element);
}

function lockInertElements(elements: readonly HTMLElement[]) {
  const uniqueElements = Array.from(new Set(elements));
  uniqueElements.forEach(acquireInert);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    uniqueElements.forEach(releaseInert);
  };
}

export function inertSiblings(scope: HTMLElement, exempt: readonly HTMLElement[]) {
  const exemptSet = new Set(exempt);
  return lockInertElements(Array.from(scope.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement && !exemptSet.has(node),
  ));
}

/**
 * Makes every branch outside the supplied in-tree overlay elements inert. This is
 * required for responsive drawers that deliberately stay mounted beside their
 * desktop detail surface instead of being portalled to document.body.
 */
export function inertOutsideElements(exempt: readonly HTMLElement[]) {
  const branches: HTMLElement[] = [];
  let allowed: HTMLElement[] = [...exempt];
  let scope = exempt[0]?.parentElement ?? null;

  while (scope) {
    for (const child of Array.from(scope.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (allowed.some((element) => child === element || child.contains(element))) continue;
      branches.push(child);
    }
    allowed = [scope];
    if (scope === document.body) break;
    scope = scope.parentElement;
  }

  return lockInertElements(branches);
}

function sanitizeExitClone(element: HTMLElement) {
  element.dataset.state = "closing";
  element.dataset.overlayExitClone = "true";
  element.inert = true;
  element.setAttribute("aria-hidden", "true");
  element.removeAttribute("role");
  element.removeAttribute("aria-modal");
  element.removeAttribute("aria-labelledby");
  element.removeAttribute("aria-describedby");
  element.querySelectorAll<HTMLElement>("[data-state]").forEach((node) => {
    node.dataset.state = "closing";
  });
  element.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));
  return element;
}

export function cloneOverlayForExit(
  sourceElements: readonly HTMLElement[],
  parent: HTMLElement,
  duration: number,
) {
  const clones = sourceElements.map((source) => (
    sanitizeExitClone(source.cloneNode(true) as HTMLElement)
  ));
  clones.forEach((clone) => parent.appendChild(clone));
  window.setTimeout(() => clones.forEach((clone) => clone.remove()), duration);
}
