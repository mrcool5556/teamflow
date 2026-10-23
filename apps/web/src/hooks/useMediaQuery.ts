import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches now; false where matchMedia is missing (tests). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

/** Below 768px: phones, where settings stack and drawers fill the screen. */
export const NARROW_SCREEN = "(max-width: 767px)";
