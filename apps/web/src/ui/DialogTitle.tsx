import { useContext, type ElementType, type HTMLAttributes } from "react";
import { DialogTitleContext } from "./dialogContext";

type DialogTitleProps = HTMLAttributes<HTMLElement> & { as?: ElementType };

/** The element that names the surrounding Dialog or Drawer. */
export function DialogTitle({ as: Tag = "h2", ...props }: DialogTitleProps) {
  const id = useContext(DialogTitleContext);
  return <Tag {...props} id={id} />;
}
