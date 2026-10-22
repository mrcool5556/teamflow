import { useCallback, useRef, useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import { DialogTitle } from "./DialogTitle";
import { ConfirmContext, type ConfirmOptions } from "./confirmContext";

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      backdropClassName="quick-add-backdrop"
      className="quick-add-modal confirm-dialog"
      initialFocusRef={danger ? cancelRef : confirmRef}
    >
      <DialogTitle>{title}</DialogTitle>
      {message ? <div className="confirm-dialog-message">{message}</div> : null}
      <div className="quick-add-actions">
        <button ref={cancelRef} type="button" className="ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={danger ? "danger" : undefined}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

type Pending = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

/** Provides useConfirm(): one confirm dialog at a time, later requests wait their turn. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const nextIdRef = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        nextIdRef.current += 1;
        const id = nextIdRef.current;
        setQueue((current) => [...current, { ...options, id, resolve }]);
      }),
    [],
  );

  const current = queue[0];
  const settle = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((items) => items.slice(1));
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current ? (
        <ConfirmDialog
          key={current.id}
          open
          {...current}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}
