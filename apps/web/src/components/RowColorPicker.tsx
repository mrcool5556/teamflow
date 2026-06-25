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
      hint="Tints the row header bar, filter field, and column header tops in this row."
    />
  );
}
