import { createContext, useContext } from "react";
import type { TeamPublic, UserProfile, UserPublic } from "@teamflow/core";
import { useTeamsQuery } from "../queries/teams";

export type Session = {
  /** The signed-in user (from storage until /auth/me answers), or null. */
  user: UserPublic | null;
  /** /auth/me and the profile are loaded; team data may be fetched. */
  sessionReady: boolean;
  /** Login, register or bootstrap in progress. */
  sessionLoading: boolean;
  profile: UserProfile;
  /** Latest profile, for callbacks that must not wait for a render. */
  profileRef: { readonly current: UserProfile };
  /** Apply a profile change now and save it shortly after. */
  updateProfile: (next: UserProfile) => void;
  /** Apply a profile the server already saved (profile import). */
  replaceProfile: (next: UserProfile) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider");
  return session;
}

const NO_TEAMS: TeamPublic[] = [];

/** The signed-in user's teams; `teamsLoaded` stays false until the session is ready. */
export function useTeams() {
  const { user, sessionReady } = useSession();
  const query = useTeamsQuery(Boolean(user) && sessionReady);
  return { teams: query.data ?? NO_TEAMS, teamsLoaded: query.isSuccess };
}
