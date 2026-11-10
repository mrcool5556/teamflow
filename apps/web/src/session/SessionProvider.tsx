import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile, UserPublic } from "@teamflow/core";
import { createDefaultUserProfile, mergeUserProfile } from "@teamflow/core";
import { clearSession, client, getStoredUser, setSession } from "../api";
import { applyUserProfile, clearLegacyLocalProfile, mergeWithLegacyDefaults } from "../profile";
import { useErrorSink } from "../lib/errorSink";
import { takePendingInvite } from "../lib/inviteLinks";
import { SessionContext, type ProfileSaveState, type Session } from "./session";

type Section = "appearance" | "board" | "ui";

/**
 * The loaded profile with every setting the user changed since `before` taken from `local`,
 * so a click made while the profile was loading is not undone by it.
 */
export function keepLocalChanges(
  before: UserProfile,
  local: UserProfile,
  loaded: UserProfile,
): UserProfile {
  const pick = <K extends Section>(section: K): UserProfile[K] => {
    const out = { ...loaded[section] } as Record<string, unknown>;
    const was = before[section] as Record<string, unknown>;
    const now = local[section] as Record<string, unknown>;
    for (const key of Object.keys(now)) {
      if (JSON.stringify(now[key]) !== JSON.stringify(was[key])) out[key] = now[key];
    }
    return out as UserProfile[K];
  };
  return { ...loaded, appearance: pick("appearance"), board: pick("board"), ui: pick("ui") };
}

/** Who is signed in, their saved profile, and the login/register/logout flows. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { report, clear: clearError } = useErrorSink();
  const [user, setUser] = useState<UserPublic | null>(getStoredUser);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(createDefaultUserProfile);
  const profileRef = useRef<UserProfile>(createDefaultUserProfile());
  const profileSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [profileSaveState, setProfileSaveState] = useState<ProfileSaveState>("idle");
  /** Bumped on every change; a save only reports "saved" if nothing changed since it started. */
  const profileChangeSeqRef = useRef(0);
  /** While the saved profile loads, saves wait: sending defaults would overwrite it. */
  const profileLoadingRef = useRef(false);
  const saveAfterLoadRef = useRef(false);

  /** False once unmounted: a late load or save answer must not repaint the page then. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (profileSaveTimerRef.current) clearTimeout(profileSaveTimerRef.current);
    };
  }, []);

  const applyProfile = useCallback((next: UserProfile) => {
    if (!mountedRef.current) return;
    profileRef.current = next;
    applyUserProfile(next);
    setProfile(next);
  }, []);

  const persistProfile = useCallback(
    async (next: UserProfile) => {
      if (profileLoadingRef.current) {
        saveAfterLoadRef.current = true;
        return;
      }
      const seq = profileChangeSeqRef.current;
      setProfileSaveState("saving");
      try {
        const { profile: saved } = await client.saveProfile(next);
        // A change made while this save was in flight wins: its own save follows, so this
        // older answer must not repaint the page (that was the Dark/Light bounce).
        if (seq !== profileChangeSeqRef.current) return;
        applyProfile(
          mergeUserProfile(saved, {
            appearance: next.appearance,
            board: { rowHeadersVisible: next.board.rowHeadersVisible },
          }),
        );
        if (seq === profileChangeSeqRef.current) setProfileSaveState("saved");
      } catch (err) {
        if (seq === profileChangeSeqRef.current) setProfileSaveState("error");
        report(err, "Failed to save profile");
      }
    },
    [applyProfile, report],
  );

  const updateProfile = useCallback(
    (next: UserProfile) => {
      applyProfile(next);
      profileChangeSeqRef.current += 1;
      setProfileSaveState("saving");
      if (profileSaveTimerRef.current) clearTimeout(profileSaveTimerRef.current);
      profileSaveTimerRef.current = setTimeout(() => {
        void persistProfile(profileRef.current);
      }, 600);
    },
    [applyProfile, persistProfile],
  );

  const retryProfileSave = useCallback(() => {
    void persistProfile(profileRef.current);
  }, [persistProfile]);

  const bootstrap = useCallback(async () => {
    setSessionLoading(true);
    clearError();
    // Changes made while the saved profile loads are kept on top of it.
    const before = profileRef.current;
    const seqBefore = profileChangeSeqRef.current;
    try {
      const { user: me } = await client.me();
      setUser(me);
      profileLoadingRef.current = true;
      try {
        const { profile: serverProfile } = await client.getProfile();
        const { profile: loaded, migrated } = mergeWithLegacyDefaults(serverProfile);
        const next =
          seqBefore === profileChangeSeqRef.current
            ? loaded
            : keepLocalChanges(before, profileRef.current, loaded);
        applyProfile(next);
        if (migrated) {
          await client.saveProfile(next);
          clearLegacyLocalProfile();
        }
      } catch {
        applyProfile(mergeWithLegacyDefaults(createDefaultUserProfile()).profile);
      } finally {
        profileLoadingRef.current = false;
      }
      if (saveAfterLoadRef.current) {
        saveAfterLoadRef.current = false;
        void persistProfile(profileRef.current);
      }
      setSessionReady(true);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  }, [applyProfile, clearError, persistProfile]);

  useEffect(() => {
    if (getStoredUser()) void bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      setSessionLoading(true);
      clearError();
      try {
        const result = await client.login({ email, password });
        setSession(result.token, result.user);
        setUser(result.user);
        await bootstrap();
      } catch (err) {
        report(err, "Login failed");
      } finally {
        setSessionLoading(false);
      }
    },
    [bootstrap, clearError, report],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      setSessionLoading(true);
      clearError();
      try {
        const inviteToken = takePendingInvite() ?? undefined;
        const result = await client.register({ name, email, password, inviteToken });
        setSession(result.token, result.user);
        setUser(result.user);
        await bootstrap();
      } catch (err) {
        report(err, "Registration failed");
      } finally {
        setSessionLoading(false);
      }
    },
    [bootstrap, clearError, report],
  );

  const adoptSession = useCallback(
    async (result: { user: UserPublic; token: string }) => {
      setSession(result.token, result.user);
      setUser(result.user);
      await bootstrap();
    },
    [bootstrap],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setSessionReady(false);
    queryClient.clear();
    navigate("/login");
  }, [navigate, queryClient]);

  const value = useMemo<Session>(
    () => ({
      user,
      sessionReady,
      sessionLoading,
      profile,
      profileRef,
      updateProfile,
      profileSaveState,
      retryProfileSave,
      replaceProfile: applyProfile,
      login,
      register,
      adoptSession,
      logout,
    }),
    [
      user,
      sessionReady,
      sessionLoading,
      profile,
      updateProfile,
      profileSaveState,
      retryProfileSave,
      applyProfile,
      login,
      register,
      adoptSession,
      logout,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
