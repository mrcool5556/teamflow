import type { CSSProperties } from "react";

export type DesignPreviewView = "board" | "drawer" | "settings";

const CARDS = [
  {
    id: "ENG-41",
    title: "Fix the login redirect",
    due: "Yesterday",
    dueState: "overdue",
    priority: "high",
  },
  {
    id: "ENG-42",
    title: "Write the release notes",
    due: "Fri 7",
    dueState: "later",
    priority: "medium",
  },
  { id: "ENG-43", title: "Board tips popover", due: null, dueState: null, priority: "low" },
] as const;

function Card({ card }: { card: (typeof CARDS)[number] }) {
  return (
    <article className="issue-card design-preview-card">
      <div className="issue-card-header">
        <span className="issue-id">{card.id}</span>
        <div className="issue-card-header-meta">
          {card.due ? (
            <span className={`due-chip due-chip--${card.dueState}`}>{card.due}</span>
          ) : null}
          <span className={`priority-badge priority-${card.priority}`}>{card.priority}</span>
        </div>
      </div>
      <h3 className="issue-card-title">{card.title}</h3>
    </article>
  );
}

function Column({
  name,
  type,
  cards,
}: {
  name: string;
  type: string;
  cards: (typeof CARDS)[number][];
}) {
  return (
    <div className="board-column-stack">
      <div className={`column-label column-label-row column-label--${type}`}>
        <div className="column-label-main">
          <div className="column-label-title">
            <span className="column-issue-count">{cards.length}</span>
            <span className="column-label-name-wrap">
              <span className="column-label-name">{name}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="column cell design-preview-cell">
        <div className="column-body">
          {cards.map((card) => (
            <Card key={card.id} card={card} />
          ))}
          <button type="button" className="ghost add-card-btn" tabIndex={-1}>
            + Add issue
          </button>
        </div>
      </div>
    </div>
  );
}

function Fields() {
  return (
    <>
      <label className="design-preview-field">
        <span className="issue-drawer-label">Title</span>
        <input type="text" defaultValue="Write the release notes" tabIndex={-1} readOnly />
      </label>
      <label className="design-preview-field">
        <span className="issue-drawer-label">Status</span>
        <select defaultValue="doing" tabIndex={-1} disabled>
          <option value="doing">Doing</option>
        </select>
      </label>
      <label className="design-preview-field">
        <span className="issue-drawer-label">Note</span>
        <input type="text" placeholder="Add a note…" tabIndex={-1} readOnly />
      </label>
      <label className="appearance-switch">
        <input type="checkbox" role="switch" defaultChecked tabIndex={-1} />
        <span className="appearance-switch-track" aria-hidden="true" />
        <span>Notify the team</span>
      </label>
    </>
  );
}

/**
 * Large sample of the app for the Design page, built from the real class names so every aspect
 * shows on it: topbar, a row with columns and cards (ids, due and priority chips), buttons,
 * fields and a switch. Three views: the board, the board with a drawer open, and a settings
 * group. Nothing in it is interactive.
 */
export function DesignPreview({ view }: { view: DesignPreviewView }) {
  return (
    <div className={`design-preview-app design-preview-app--${view}`} inert>
      <div className="topbar design-preview-topbar">
        <span className="topbar-brand">TEAMFLOW</span>
        <span className="design-preview-spacer" />
        <button type="button" className="ghost topbar-btn" tabIndex={-1}>
          Files
        </button>
        <button type="button" className="ghost topbar-btn" tabIndex={-1}>
          Plan
        </button>
        <span className="user-menu-trigger design-preview-avatar">DU</span>
      </div>

      {view === "settings" ? (
        <div className="design-preview-body">
          <section className="appearance-group design-preview-settings">
            <header className="appearance-group-header">
              <h3>Notifications</h3>
            </header>
            <div className="segmented design-preview-segmented">
              <button type="button" className="active" tabIndex={-1}>
                All
              </button>
              <button type="button" tabIndex={-1}>
                Mentions
              </button>
              <button type="button" tabIndex={-1}>
                None
              </button>
            </div>
            <Fields />
            <label className="settings-checkbox">
              <input type="checkbox" defaultChecked tabIndex={-1} />
              <span>Email me a daily summary</span>
            </label>
            <div className="design-preview-actions">
              <button type="button" tabIndex={-1}>
                Save
              </button>
              <button type="button" className="ghost" tabIndex={-1}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="design-preview-body">
          <div className="design-preview-toolbar">
            <button type="button" tabIndex={-1}>
              + Add row
            </button>
            <button type="button" className="ghost" tabIndex={-1}>
              ? Board tips
            </button>
            <button type="button" className="row-bar-action" tabIndex={-1}>
              Files
            </button>
          </div>
          <div
            className="board-row has-row-color design-preview-row"
            style={{ "--row-accent": "#2dd4bf" } as CSSProperties}
          >
            <div className="row-separator-wrap">
              <div className="row-separator-bar">
                <div className="row-separator-main">
                  <div className="row-separator-title">
                    <span className="row-separator-name-wrap">
                      <span className="row-separator-name">Release 2.0</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="design-preview-columns">
              <Column name="Todo" type="backlog" cards={[CARDS[0], CARDS[1]]} />
              <Column name="Doing" type="in_progress" cards={[CARDS[2]]} />
            </div>
          </div>

          {view === "drawer" ? (
            <aside className="drawer design-preview-drawer">
              <div className="issue-drawer-surface design-preview-drawer-body">
                <strong className="design-preview-drawer-title">ENG-42</strong>
                <Fields />
                <div className="design-preview-actions">
                  <button type="button" tabIndex={-1}>
                    Mark done
                  </button>
                  <button type="button" className="ghost" tabIndex={-1}>
                    Close
                  </button>
                  <button type="button" className="danger" tabIndex={-1}>
                    Delete
                  </button>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
