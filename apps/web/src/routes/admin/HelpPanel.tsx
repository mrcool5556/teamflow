import { useEffect } from "react";
import { useLocation } from "react-router";
import { useInstanceOverviewQuery } from "../../queries/instance";
import { FIX_HEALTH } from "./adminHealth";
import { HOW_TOS } from "./howTos";
import { StatusDot } from "./OverviewPanel";

/** How-tos for running the server, the ones matching today's checks first. */
export function HelpPanel() {
  const overview = useInstanceOverviewQuery().data;
  const location = useLocation();
  const fixes = overview?.fixes ?? [];
  const active = new Set(fixes.map((fix) => fix.id));
  const matches = (fixIds: string[]) => fixIds.some((id) => active.has(id));
  const ordered = [...HOW_TOS].sort(
    (a, b) => Number(matches(b.fixIds)) - Number(matches(a.fixIds)),
  );

  // Links from the Overview land on #howto-<id>; scroll it into view once rendered.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  }, [location.hash]);

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>How-tos & fixes</h2>
        <p className="settings-copy settings-lead">
          Commands are for the Proxmox LXC install unless they say Windows. Ones that match what the
          Overview found are marked and listed first.
        </p>
      </header>
      <div className="admin-howtos">
        {ordered.map((howTo) => {
          const fix = fixes.find((item) => howTo.fixIds.includes(item.id));
          return (
            <section
              key={howTo.id}
              id={`howto-${howTo.id}`}
              className={`admin-howto${fix ? " admin-howto--active" : ""}`}
              aria-label={howTo.title}
            >
              <header className="admin-tile-head">
                {fix ? <StatusDot health={FIX_HEALTH[fix.severity]} /> : null}
                <h3>{howTo.title}</h3>
                {fix ? <span className="admin-pill admin-pill--warn">found now</span> : null}
              </header>
              <p className="settings-hint">{howTo.when}</p>
              <ol>
                {howTo.steps.map((step, index) => (
                  <li key={index}>
                    {step.text}
                    {step.command ? <code className="admin-command">{step.command}</code> : null}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
