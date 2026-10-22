import { createContext, useContext } from "react";

/** Message for an unknown thrown value, with a fallback for non-Error throws. */
export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export type ErrorSink = {
  /** The message the shell's error banner shows, if any. */
  error: string | null;
  /** Show `err` (or `fallback` when it carries no message) in the banner. */
  report: (err: unknown, fallback: string) => void;
  /** Show a plain message in the banner. */
  show: (message: string) => void;
  clear: () => void;
};

export const ErrorSinkContext = createContext<ErrorSink | null>(null);

/** One place every failed action reports to; the shell renders it as the error banner. */
export function useErrorSink() {
  const sink = useContext(ErrorSinkContext);
  if (!sink) throw new Error("useErrorSink needs an ErrorSinkProvider");
  return sink;
}
