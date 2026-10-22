import { useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DockContext } from "./dockContext";

/**
 * One fixed column at the bottom centre of the screen. Anything docked there (the bulk action
 * bar, the undo toast, error toasts) stacks instead of overlapping: the bar slot sits above the
 * toast region, and toasts stack in the order they appear.
 */
export function BottomDockProvider({ children }: { children: ReactNode }) {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<HTMLElement | null>(null);
  return (
    <DockContext.Provider value={{ bar, toasts }}>
      {children}
      <div className="bottom-dock">
        <div ref={setBar} className="bottom-dock-bar" />
        <div ref={setToasts} className="toast-region" role="region" aria-label="Notifications" />
      </div>
    </DockContext.Provider>
  );
}

/** Render `children` into a dock slot (inline when there is no dock, e.g. in isolated tests). */
export function Docked({ slot, children }: { slot: "bar" | "toasts"; children: ReactNode }) {
  const target = useContext(DockContext)[slot];
  return target ? createPortal(children, target) : <>{children}</>;
}

type ToastProps = {
  tone?: "info" | "error";
  children: ReactNode;
  onDismiss?: () => void;
};

/** A docked message. Errors are announced assertively and can be dismissed. */
export function Toast({ tone = "info", children, onDismiss }: ToastProps) {
  return (
    <Docked slot="toasts">
      <div
        className={`toast toast--${tone}`}
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
      >
        <span className="toast-message">{children}</span>
        {onDismiss ? (
          <button
            type="button"
            className="ghost toast-dismiss"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>
    </Docked>
  );
}
