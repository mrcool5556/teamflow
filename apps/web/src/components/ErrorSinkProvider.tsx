import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ErrorSinkContext, errorMessage } from "../lib/errorSink";

export function ErrorSinkProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const report = useCallback(
    (err: unknown, fallback: string) => setError(errorMessage(err, fallback)),
    [],
  );
  const clear = useCallback(() => setError(null), []);
  const value = useMemo(() => ({ error, report, show: setError, clear }), [error, report, clear]);
  return <ErrorSinkContext.Provider value={value}>{children}</ErrorSinkContext.Provider>;
}
