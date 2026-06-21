import { BoardColorPicker } from "./BoardColorPicker";

type RowColorPickerProps = {
  color: string | null;
  onSelect: (color: string | null) => void;
};

export function RowColorPicker({ color, onSelect }: RowColorPickerProps) {
  return (
    <BoardColorPicker
      color={color}
      onSelect={onSelect}
      title="Row color"
      label="Color"
      hint="Applies to this row bar and column headers."
    />
  );
}
