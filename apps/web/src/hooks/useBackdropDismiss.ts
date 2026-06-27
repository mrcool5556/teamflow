import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";

/** Close on backdrop click, but not when the user started a drag/text-selection inside the panel. */
export function useBackdropDismiss(onDismiss: () => void) {
  const contentPointerDownRef = useRef(false);

  const markContentPointerDown = useCallback(() => {
    contentPointerDownRef.current = true;
  }, []);

  const onBackdropPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) {
      contentPointerDownRef.current = false;
    }
  }, []);

  const onBackdropClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (contentPointerDownRef.current) {
        contentPointerDownRef.current = false;
        return;
      }
      onDismiss();
    },
    [onDismiss],
  );

  return {
    markContentPointerDown,
    backdropProps: {
      onPointerDown: onBackdropPointerDown,
      onClick: onBackdropClick,
    },
  };
}
