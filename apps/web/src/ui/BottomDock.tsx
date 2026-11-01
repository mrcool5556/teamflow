import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DockContext } from "./dockContext";
import { ToastContext, type ToastAction, type ToastInput } from "./toastContext";

type QueuedToast = ToastInput & { id: number };

/**
 * One fixed column at the bottom centre of the screen. Anything docked there (the bulk action
 * bar, the undo toast, error toasts) stacks instead of overlapping: the bar slot sits above the
 * toast region, and toasts stack in the order they appear.
 */
export function BottomDockProvider({ children }: { children: ReactNode }) {
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [toasts, setToasts] = useState<HTMLElement | null>(null);
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setQueue((items) => items.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      nextIdRef.current += 1;
      const id = nextIdRef.current;
      setQueue((items) => [...items, { ...toast, id }]);
      const timeout = toast.timeoutMs ?? (toast.tone === "error" ? 0 : 6000);
      if (timeout > 0)
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), timeout),
        );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const toastApi = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <DockContext.Provider value={{ bar, toasts }}>
      <ToastContext.Provider value={toastApi}>
        {children}
        {queue.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            action={toast.action}
            onDismiss={() => dismiss(toast.id)}
          >
            {toast.message}
          </Toast>
        ))}
      </ToastContext.Provider>
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
  action?: ToastAction;
  onDismiss?: () => void;
};

/** A docked message. Errors are announced assertively and can be dismissed. */
export function Toast({ tone = "info", children, action, onDismiss }: ToastProps) {
  return (
    <Docked slot="toasts">
      <div
        className={`toast toast--${tone}`}
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
      >
        <span className="toast-message">{children}</span>
        {action ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              onDismiss?.();
              action.onClick();
            }}
          >
            {action.label}
          </button>
        ) : null}
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
