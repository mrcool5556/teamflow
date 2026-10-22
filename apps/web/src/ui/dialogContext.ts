import { createContext } from "react";

/** The id a Dialog or Drawer uses for aria-labelledby; <DialogTitle> renders it. */
export const DialogTitleContext = createContext<string | undefined>(undefined);
