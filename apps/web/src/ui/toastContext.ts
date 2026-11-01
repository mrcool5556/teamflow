import { createContext, useContext } from "react";

export type ToastAction = { label: string; onClick: () => void };

export type ToastInput = {
  tone?: "info" | "error";
  message: string;
  /** One button next to the message, e.g. Retry. Clicking it also dismisses the toast. */
  action?: ToastAction;
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. Info 6 s, errors stay. */
  timeoutMs?: number;
};

export type Toasts = {
  push: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<Toasts>({ push: () => 0, dismiss: () => {} });

/** Show short messages in the bottom dock's toast region (needs a BottomDockProvider). */
export function useToasts() {
  return useContext(ToastContext);
}
