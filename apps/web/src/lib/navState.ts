import type { Location } from "react-router";

/**
 * Router location state used across screens: where to return after login, a row/column ref
 * for the board to open, and a one-off notice (for example "Joined team …").
 */
export type NavState = {
  from?: Pick<Location, "pathname" | "search" | "state">;
  ref?: string;
  notice?: string;
} | null;
