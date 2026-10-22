import {
  useId,
  useRef,
  type ElementType,
  type FormEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useLayer } from "./layerStack";
import { DialogTitleContext } from "./dialogContext";

type OverlayProps = {
  /** Defaults to true so a parent can mount the component only while it is open. */
  open?: boolean;
  onClose: () => void;
  /** Class of the full-screen backdrop; the backdrop keeps its existing look. */
  backdropClassName: string;
  className?: string;
  as?: "section" | "aside" | "form" | "figure" | "div";
  /** Close when the backdrop itself is clicked (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape while this is the topmost layer (default true). */
  closeOnEscape?: boolean;
  /** Accessible name when the overlay has no <DialogTitle>. */
  label?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  panelProps?: HTMLAttributes<HTMLElement>;
  children: ReactNode;
};

function Overlay({
  open = true,
  onClose,
  backdropClassName,
  className,
  as = "section",
  closeOnBackdrop = true,
  closeOnEscape = true,
  label,
  initialFocusRef,
  onSubmit,
  panelProps,
  children,
  layer,
}: OverlayProps & { layer: "dialog" | "drawer" }) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  // A drag or text selection that starts in the panel and ends on the backdrop is not a dismiss.
  const pointerDownInPanelRef = useRef(false);

  useLayer({
    open,
    onEscape: closeOnEscape ? onClose : undefined,
    modal: true,
    containerRef: panelRef,
    initialFocusRef,
  });

  if (!open) return null;

  function onBackdropClick(event: MouseEvent<HTMLDivElement>) {
    // Portaled overlays must not trigger click handlers of the component that opened them.
    event.stopPropagation();
    if (event.target !== event.currentTarget) return;
    if (pointerDownInPanelRef.current) {
      pointerDownInPanelRef.current = false;
      return;
    }
    if (closeOnBackdrop) onClose();
  }

  const Panel = as as ElementType;

  return createPortal(
    <div
      className={backdropClassName}
      data-layer={layer}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) pointerDownInPanelRef.current = false;
      }}
      onClick={onBackdropClick}
    >
      <DialogTitleContext.Provider value={titleId}>
        <Panel
          {...panelProps}
          ref={panelRef}
          className={className}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          aria-labelledby={label ? undefined : titleId}
          tabIndex={-1}
          onPointerDown={() => {
            pointerDownInPanelRef.current = true;
          }}
          onSubmit={onSubmit}
        >
          {children}
        </Panel>
      </DialogTitleContext.Provider>
    </div>,
    document.body,
  );
}

export type DialogProps = OverlayProps;

/** A centred modal dialog. Put a <DialogTitle> inside it (or pass `label`). */
export function Dialog(props: DialogProps) {
  return <Overlay {...props} layer="dialog" />;
}

export type DrawerProps = Omit<OverlayProps, "backdropClassName" | "as"> & {
  backdropClassName?: string;
};

/** A side drawer over the board. Put a <DialogTitle> inside it (or pass `label`). */
export function Drawer({
  className,
  backdropClassName = "drawer-backdrop",
  ...props
}: DrawerProps) {
  return (
    <Overlay
      {...props}
      layer="drawer"
      as="aside"
      backdropClassName={backdropClassName}
      className={className ? `drawer ${className}` : "drawer"}
    />
  );
}
