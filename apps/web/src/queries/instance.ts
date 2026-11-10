import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSpaceInput,
  InstanceOverviewPublic,
  InstanceSpaceDetailPublic,
  InstanceSpacePublic,
  InstanceUserPublic,
  SpaceSettingsPublic,
  SpaceStoragePublic,
  UpdateSpaceInput,
  UpdateSpaceSettingsInput,
} from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "./keys";

/** Server, disk, bot, update and backup status for the admin Overview. */
export function useInstanceOverviewQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceOverview,
    queryFn: async ({ signal }): Promise<InstanceOverviewPublic> =>
      (await client.withSignal(signal).getInstanceOverview()).overview,
    enabled,
    retry: false,
  });
}

export function useSpacesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceSpaces,
    queryFn: async ({ signal }): Promise<InstanceSpacePublic[]> =>
      (await client.withSignal(signal).listSpaces()).spaces,
    enabled,
  });
}

export function useSpaceQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.instanceSpace(teamId ?? ""),
    queryFn: async ({ signal }): Promise<InstanceSpaceDetailPublic> =>
      (await client.withSignal(signal).getSpace(teamId!)).space,
    enabled: Boolean(teamId),
    retry: false,
  });
}

export function useSpaceSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceSettings,
    queryFn: async ({ signal }): Promise<SpaceSettingsPublic> =>
      (await client.withSignal(signal).getSpaceSettings()).settings,
    enabled,
  });
}

export function useInstanceUsersQuery(query: string, enabled = true, limit?: number) {
  return useQuery({
    queryKey: [...queryKeys.instanceUsers(query), limit ?? 50],
    queryFn: async ({ signal }): Promise<InstanceUserPublic[]> =>
      (await client.withSignal(signal).listInstanceUsers(query || undefined, limit)).users,
    enabled,
  });
}

/** People panel: make or unmake a server admin. */
export function useSetInstanceAdminMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; isInstanceAdmin: boolean }) =>
      (await client.updateInstanceUser(input.userId, { isInstanceAdmin: input.isInstanceAdmin }))
        .user,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["instance", "users"] }),
  });
}

export function useIssueResetLinkMutation() {
  return useMutation({
    mutationFn: async (userId: string) => (await client.issuePasswordResetLink(userId)).reset,
  });
}

/** The current team's upload cap and usage (Files drawer meter, upload pre-checks). */
export function useTeamStorageQuery(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.teamStorage(teamId ?? ""),
    queryFn: async ({ signal }): Promise<SpaceStoragePublic> =>
      (await client.withSignal(signal).getTeamStorage(teamId!)).storage,
    enabled: Boolean(teamId),
    retry: false,
  });
}

/** After any space change: the list, the overview counts and that space's detail and meter. */
function useInvalidateSpaces() {
  const queryClient = useQueryClient();
  return (teamId?: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.instanceSpaces });
    void queryClient.invalidateQueries({ queryKey: queryKeys.instanceOverview });
    if (teamId) void queryClient.invalidateQueries({ queryKey: queryKeys.teamStorage(teamId) });
  };
}

export function useCreateSpaceMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSpaces();
  return useMutation({
    mutationFn: async (input: CreateSpaceInput) => (await client.createSpace(input)).space,
    onSuccess: (space) => {
      queryClient.setQueryData(queryKeys.instanceSpace(space.id), space);
      invalidate(space.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.teams });
    },
  });
}

export function useUpdateSpaceMutation(teamId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSpaces();
  return useMutation({
    mutationFn: async (input: UpdateSpaceInput) => (await client.updateSpace(teamId, input)).space,
    onSuccess: (space) => {
      queryClient.setQueryData(queryKeys.instanceSpace(teamId), space);
      invalidate(teamId);
    },
  });
}

export function useEmptySpaceTrashMutation(teamId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSpaces();
  return useMutation({
    mutationFn: () => client.emptySpaceTrash(teamId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.instanceSpace(teamId), result.space);
      invalidate(teamId);
      void queryClient.invalidateQueries({ queryKey: ["files", teamId] });
    },
  });
}

export function useCancelSpaceUploadsMutation(teamId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSpaces();
  return useMutation({
    mutationFn: () => client.cancelSpaceUploads(teamId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.instanceSpace(teamId), result.space);
      invalidate(teamId);
    },
  });
}

export function useUpdateSpaceSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSpaceSettingsInput) =>
      (await client.updateSpaceSettings(input)).settings,
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.instanceSettings, settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceOverview });
    },
  });
}
