import { useCallback, useEffect, useRef, useState } from "react";

export const UNDO_DELAY_MS = 15000;
export const RESTORE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CHANGE_HISTORY = 30;

export type ChangeHistoryStatus = "pending" | "committed" | "undone" | "failed" | "restored";

export type ChangeHistoryEntry = {
  id: string;
  label: string;
  createdAt: number;
  status: ChangeHistoryStatus;
  issueId?: string;
  restorableUntil?: number;
};

/**
 * A delete the user can undo. Undo must also hold on the server, so there are two shapes:
 *
 * - `timing: "now"` deletes on the server at once (issues go to the trash) and undoes with
 *   `restoreFromTrash`, which also serves "Restore" in the history for a week.
 * - `timing: "deferred"` sends the delete only when the undo window closes (rows and columns
 *   have no restore route); undo then never reaches the server.
 *
 * `restore` puts the item back on screen; it runs on undo and when the delete fails.
 */
export type UndoPayload = {
  label: string;
  issueId?: string;
  restore: () => void;
  commit: () => Promise<void>;
} & ({ timing: "deferred" } | { timing: "now"; restoreFromTrash: () => Promise<void> });

function createEntryId() {
  return crypto.randomUUID();
}

export function useChangeHistory() {
  const [history, setHistory] = useState<ChangeHistoryEntry[]>([]);
  const payloadsRef = useRef<Map<string, UndoPayload>>(new Map());
  /** In-flight "now" deletes; undo waits for them so the restore lands after the delete. */
  const commitsRef = useRef<Map<string, Promise<boolean>>>(new Map());
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
        prev.map((entry) => (entry.id === id ? { ...entry, status, ...extra } : entry)),
      );
    },
    [],
  );

  const runCommit = useCallback(
    async (id: string, payload: UndoPayload) => {
      try {
        await payload.commit();
        return true;
      } catch {
        payloadsRef.current.delete(id);
        const timer = timersRef.current.get(id);
        if (timer) clearTimeout(timer);
        timersRef.current.delete(id);
        payload.restore();
        patchEntry(id, "failed");
        return false;
      }
    },
    [patchEntry],
  );

  const closeWindow = useCallback(
    async (id: string) => {
      const payload = payloadsRef.current.get(id);
      if (!payload) return;
      timersRef.current.delete(id);
      if (payload.timing === "deferred" && !(await runCommit(id, payload))) return;
      if (payload.timing === "now" && !(await commitsRef.current.get(id))) return;
      payloadsRef.current.delete(id);
      commitsRef.current.delete(id);
      if (payload.timing === "now") {
        restoreCallbacksRef.current.set(id, payload.restoreFromTrash);
      }
      patchEntry(id, "committed", {
        issueId: payload.issueId,
        restorableUntil: payload.timing === "now" ? Date.now() + RESTORE_RETENTION_MS : undefined,
      });
    },
    [patchEntry, runCommit],
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

      if (payload.timing === "now") {
        commitsRef.current.set(id, runCommit(id, payload));
      }
      timersRef.current.set(
        id,
        setTimeout(() => void closeWindow(id), UNDO_DELAY_MS),
      );
    },
    [closeWindow, runCommit],
  );

  const undoEntry = useCallback(
    async (id: string) => {
      const payload = payloadsRef.current.get(id);
      if (!payload) return;
      const entry = history.find((item) => item.id === id);
      if (!entry || entry.status !== "pending") return;

      const timer = timersRef.current.get(id);
      if (timer) clearTimeout(timer);
      timersRef.current.delete(id);
      payloadsRef.current.delete(id);

      try {
        if (payload.timing === "now") {
          const committed = await commitsRef.current.get(id);
          commitsRef.current.delete(id);
          // A failed delete already put the item back and marked the entry.
          if (!committed) return;
          await payload.restoreFromTrash();
        }
        payload.restore();
        patchEntry(id, "undone");
      } catch {
        patchEntry(id, "failed");
      }
    },
    [history, patchEntry],
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

  // Leaving the page (or the shell) ends every undo window: send the deferred deletes.
  useEffect(() => {
    const payloads = payloadsRef.current;
    const timers = timersRef.current;
    function flushDeferred() {
      for (const [id, payload] of payloads) {
        if (payload.timing !== "deferred") continue;
        payloads.delete(id);
        void payload.commit().catch(() => undefined);
      }
    }
    window.addEventListener("pagehide", flushDeferred);
    return () => {
      window.removeEventListener("pagehide", flushDeferred);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      flushDeferred();
    };
  }, []);

  return { history, pending, schedule, undo, undoEntry, restoreEntry };
}
