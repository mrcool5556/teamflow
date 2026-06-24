type BoardSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  "aria-label": string;
};

export function BoardSearchInput({
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: BoardSearchInputProps) {
  return (
    <div className={`board-search ${className ?? ""}`.trim()}>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
      {value ? (
        <button
          type="button"
          className="ghost board-search-clear"
          aria-label="Clear search"
          title="Clear search"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
