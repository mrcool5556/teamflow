import { useCallback, useState } from "react";

export type PanelTone = "success" | "error";

/** How settings sections report back to the panel they sit in. */
export type PanelMessage = (message: string | null, tone?: PanelTone) => void;

export type PanelStatusValue = { text: string; tone: PanelTone } | null;

/** Each settings panel keeps its own last success or error message. */
export function usePanelStatus() {
  const [status, setStatus] = useState<PanelStatusValue>(null);
  const onMessage = useCallback<PanelMessage>(
    (message, tone = "success") => setStatus(message ? { text: message, tone } : null),
    [],
  );
  return { status, onMessage };
}
