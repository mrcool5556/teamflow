import {
  ROADMAP_ACCOUNTS,
  ROADMAP_DEPLOY_STEPS,
  ROADMAP_FOCUS,
  ROADMAP_IDEAS,
  ROADMAP_META,
  ROADMAP_POLISH,
  ROADMAP_SHIPPED,
  countByStatus,
  type RoadmapItem,
  type RoadmapStatus,
} from "../data/roadmap";

const STATUS_LABEL: Record<RoadmapStatus, string> = {
  done: "Done",
  focus: "Focus",
  planned: "Planned",
  gap: "Gap",
  partial: "Partial",
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
  return <span className={`roadmap-badge roadmap-badge--${status}`}>{STATUS_LABEL[status]}</span>;
}

function FocusCard({ item }: { item: RoadmapItem }) {
  return (
    <article className="roadmap-focus-card">
      <div className="roadmap-focus-card-head">
        <span className="roadmap-priority">P{item.priority}</span>
        <StatusBadge status={item.status} />
      </div>
      <h3>{item.title}</h3>
      {item.notes && <p>{item.notes}</p>}
      {item.tags && item.tags.length > 0 && (
        <div className="roadmap-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="roadmap-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function RoadmapPanel() {
  const polishGaps = countByStatus(ROADMAP_POLISH, "gap");
  const polishDone = countByStatus(ROADMAP_POLISH, "done");
  const accountGaps = ROADMAP_ACCOUNTS.filter((item) => item.status === "gap").length;

  return (
    <div className="roadmap-panel">
      <header className="roadmap-hero">
        <div>
          <p className="eyebrow">PLAN & BACKLOG</p>
          <h2>{ROADMAP_META.title}</h2>
          <p className="roadmap-hero-copy">{ROADMAP_META.tagline}</p>
        </div>
        <p className="roadmap-updated muted">Updated {ROADMAP_META.updated}</p>
      </header>

      <div className="roadmap-stats">
        <div className="roadmap-stat">
          <span className="roadmap-stat-value">{ROADMAP_FOCUS.length}</span>
          <span className="roadmap-stat-label">Current focus</span>
        </div>
        <div className="roadmap-stat">
          <span className="roadmap-stat-value">{polishGaps + accountGaps}</span>
          <span className="roadmap-stat-label">Open gaps</span>
        </div>
        <div className="roadmap-stat">
          <span className="roadmap-stat-value">{polishDone}</span>
          <span className="roadmap-stat-label">Recent fixes</span>
        </div>
        <div className="roadmap-stat">
          <span className="roadmap-stat-value">{ROADMAP_SHIPPED.length}</span>
          <span className="roadmap-stat-label">Shipped (Jun)</span>
        </div>
      </div>

      <section className="roadmap-section">
        <h3>Current focus — do first</h3>
        <div className="roadmap-focus-grid">
          {ROADMAP_FOCUS.map((item) => (
            <FocusCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <div className="roadmap-columns">
        <section className="roadmap-section roadmap-section--panel">
          <h3>Accounts & switching PCs</h3>
          <p className="roadmap-section-copy muted">
            What works today vs what still needs building for multi-user and new machines.
          </p>
          <ul className="roadmap-checklist">
            {ROADMAP_ACCOUNTS.map((item) => (
              <li key={item.id} className="roadmap-check-item">
                <StatusBadge status={item.status} />
                <div>
                  <strong>{item.label}</strong>
                  {item.note && <p className="muted">{item.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="roadmap-section roadmap-section--panel">
          <h3>Deploy path</h3>
          <p className="roadmap-section-copy muted">
            How to go from this laptop to a URL anyone can log into.
          </p>
          <ol className="roadmap-steps">
            {ROADMAP_DEPLOY_STEPS.map((step) => (
              <li key={step.label} className="roadmap-step">
                <span className="roadmap-step-label">{step.step}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p className="muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="roadmap-section">
        <h3>Polish & fixes (this session)</h3>
        <p className="roadmap-section-copy muted">
          Recent UI work and known follow-ups from board/drawer testing.
        </p>
        <div className="roadmap-table-wrap">
          <table className="roadmap-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ROADMAP_POLISH.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    {item.tags && (
                      <div className="roadmap-tags">
                        {item.tags.map((tag) => (
                          <span key={tag} className="roadmap-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="muted">{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="roadmap-section">
        <h3>Ideas backlog</h3>
        <p className="roadmap-section-copy muted">
          Build after current focus. Say &quot;Idea:&quot; in chat to add without switching tasks.
        </p>
        <div className="roadmap-ideas-grid">
          {ROADMAP_IDEAS.map((group) => (
            <article key={group.id} className="roadmap-idea-group">
              <h4>{group.title}</h4>
              {group.summary && <p className="muted">{group.summary}</p>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <StatusBadge status={item.status} />
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="roadmap-section">
        <h3>Shipped</h3>
        <ul className="roadmap-shipped-list">
          {ROADMAP_SHIPPED.map((item) => (
            <li key={item.title}>
              <span className="roadmap-shipped-date">{item.date}</span>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
