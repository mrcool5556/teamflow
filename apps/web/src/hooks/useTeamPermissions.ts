import { useCallback, useEffect, useState } from "react";
import type { TeamPermissionsPublic } from "@teamflow/core";
import { client } from "../api";

export function useTeamPermissions(teamId: string | null) {
  const [permissions, setPermissions] = useState<TeamPermissionsPublic | null>(null);
  const [loading, setLoading] = useState(false);
  /** Team whose permissions have finished loading (successfully or not). */
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!teamId) {
      setPermissions(null);
      return;
    }

    setLoading(true);
    try {
      const { permissions: next } = await client.getTeamPermissions(teamId);
      setPermissions(next);
    } catch {
      setPermissions(null);
    } finally {
      setLoading(false);
      setLoadedTeamId(teamId);
    }
  }, [teamId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { permissions, loading, ready: teamId !== null && loadedTeamId === teamId, reload };
}
