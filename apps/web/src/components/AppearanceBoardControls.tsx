import type { UserProfile } from "@teamflow/core";
import {
  BOARD_COLUMN_WIDTH_MODES,
  BOARD_COLUMN_WIDTH_STEP,
  MAX_BOARD_COLUMN_WIDTH,
  MAX_CARD_MIN_HEIGHT,
  MIN_BOARD_COLUMN_WIDTH,
  MIN_CARD_MIN_HEIGHT,
  boardColumnWidthMode,
  clampBoardColumnWidth,
  clampCardMinHeight,
  mergeUserProfile,
} from "@teamflow/core";

type AppearanceBoardControlsProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
};

/** Column width (Auto / Custom) and card min height; they apply to every row on the board. */
export function AppearanceBoardControls({
  profile,
  onProfileChange,
}: AppearanceBoardControlsProps) {
  const columnWidthMode = boardColumnWidthMode(profile.board);
  return (
    <>
      <div className="settings-range">
        <span id="column-width-mode-label">Column width</span>
        <div className="segmented" role="radiogroup" aria-labelledby="column-width-mode-label">
          {BOARD_COLUMN_WIDTH_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={columnWidthMode === mode}
              className={columnWidthMode === mode ? "active" : undefined}
              onClick={() =>
                onProfileChange(mergeUserProfile(profile, { board: { columnWidthMode: mode } }))
              }
            >
              {mode === "auto" ? "Auto" : "Custom"}
            </button>
          ))}
        </div>
        {columnWidthMode === "auto" ? (
          <p className="settings-hint">
            Fits four columns in the window (300–420px each); wider boards scroll sideways.
          </p>
        ) : (
          <label className="settings-range-row">
            <span className="sr-only">Custom column width</span>
            <input
              type="range"
              min={MIN_BOARD_COLUMN_WIDTH}
              max={MAX_BOARD_COLUMN_WIDTH}
              step={BOARD_COLUMN_WIDTH_STEP}
              value={profile.board.columnWidth}
              onChange={(e) => {
                onProfileChange(
                  mergeUserProfile(profile, {
                    board: {
                      columnWidth: clampBoardColumnWidth(Number(e.target.value)),
                      columnWidthMode: "custom",
                    },
                  }),
                );
              }}
            />
            <span className="settings-range-value">{profile.board.columnWidth}px</span>
          </label>
        )}
      </div>
      <label className="settings-range">
        Card min height
        <div className="settings-range-row">
          <input
            type="range"
            min={MIN_CARD_MIN_HEIGHT}
            max={MAX_CARD_MIN_HEIGHT}
            step={4}
            value={profile.board.cardMinHeight}
            onChange={(e) => {
              onProfileChange(
                mergeUserProfile(profile, {
                  board: {
                    cardMinHeight: clampCardMinHeight(Number(e.target.value)),
                  },
                }),
              );
            }}
          />
          <span className="settings-range-value">{profile.board.cardMinHeight}px</span>
        </div>
      </label>
    </>
  );
}
