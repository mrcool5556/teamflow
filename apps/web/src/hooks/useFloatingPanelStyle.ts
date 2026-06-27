import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const PANEL_ESTIMATE_HEIGHT = 340;

export function useFloatingPanelStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  placement: "auto" | "top" | "bottom" = "auto",
  align: "left" | "right" = "left",
  panelWidth = 280,
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = panelWidth;
      const preferTop =
        placement === "top" ||
        (placement === "auto" &&
          rect.bottom + PANEL_ESTIMATE_HEIGHT > window.innerHeight - 12);

      const left =
        align === "right"
          ? Math.min(
              Math.max(12, rect.right - width),
              window.innerWidth - width - 12,
            )
          : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));

      setStyle({
        position: "fixed",
        left,
        top: preferTop ? rect.top - 8 : rect.bottom + 6,
        transform: preferTop ? "translateY(-100%)" : undefined,
        zIndex: 500,
        width,
        maxWidth: width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, placement, align, panelWidth]);

  return style;
}
