import { createContext, useContext, type ReactNode } from "react";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button is styled as danger and Cancel gets focus. */
  danger?: boolean;
};

/** Ask the user to confirm; resolves true on confirm, false on cancel, Escape or backdrop. */
export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<Confirm | null>(null);

/** The in-app replacement for window.confirm. Needs a <ConfirmProvider> above it. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a ConfirmProvider");
  return confirm;
}
