import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_DELAY_MS = 15000;
export const RESTORE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CHANGE_HISTORY = 30;

export type ChangeHistoryStatus =
  | "pending"
  | "committed"
  | "undone"
  | "failed"
  | "restored";

export type ChangeHistoryEntry = {
  id: string;
  label: string;
  createdAt: number;
  status: ChangeHistoryStatus;
  issueId?: string;
  restorableUntil?: number;
};

type UndoPayload = {
  label: string;
  issueId?: string;
  restore: () => void;
  commit: () => Promise<void>;
  restoreFromTrash?: () => Promise<void>;
};

function createEntryId() {
  return crypto.randomUUID();
}

export function useChangeHistory() {
  const [history, setHistory] = useState<ChangeHistoryEntry[]>([]);
  const payloadsRef = useRef<Map<string, UndoPayload>>(new Map());
  const restoreCallbacksRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const pending = history.find((entry) => entry.status === "pending") ?? null;

  const patchEntry = useCallback(
    (
      id: string,
      status: ChangeHistoryStatus,
      extra?: Pick<ChangeHistoryEntry, "issueId" | "restorableUntil">,
    ) => {
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, status, ...extra } : entry,
        ),
      );
    },
    [],
  );

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (!t) return;
    clearTimeout(t);
    timersRef.current.delete(id);
  }, []);

  const finalizePending = useCallback(
    (id: string, payload: UndoPayload) => {
      const restorableUntil =
        payload.issueId && payload.restoreFromTrash
          ? Date.now() + RESTORE_RETENTION_MS
          : undefined;
      patchEntry(id, "committed", {
        issueId: payload.issueId,
        restorableUntil,
      });
      if (payload.restoreFromTrash) {
        restoreCallbacksRef.current.set(id, payload.restoreFromTrash);
      }
      payloadsRef.current.delete(id);
      timersRef.current.delete(id);
    },
    [patchEntry],
  );

  const schedule = useCallback(
    (payload: UndoPayload) => {
      const id = createEntryId();
      payloadsRef.current.set(id, payload);

      setHistory((prev) => {
        const next: ChangeHistoryEntry = {
          id,
          label: payload.label,
          createdAt: Date.now(),
          status: "pending",
          issueId: payload.issueId,
        };
        return [next, ...prev].slice(0, MAX_CHANGE_HISTORY);
      });

      void (async () => {
        try {
          await payload.commit();
        } catch {
          clearTimer(id);
          payloadsRef.current.delete(id);
          payload.restore();
          patchEntry(id, "failed");
          return;
        }

        const t = setTimeout(() => {
          const current = payloadsRef.current.get(id);
          if (!current) return;
          finalizePending(id, current);
        }, UNDO_DELAY_MS);
        timersRef.current.set(id, t);
      })();
    },
    [clearTimer, finalizePending, patchEntry],
  );

  const undoEntry = useCallback(
    async (id: string) => {
      const payload = payloadsRef.current.get(id);
      if (!payload) return;
      const entry = history.find((item) => item.id === id);
      if (!entry || entry.status !== "pending") return;

      clearTimer(id);
      payloadsRef.current.delete(id);

      try {
        if (payload.restoreFromTrash) {
          await payload.restoreFromTrash();
        } else {
          payload.restore();
        }
        patchEntry(id, "undone");
      } catch {
        patchEntry(id, "failed");
      }
    },
    [clearTimer, history, patchEntry],
  );

  const restoreEntry = useCallback(
    async (id: string) => {
      const entry = history.find((item) => item.id === id);
      if (!entry || entry.status !== "committed") return;
      if (!entry.restorableUntil || entry.restorableUntil <= Date.now()) return;

      const restoreFromTrash = restoreCallbacksRef.current.get(id);
      if (!restoreFromTrash) return;

      try {
        await restoreFromTrash();
        patchEntry(id, "restored");
        restoreCallbacksRef.current.delete(id);
      } catch {
        patchEntry(id, "failed");
      }
    },
    [history, patchEntry],
  );

  const undo = useCallback(() => {
    const id = history.find((entry) => entry.status === "pending")?.id;
    if (!id) return;
    void undoEntry(id);
  }, [history, undoEntry]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  return { history, pending, schedule, undo, undoEntry, restoreEntry };
};
