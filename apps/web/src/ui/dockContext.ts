import { createContext } from "react";

/** Mount points inside the bottom dock: a bar slot (bulk actions) stacked above the toasts. */
export type DockSlots = { bar: HTMLElement | null; toasts: HTMLElement | null };

export const DockContext = createContext<DockSlots>({ bar: null, toasts: null });
