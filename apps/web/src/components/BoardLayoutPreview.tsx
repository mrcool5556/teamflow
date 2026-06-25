import type { CSSProperties } from "react";

const PREVIEW_COLUMNS = [
  { name: "Backlog", type: "backlog", count: 1, color: null },
  { name: "In Progress", type: "in_progress", count: 2, color: "#6366f1" },
  { name: "Done", type: "done", count: 0, color: null },
] as const;

const PREVIEW_CARDS = [
  { id: "preview-1", identifier: "PREV-1", title: "Sample card — column width", status: "backlog" },
  { id: "preview-2", identifier: "PREV-2", title: "Another card in progress", status: "in_progress" },
  { id: "preview-3", identifier: "PREV-3", title: "Taller cards use min height", status: "in_progress" },
] as const;

export function BoardLayoutPreview() {
  return (
    <div className="board-stack board-layout-preview">
      <div
        className="board-row has-row-color"
        style={{ "--row-accent": "#2dd4bf" } as CSSProperties}
      >
        <div className="row-separator-wrap">
          <div className="row-separator-bar">
            <div className="row-separator-main">
              <div className="row-separator-title">
                <span className="row-drag-handle preview-muted">⋮⋮</span>
                <span className="row-separator-name-wrap">
                  <span className="row-separator-name preview-label">Preview row</span>
                </span>
              </div>
              <span className="preview-chip">Shell + team color</span>
            </div>
            <div className="row-separator-search-span">
              <div className="board-search">
                <input type="search" readOnly tabIndex={-1} placeholder="Filter row…" />
              </div>
            </div>
          </div>
        </div>

        <div className="board-row-scroll">
          <div className="board-row-columns">
            {PREVIEW_COLUMNS.map((column) => (
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
                      <span className="column-issue-count">{column.count}</span>
                      <span className="column-label-name-wrap">
                        <span className="column-label-name">{column.name}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="column cell board-preview-cell">
                  <div className="column-body">
                    {PREVIEW_CARDS.filter((card) => card.status === column.type).map((card) => (
                      <article key={card.id} className="issue-card board-preview-card">
                        <div className="issue-card-header">
                          <span className="issue-id">{card.identifier}</span>
                        </div>
                        <h3 className="issue-card-title">{card.title}</h3>
                      </article>
                    ))}
                    {PREVIEW_CARDS.every((card) => card.status !== column.type) ? (
                      <div className="board-preview-empty">Empty column</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
