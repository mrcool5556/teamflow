export const PENDING_INVITE_STORAGE_KEY = "teamflow_pending_invite";

export function buildInviteShareUrl(token: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token.trim());
  return url.toString();
}

export function readInviteFromLocation() {
  return new URLSearchParams(window.location.search).get("invite")?.trim() ?? null;
}

export function stashPendingInvite(token: string) {
  sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, token.trim());
}

export function takePendingInvite() {
  const token = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY)?.trim();
  if (token) sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  return token ?? null;
}

export function hasPendingInvite() {
  return Boolean(readInviteFromLocation() || sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY));
}

export function syncInviteInLocation(token: string | null) {
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("invite", token);
  } else {
    url.searchParams.delete("invite");
  }
  window.history.replaceState({}, "", url);
}

export function extractInviteToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("invite")?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // plain token pasted
  }

  return trimmed;
}
