import { useMatch } from "react-router";
import type { SettingsPanel } from "../components/SettingsNav";

export const SETTINGS_PANELS: SettingsPanel[] = [
  "general",
  "appearance",
  "team",
  "roles",
  "integrations",
  "updates",
  "tokens",
];

export function isSettingsPanel(value: string | null | undefined): value is SettingsPanel {
  return SETTINGS_PANELS.includes(value as SettingsPanel);
}

export type AuthMode = "login" | "register" | "reset";

/** Everything the shell needs to know about the current URL. */
export function useAppRoute() {
  const team = useMatch("/t/:teamKey/*");
  const issue = useMatch("/t/:teamKey/issue/:issueRef");
  const teamSettings = useMatch("/t/:teamKey/settings/:panel");
  const settings = useMatch("/settings/:panel");
  const teamPlan = useMatch("/t/:teamKey/plan");
  const plan = useMatch("/plan");
  const login = useMatch("/login");
  const register = useMatch("/register");
  const reset = useMatch("/reset");
  const invite = useMatch("/invite/:token");
  const index = useMatch("/");

  const panel = teamSettings?.params.panel ?? settings?.params.panel;
  const authMode: AuthMode | null = login
    ? "login"
    : register
      ? "register"
      : reset
        ? "reset"
        : null;

  return {
    teamKey: team?.params.teamKey ?? null,
    issueRef: issue?.params.issueRef ?? null,
    /** Raw panel segment; may be unknown (the shell redirects to general). */
    settingsPanel: panel ?? null,
    settingsOpen: panel !== undefined,
    planOpen: Boolean(teamPlan || plan),
    authMode,
    inviteToken: invite?.params.token ?? null,
    isIndex: Boolean(index),
  };
}

/** Base path for team-scoped screens, or "" when the user has no team yet. */
export function teamBasePath(teamKey: string | null) {
  return teamKey ? `/t/${encodeURIComponent(teamKey)}` : "";
}

export function issuePath(teamKey: string, identifier: string) {
  return `${teamBasePath(teamKey)}/issue/${encodeURIComponent(identifier)}`;
}

export function settingsPath(teamKey: string | null, panel: SettingsPanel) {
  return `${teamBasePath(teamKey)}/settings/${panel}`;
}

export function planPath(teamKey: string | null) {
  return `${teamBasePath(teamKey)}/plan`;
}

export function boardPath(teamKey: string | null) {
  return teamBasePath(teamKey) || "/";
}

const ISSUE_IDENTIFIER = /^([A-Za-z][A-Za-z0-9]*)-\d+$/;

/** Team key encoded in an issue identifier such as ENG-42. */
export function teamKeyFromIssueRef(ref: string) {
  return ISSUE_IDENTIFIER.exec(ref)?.[1]?.toUpperCase() ?? null;
}

/**
 * Old share links put everything in the query string. Returns where `/` should send them, or
 * null when the URL carries none of them. `ref` is handed to the board through location state.
 */
export function legacyLinkTarget(
  search: string,
  hash: string,
): { to: string; ref?: string } | null {
  const params = new URLSearchParams(search);
  const reset = params.get("reset")?.trim();
  if (reset) return { to: `/reset?token=${encodeURIComponent(reset)}` };

  const invite = params.get("invite")?.trim();
  if (invite) return { to: `/invite/${encodeURIComponent(invite)}` };

  let ref = params.get("ref")?.trim() || null;
  if (!ref && hash.startsWith("#ref=")) {
    try {
      ref = decodeURIComponent(hash.slice(5)).trim() || null;
    } catch {
      ref = null;
    }
  }
  if (!ref) return null;

  const teamKey = teamKeyFromIssueRef(ref);
  if (teamKey) return { to: issuePath(teamKey, ref.toUpperCase()) };
  // Row, column and file refs carry no team; the board resolves them in the current team.
  return { to: "/", ref };
}
