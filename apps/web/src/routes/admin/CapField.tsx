import { useId } from "react";
import { CAP_PRESETS_GB, capFromDraft, gbToBytes, type CapDraft } from "./capBytes";

/** GB number, preset buttons and a No limit tick. */
export function CapField({
  label,
  value,
  onChange,
  allowNoLimit = true,
  hint,
  disabled,
}: {
  label: string;
  value: CapDraft;
  onChange: (next: CapDraft) => void;
  allowNoLimit?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const invalid = capFromDraft(value) === "invalid";
  return (
    <div className="settings-field">
      <label className="settings-field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="admin-cap-row">
        <span className="admin-cap-input">
          <input
            id={inputId}
            inputMode="decimal"
            value={value.noLimit ? "" : value.gbText}
            placeholder={value.noLimit ? "No limit" : "GB"}
            disabled={disabled || value.noLimit}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange({ gbText: e.target.value, noLimit: false })}
          />
          <span aria-hidden="true">GB</span>
        </span>
        <span className="admin-seg" role="group" aria-label="Presets">
          {CAP_PRESETS_GB.map((gb) => {
            const active = !value.noLimit && gbToBytes(value.gbText) === gbToBytes(String(gb));
            return (
              <button
                key={gb}
                type="button"
                className={active ? "active" : undefined}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onChange({ gbText: String(gb), noLimit: false })}
              >
                {gb} GB
              </button>
            );
          })}
        </span>
        {allowNoLimit ? (
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={value.noLimit}
              disabled={disabled}
              onChange={(e) => onChange({ gbText: value.gbText || "1", noLimit: e.target.checked })}
            />
            No limit
          </label>
        ) : null}
      </div>
      {invalid ? (
        <span className="settings-field-hint admin-bad" role="alert">
          Enter a size in GB greater than 0.
        </span>
      ) : hint ? (
        <span className="settings-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
