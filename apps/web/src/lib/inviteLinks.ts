export const PENDING_INVITE_STORAGE_KEY = "teamflow_pending_invite";

export function buildInviteShareUrl(token: string) {
  return new URL(`/invite/${encodeURIComponent(token.trim())}`, window.location.origin).toString();
}

export function stashPendingInvite(token: string) {
  sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, token.trim());
}

export function takePendingInvite() {
  const token = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)?.trim();
  if (token) sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  return token ?? null;
}

/** Set by /invite/:token while logged out, so register can send the token along. */
export function hasPendingInvite() {
  return Boolean(sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY));
}

export function extractInviteToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const fromPath = /\/invite\/([^/?#]+)/.exec(url.pathname)?.[1];
    if (fromPath) return decodeURIComponent(fromPath);
    // Links shared before the router used ?invite=.
    const fromQuery = url.searchParams.get("invite")?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // plain token pasted
  }

  return trimmed;
}
