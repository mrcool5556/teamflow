import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * One stack for everything that sits on top of the page (dialogs, drawers, popovers, menus,
 * and page modes such as an open settings sidebar or a card selection). Layers register in the
 * order they open. Escape goes to the topmost layer only, and Tab is kept inside the topmost
 * modal layer (plus anything stacked above it, such as a popover opened from a dialog).
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hidden && !el.closest("[inert]"),
  );
}

/** Popovers portal to <body>; focus may move into one even while a modal traps focus. */
function inScope(scope: { all: HTMLElement[] }, node: Node) {
  if (scope.all.some((el) => el.contains(node))) return true;
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("[data-layer='popover']"));
}

type LayerRecord = {
  onEscape?: () => void;
  modal: boolean;
  containerRef?: RefObject<HTMLElement | null>;
};

export class LayerStack {
  private layers: LayerRecord[] = [];
  private listening = false;
  private tracking = false;
  /** The element that last lost focus; the trigger when a layer autofocuses on mount. */
  private lastFocusOrigin: HTMLElement | null = null;

  /** Where focus was before `container` took it, or the current focus. */
  focusOrigin(container: HTMLElement | null): HTMLElement | null {
    const active = document.activeElement;
    if (container && active && container.contains(active)) return this.lastFocusOrigin;
    return active instanceof HTMLElement ? active : null;
  }

  trackFocus() {
    if (this.tracking || typeof document === "undefined") return;
    this.tracking = true;
    document.addEventListener("focusin", (event) => {
      const origin = event.relatedTarget;
      this.lastFocusOrigin = origin instanceof HTMLElement ? origin : null;
    });
  }

  push(layer: LayerRecord) {
    this.layers.push(layer);
    if (!this.listening && typeof document !== "undefined") {
      document.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("focusin", this.onFocusIn);
      this.listening = true;
    }
  }

  remove(layer: LayerRecord) {
    this.layers = this.layers.filter((entry) => entry !== layer);
    if (this.layers.length === 0 && this.listening) {
      document.removeEventListener("keydown", this.onKeyDown);
      document.removeEventListener("focusin", this.onFocusIn);
      this.listening = false;
    }
  }

  isTop(layer: LayerRecord) {
    return this.layers[this.layers.length - 1] === layer;
  }

  get size() {
    return this.layers.length;
  }

  /** Containers focus may live in: the topmost modal layer and every layer above it. */
  private focusScope(): { modal: HTMLElement; all: HTMLElement[] } | null {
    for (let index = this.layers.length - 1; index >= 0; index -= 1) {
      const layer = this.layers[index];
      const modal = layer.modal ? layer.containerRef?.current : null;
      if (!modal) continue;
      const all = this.layers
        .slice(index)
        .map((entry) => entry.containerRef?.current)
        .filter((el): el is HTMLElement => Boolean(el));
      return { modal, all };
    }
    return null;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (event.isComposing) return;
      const top = this.layers[this.layers.length - 1];
      if (!top) return;
      event.preventDefault();
      top.onEscape?.();
      return;
    }

    if (event.key !== "Tab") return;
    const scope = this.focusScope();
    if (!scope) return;
    const active = document.activeElement;
    // Focus inside a popover stacked above the modal tabs normally.
    if (active && !scope.modal.contains(active) && inScope(scope, active)) return;
    const items = focusableElements(scope.modal);
    if (items.length === 0) {
      event.preventDefault();
      scope.modal.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = active instanceof HTMLElement && scope.modal.contains(active);
    if (event.shiftKey && (!inside || active === first || active === scope.modal)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  private onFocusIn = (event: FocusEvent) => {
    const scope = this.focusScope();
    const target = event.target;
    if (!scope || !(target instanceof Node)) return;
    if (inScope(scope, target)) return;
    const [first] = focusableElements(scope.modal);
    (first ?? scope.modal).focus();
  };
}

/** The app uses the default stack; a provider with a fresh `LayerStack` isolates a subtree. */
export const LayerStackContext = createContext<LayerStack>(new LayerStack());

export function useLayerStack() {
  return useContext(LayerStackContext);
}

export type UseLayerOptions = {
  open: boolean;
  /** Called when Escape is pressed while this layer is on top. Omit to swallow Escape. */
  onEscape?: () => void;
  /** Trap focus inside `containerRef` while open and restore it to the trigger on close. */
  modal?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  /** Element to focus on open; defaults to the first focusable element in the container. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Restore focus to the element that had it on open (default: same as `modal`). */
  restoreFocus?: boolean;
};

/** Register a layer while `open` is true. Returns a function telling whether it is topmost. */
export function useLayer({
  open,
  onEscape,
  modal = false,
  containerRef,
  initialFocusRef,
  restoreFocus = modal,
}: UseLayerOptions) {
  const stack = useLayerStack();
  const recordRef = useRef<LayerRecord | null>(null);
  stack.trackFocus();
  const escapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    escapeRef.current = onEscape;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const record: LayerRecord = {
      onEscape: () => escapeRef.current?.(),
      modal,
      containerRef,
    };
    recordRef.current = record;
    const container = containerRef?.current ?? null;
    const trigger = stack.focusOrigin(container);
    stack.push(record);

    if (modal) {
      if (container && !container.contains(document.activeElement)) {
        const target = initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
        target.focus({ preventScroll: true });
      }
    }

    return () => {
      stack.remove(record);
      if (recordRef.current === record) recordRef.current = null;
      if (!restoreFocus || !trigger || !trigger.isConnected) return;
      const active = document.activeElement;
      // Only pull focus back if it was inside the closing layer or fell to the body.
      if (!active || active === document.body || !container || container.contains(active)) {
        trigger.focus({ preventScroll: true });
      }
    };
    // Options other than `open` are read once per opening on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stack]);

  return () => (recordRef.current ? stack.isTop(recordRef.current) : false);
}
