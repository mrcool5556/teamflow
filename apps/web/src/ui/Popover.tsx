import {
  useEffect,
  useLayoutEffect,
  useRef,
  type AriaRole,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement,
} from "@floating-ui/react";
import { useLayer } from "./layerStack";

const VIEWPORT_PADDING = 12;

export type PopoverProps = {
  open: boolean;
  onClose: () => void;
  /** The trigger. Clicks on it never count as "outside". */
  anchorRef?: RefObject<HTMLElement | null>;
  /** A viewport point to open at instead of an element (context menus). */
  anchorPoint?: { x: number; y: number };
  placement?: Placement;
  /** Gap between anchor and panel in px. */
  gap?: number;
  /** Fixed panel width in px; by default the panel sizes to its content. */
  width?: number;
  /** Cap for content-sized panels (they no longer inherit a narrow parent's width). */
  maxWidth?: number;
  className?: string;
  /** Added to `className` once the panel has its real position (avoids a flash at 0,0). */
  positionedClassName?: string;
  style?: CSSProperties;
  role?: AriaRole;
  label?: string;
  children: ReactNode;
};

/**
 * A floating panel portaled to <body> on the popover layer. Floating UI places it next to the
 * anchor from its measured size (flip, shift and a max-height that fits the viewport). It
 * registers on the layer stack, so Escape closes the topmost popover first, focus inside it
 * returns to the trigger on close, and clicks inside popovers opened from it are not "outside".
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  anchorPoint,
  placement = "bottom-start",
  gap = 6,
  width,
  maxWidth,
  className,
  positionedClassName,
  style,
  role,
  label,
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  const { refs, floatingStyles, isPositioned } = useFloating({
    open,
    placement,
    strategy: "fixed",
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(gap),
      flip({ padding: VIEWPORT_PADDING }),
      shift({ padding: VIEWPORT_PADDING }),
      size({
        padding: VIEWPORT_PADDING,
        apply({ availableHeight, elements }) {
          const maxHeight = Math.max(availableHeight, 120);
          const panel = elements.floating;
          panel.style.maxHeight = `${maxHeight}px`;
          // Scroll only when the content really is taller than the room left.
          panel.style.overflowY = panel.scrollHeight > maxHeight ? "auto" : "";
        },
      }),
    ],
  });

  const pointX = anchorPoint?.x;
  const pointY = anchorPoint?.y;
  useLayoutEffect(() => {
    if (!open) return;
    if (pointX != null && pointY != null) {
      refs.setPositionReference({
        getBoundingClientRect: () => new DOMRect(pointX, pointY, 0, 0),
      });
    } else {
      refs.setReference(anchorRef?.current ?? null);
    }
  }, [open, refs, anchorRef, pointX, pointY]);

  const layer = useLayer({
    open,
    onEscape: () => onCloseRef.current(),
    containerRef: panelRef,
    restoreFocus: true,
  });
  const layerRef = useRef(layer);
  useLayoutEffect(() => {
    layerRef.current = layer;
  });

  useEffect(() => {
    if (!open) return;
    // A press that starts inside (e.g. a text selection drag) and ends outside is not a dismiss.
    let pressStartedInside = false;
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (anchorRef?.current?.contains(target)) return true;
      return layerRef.current.containsAtOrAbove(target);
    };
    function onPointerDown(event: PointerEvent) {
      pressStartedInside = isInside(event.target);
    }
    function onClick(event: MouseEvent) {
      if (isInside(event.target)) return;
      if (pressStartedInside) {
        pressStartedInside = false;
        return;
      }
      onCloseRef.current();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  const classes = [className, isPositioned ? positionedClassName : undefined]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      ref={(node) => {
        panelRef.current = node;
        refs.setFloating(node);
      }}
      className={classes || undefined}
      data-layer="popover"
      role={role}
      aria-label={label}
      style={{
        ...style,
        ...floatingStyles,
        right: "auto",
        bottom: "auto",
        zIndex: "var(--z-popover)",
        ...(width != null ? { width, maxWidth: width } : { maxWidth }),
        visibility: isPositioned ? undefined : "hidden",
      }}
      // The panel is portaled but still a React child of its trigger: keep its presses and
      // clicks from reaching cards, drag handles and row headers underneath.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
