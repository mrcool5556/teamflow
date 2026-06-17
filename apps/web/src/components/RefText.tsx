import { RichText } from "./RichText";

type RefTextProps = {
  text: string;
  onRef: (ref: string) => void;
  className?: string;
};

export function RefText({ text, onRef, className }: RefTextProps) {
  return <RichText text={text} onRef={onRef} className={className} />;
}
