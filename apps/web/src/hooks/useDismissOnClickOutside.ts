import { useEffect, useRef, type RefObject } from "react";

function isInside(target: Node, refs: RefObject<Node | null>[]) {
  return refs.some((ref) => {
    const el = ref.current;
    return el instanceof Node && (el === target || el.contains(target));
  });
}

/** Dismiss on outside click, but not when pointer went down inside (e.g. text selection drag). */
export function useDismissOnClickOutside(
  enabled: boolean,
  containerRefs: RefObject<Node | null>[],
  onDismiss: () => void,
) {
  const pointerDownInsideRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    function onPointerDown(event: PointerEvent) {
      pointerDownInsideRef.current = isInside(event.target as Node, containerRefs);
    }

    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      if (isInside(target, containerRefs)) return;
      if (pointerDownInsideRef.current) {
        pointerDownInsideRef.current = false;
        return;
      }
      onDismiss();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [enabled, onDismiss, containerRefs]);
}
