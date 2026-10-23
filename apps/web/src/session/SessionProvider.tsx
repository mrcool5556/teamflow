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

  const applyProfile = useCallback((next: UserProfile) => {
    profileRef.current = next;
    applyUserProfile(next);
    setProfile(next);
  }, []);

  const persistProfile = useCallback(
    async (next: UserProfile) => {
      const seq = profileChangeSeqRef.current;
      setProfileSaveState("saving");
      try {
        const { profile: saved } = await client.saveProfile(next);
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
    try {
      const { user: me } = await client.me();
      setUser(me);
      try {
        const { profile: serverProfile } = await client.getProfile();
        const { profile: next, migrated } = mergeWithLegacyDefaults(serverProfile);
        applyProfile(next);
        if (migrated) {
          await client.saveProfile(next);
          clearLegacyLocalProfile();
        }
      } catch {
        applyProfile(mergeWithLegacyDefaults(createDefaultUserProfile()).profile);
      }
      setSessionReady(true);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  }, [applyProfile, clearError]);

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
      logout,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
