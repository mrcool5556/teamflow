import type { CSSProperties } from "react";

const PREVIEW_COLUMNS = [
  { name: "Todo", type: "backlog", color: null },
  { name: "Doing", type: "in_progress", color: "#6366f1" },
] as const;

const PREVIEW_CARDS = [
  { id: "preview-1", identifier: "ENG-1", title: "Write the release notes", status: "backlog" },
  { id: "preview-2", identifier: "ENG-2", title: "Fix the login redirect", status: "backlog" },
  { id: "preview-3", identifier: "ENG-3", title: "Review board tips", status: "in_progress" },
] as const;

/**
 * Static sample of the app for the Appearance panel, built from the real class names so the
 * theme, colours, UI style and corners apply to it: a topbar, a coloured row, column headers,
 * cards, a primary button and the edge of an open drawer. Nothing in it is interactive.
 */
export function BoardLayoutPreview() {
  return (
    <div className="board-layout-preview" inert>
      <div className="topbar board-layout-preview-topbar">
        <span className="topbar-brand">TEAMFLOW</span>
        <span className="board-layout-preview-spacer" />
        <button type="button" className="ghost topbar-btn" tabIndex={-1}>
          Files
        </button>
        <span className="user-menu-trigger board-layout-preview-avatar">DU</span>
      </div>

      <div className="board-layout-preview-body">
        <div className="board-stack">
          <div
            className="board-row has-row-color"
            style={{ "--row-accent": "#2dd4bf" } as CSSProperties}
          >
            <div className="row-separator-wrap">
              <div className="row-separator-bar">
                <div className="row-separator-main">
                  <div className="row-separator-title">
                    <span className="row-separator-name-wrap">
                      <span className="row-separator-name preview-label">Sample row</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="board-row-columns">
              {PREVIEW_COLUMNS.map((column) => {
                const cards = PREVIEW_CARDS.filter((card) => card.status === column.type);
                return (
                  <div key={column.name} className="board-column-stack">
                    <div
                      className={`column-label column-label-row column-label--${column.type}${column.color ? " has-column-color" : ""}`}
                      style={
                        column.color
                          ? ({ "--column-accent": column.color } as CSSProperties)
                          : undefined
                      }
                    >
                      <div className="column-label-main">
                        <div className="column-label-title">
                          <span className="column-issue-count">{cards.length}</span>
                          <span className="column-label-name-wrap">
                            <span className="column-label-name">{column.name}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="column cell board-preview-cell">
                      <div className="column-body">
                        {cards.map((card) => (
                          <article key={card.id} className="issue-card board-preview-card">
                            <div className="issue-card-header">
                              <span className="issue-id">{card.identifier}</span>
                            </div>
                            <h3 className="issue-card-title">{card.title}</h3>
                          </article>
                        ))}
                      </div>
                      {column.type === "in_progress" ? (
                        <button
                          type="button"
                          className="board-layout-preview-primary"
                          tabIndex={-1}
                        >
                          + Add issue
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="board-layout-preview-drawer">
          <strong className="board-layout-preview-drawer-title">ENG-3</strong>
          <span className="issue-drawer-label">Status</span>
          <span className="board-layout-preview-field">Doing ▾</span>
          <button type="button" className="ghost" tabIndex={-1}>
            ✓ Done
          </button>
        </div>
      </div>
    </div>
  );
}
