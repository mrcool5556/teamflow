import { TeamflowClient } from "@teamflow/api-client";
import type {
  IssuePublic,
  IssueStatusPublic,
  ProjectPublic,
  TeamPublic,
  UserPublic,
} from "@teamflow/core";

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "");

export const client = new TeamflowClient({ baseUrl: API_BASE });

const TOKEN_KEY = "teamflow_token";
const USER_KEY = "teamflow_user";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: UserPublic) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  client.setToken(token);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  client.setToken(undefined);
}

export function getStoredUser(): UserPublic | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserPublic;
  } catch {
    return null;
  }
}

export function initClientFromStorage() {
  const token = getStoredToken();
  if (token) client.setToken(token);
}

export type AppState = {
  user: UserPublic | null;
  teams: TeamPublic[];
  projects: ProjectPublic[];
  statuses: IssueStatusPublic[];
  issues: IssuePublic[];
  selectedTeamId: string | null;
  selectedIssueId: string | null;
};

initClientFromStorage();
