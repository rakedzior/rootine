import { useEffect, useState } from "react";

function readReducedMotion() {
  if (typeof window === "undefined") return true;
  const explicitPreference = document.documentElement.dataset.motion;
  if (explicitPreference === "reduced") return true;
  if (explicitPreference === "full") return false;
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Reads the effective preference without requiring an application provider. */
export function useEffectiveReducedMotion() {
  const [reduced, setReduced] = useState(readReducedMotion);

  useEffect(() => {
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const update = () => setReduced(readReducedMotion());
    const observer = new MutationObserver(update);

    media?.addEventListener("change", update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    update();

    return () => {
      media?.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return reduced;
}
