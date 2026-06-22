import { useCallback, useEffect, useState } from "react";
import type { TeamRolePublic } from "@teamflow/core";
import { client } from "../api";

export function useTeamRoles(teamId: string | null) {
  const [roles, setRoles] = useState<TeamRolePublic[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!teamId) {
      setRoles([]);
      return;
    }

    setLoading(true);
    try {
      const { roles: next } = await client.listTeamRoles(teamId);
      setRoles(next);
    } catch {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roles, loading, reload };
}
