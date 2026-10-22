import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks a few browser APIs the board relies on.
if (!globalThis.CSS?.escape) {
  (globalThis as { CSS?: unknown }).CSS = {
    escape: (value: string) => value.replace(/["\\]/g, "\\$&"),
  };
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
