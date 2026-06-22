import { useCallback, useEffect, useState } from "react";
import type { TeamPermissionsPublic } from "@teamflow/core";
import { client } from "../api";

export function useTeamPermissions(teamId: string | null) {
  const [permissions, setPermissions] = useState<TeamPermissionsPublic | null>(null);
  const [loading, setLoading] = useState(false);

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
    }
  }, [teamId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { permissions, loading, reload };
}
