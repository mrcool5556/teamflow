import type { CSSProperties } from "react";

const PREVIEW_COLUMNS = [
  { name: "Backlog", type: "backlog", count: 1 },
  { name: "In Progress", type: "in_progress", count: 2 },
  { name: "Done", type: "done", count: 0 },
] as const;

const PREVIEW_CARDS = [
  { id: "preview-1", identifier: "PREV-1", title: "Sample card — column width", status: "backlog" },
  { id: "preview-2", identifier: "PREV-2", title: "Another card in progress", status: "in_progress" },
  { id: "preview-3", identifier: "PREV-3", title: "Taller cards use min height", status: "in_progress" },
] as const;

export function BoardLayoutPreview() {
  return (
    <div className="board-stack board-layout-preview">
      <div className="board-row has-row-color">
        <div className="row-separator-wrap">
          <div className="row-separator-bar">
            <span className="row-drag-handle preview-muted">⋮⋮</span>
            <span className="row-separator-name preview-label">Preview row</span>
            <span className="preview-chip">Sample layout</span>
          </div>
        </div>

        <div
          className="board-row-grid"
          style={{ "--column-count": PREVIEW_COLUMNS.length } as CSSProperties}
        >
          {PREVIEW_COLUMNS.map((column) => (
            <div
              key={column.name}
              className={`column-label column-label-row column-label--${column.type}`}
            >
              <button type="button" className="label-btn" tabIndex={-1}>
                <span>{column.name}</span>
                <span className="count">{column.count}</span>
              </button>
            </div>
          ))}

          {PREVIEW_COLUMNS.map((column) => {
            const cards = PREVIEW_CARDS.filter((card) => card.status === column.type);
            return (
              <div key={`${column.name}-cell`} className="column cell board-preview-cell">
                <div className="column-body">
                  {cards.map((card) => (
                    <article key={card.id} className="issue-card board-preview-card">
                      <div className="issue-card-header">
                        <span className="issue-id">{card.identifier}</span>
                      </div>
                      <h3 className="issue-card-title">{card.title}</h3>
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <div className="board-preview-empty">Empty column</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
