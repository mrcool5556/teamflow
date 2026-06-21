import type { UserProfile } from "@teamflow/core";
import {
  BOARD_COLUMN_WIDTH_STEP,
  DEFAULT_BOARD_COLUMN_WIDTH,
  DEFAULT_CARD_MIN_HEIGHT,
  MAX_BOARD_COLUMN_WIDTH,
  MAX_CARD_MIN_HEIGHT,
  MIN_BOARD_COLUMN_WIDTH,
  MIN_CARD_MIN_HEIGHT,
  clampBoardColumnWidth,
  clampCardMinHeight,
  mergeUserProfile,
} from "@teamflow/core";

type AdvancedProfileSettingsSectionProps = {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  profileImportText: string;
  onProfileImportTextChange: (value: string) => void;
  profileMessage: string | null;
  onExportProfile: () => void | Promise<void>;
  onImportProfile: () => void | Promise<void>;
};

export function AdvancedProfileSettingsSection({
  profile,
  onProfileChange,
  profileImportText,
  onProfileImportTextChange,
  profileMessage,
  onExportProfile,
  onImportProfile,
}: AdvancedProfileSettingsSectionProps) {
  return (
    <section className="settings-section">
      <h3>Advanced</h3>
      <details className="settings-advanced">
        <summary className="settings-advanced-toggle">Board layout &amp; profile backup</summary>
        <div className="settings-advanced-panel">
          <div className="settings-subsection">
            <h4>Board</h4>
            <p className="settings-copy">
              Column width and card height apply to every row on your board. Changes preview live
              on the right.
            </p>
            <label className="settings-range">
              Column width
              <div className="settings-range-row">
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
                        },
                      }),
                    );
                  }}
                />
                <span className="settings-range-value">{profile.board.columnWidth}px</span>
              </div>
            </label>
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
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onProfileChange(
                  mergeUserProfile(profile, {
                    board: {
                      columnWidth: DEFAULT_BOARD_COLUMN_WIDTH,
                      cardMinHeight: DEFAULT_CARD_MIN_HEIGHT,
                    },
                  }),
                );
              }}
            >
              Reset board layout defaults
            </button>
          </div>

          <div className="settings-subsection">
            <h4>Profile backup &amp; sharing</h4>
            <p className="settings-copy">
              Download your profile JSON or paste one from another user. Import replaces
              your saved appearance and board preferences.
            </p>
            <div className="row settings-actions">
              <button type="button" onClick={() => void onExportProfile()}>
                Export profile
              </button>
            </div>
            <label>
              Import profile JSON
              <textarea
                className="profile-import"
                rows={6}
                value={profileImportText}
                onChange={(e) => onProfileImportTextChange(e.target.value)}
                placeholder="Paste exported profile JSON here…"
              />
            </label>
            <button
              type="button"
              className="ghost"
              disabled={!profileImportText.trim()}
              onClick={() => void onImportProfile()}
            >
              Import profile
            </button>
            {profileMessage ? <p className="settings-hint">{profileMessage}</p> : null}
          </div>
        </div>
      </details>
    </section>
  );
}
