import { Link } from "react-router";
import type { SetupChecklistItem } from "@teamflow/core";
import { useSetupChecklistQuery, useUpdateSetupProgressMutation } from "../../queries/site";
import { CHECKLIST_LINKS } from "./setupSteps";

const MARKS: Record<SetupChecklistItem["state"], string> = {
  done: "✓",
  skipped: "!",
  todo: "",
  unavailable: "–",
};

/**
 * What's done and what's left after setup. "page" is setup step 5; "card" is the admin Overview
 * card, which lists only open items and can be dismissed.
 */
export function SetupChecklist({ variant }: { variant: "page" | "card" }) {
  const query = useSetupChecklistQuery();
  const dismiss = useUpdateSetupProgressMutation();
  const checklist = query.data;
  if (!checklist) {
    return variant === "page" ? <p className="settings-hint">Loading…</p> : null;
  }

  const items =
    variant === "card"
      ? checklist.items.filter((item) => item.state === "todo" || item.state === "skipped")
      : checklist.items;
  const flowDone = checklist.items.find((item) => item.id === "flow")?.state === "done";

  if (variant === "card" && (checklist.dismissed || items.length === 0)) return null;

  return (
    <section className={`setup-checklist setup-checklist--${variant}`} aria-label="Setup checklist">
      {variant === "card" ? (
        <header className="setup-checklist-head">
          <h3>Finish setting up</h3>
          <span className="muted">
            {checklist.doneCount} of {checklist.total} done
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => dismiss.mutate({ dismissed: true })}
          >
            Dismiss
          </button>
        </header>
      ) : null}
      <ul className="setup-checklist-items">
        {items.map((item) => {
          const open = item.state === "todo" || item.state === "skipped";
          const link = open ? CHECKLIST_LINKS[item.id] : null;
          return (
            <li key={item.id} className={`setup-check setup-check--${item.state}`}>
              <span className="setup-check-mark" aria-hidden="true">
                {MARKS[item.state]}
              </span>
              <span className="setup-check-text">
                {item.title}
                <small>{item.detail}</small>
              </span>
              {link ? <Link to={link.to}>{link.label}</Link> : <span />}
              <span className="sr-only">{item.state}</span>
            </li>
          );
        })}
      </ul>
      {variant === "page" ? (
        <div className="setup-actions">
          <Link className="setup-link-button setup-link-button--quiet" to="/admin/overview">
            Open server admin
          </Link>
          <Link className="setup-link-button" to={flowDone ? "/" : CHECKLIST_LINKS.flow!.to}>
            {flowDone ? "Go to your Flows →" : "Create my first Flow →"}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
