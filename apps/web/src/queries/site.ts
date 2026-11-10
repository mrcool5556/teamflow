import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MailSettingsPublic,
  SendTestMailInput,
  SetupChecklistPublic,
  SignupSettingsPublic,
  SiteSettingsAdminPublic,
  UpdateMailSettingsInput,
  UpdateSetupProgressInput,
  UpdateSignupSettingsInput,
  UpdateSiteSettingsInput,
} from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "./keys";

/**
 * Site name, address, email and sign-up (admin page "Site & email" and setup steps 2–4), and the
 * setup checklist. Every save refreshes the checklist, the overview and the public auth config.
 */

function useRefreshAfterSave() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.setupChecklist });
    void queryClient.invalidateQueries({ queryKey: queryKeys.instanceOverview });
    void queryClient.invalidateQueries({ queryKey: queryKeys.authConfig });
  };
}

export function useSiteSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceSite,
    queryFn: async ({ signal }): Promise<SiteSettingsAdminPublic> =>
      (await client.withSignal(signal).getSiteSettings()).site,
    enabled,
  });
}

export function useUpdateSiteSettingsMutation() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterSave();
  return useMutation({
    mutationFn: async (input: UpdateSiteSettingsInput) =>
      (await client.updateSiteSettings(input)).site,
    onSuccess: (site) => {
      queryClient.setQueryData(queryKeys.instanceSite, site);
      refresh();
    },
  });
}

export function useCheckAddressMutation() {
  return useMutation({
    mutationFn: async (url: string) => (await client.checkPublicUrl(url)).check,
  });
}

export function useMailSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceMail,
    queryFn: async ({ signal }): Promise<MailSettingsPublic> =>
      (await client.withSignal(signal).getMailSettings()).mail,
    enabled,
  });
}

export function useUpdateMailSettingsMutation() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterSave();
  return useMutation({
    mutationFn: async (input: UpdateMailSettingsInput | null) =>
      input
        ? (await client.updateMailSettings(input)).mail
        : (await client.clearMailSettings()).mail,
    onSuccess: (mail) => {
      queryClient.setQueryData(queryKeys.instanceMail, mail);
      refresh();
    },
  });
}

export function useSendTestMailMutation() {
  return useMutation({
    mutationFn: async (input: SendTestMailInput) => (await client.sendTestMail(input)).result,
  });
}

export function useSignupSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.instanceSignup,
    queryFn: async ({ signal }): Promise<SignupSettingsPublic> =>
      (await client.withSignal(signal).getSignupSettings()).signup,
    enabled,
  });
}

export function useUpdateSignupSettingsMutation() {
  const queryClient = useQueryClient();
  const refresh = useRefreshAfterSave();
  return useMutation({
    mutationFn: async (input: UpdateSignupSettingsInput) =>
      (await client.updateSignupSettings(input)).signup,
    onSuccess: (signup) => {
      queryClient.setQueryData(queryKeys.instanceSignup, signup);
      refresh();
    },
  });
}

export function useSetupChecklistQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.setupChecklist,
    queryFn: async ({ signal }): Promise<SetupChecklistPublic> =>
      (await client.withSignal(signal).getSetupChecklist()).checklist,
    enabled,
    retry: false,
  });
}

export function useUpdateSetupProgressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSetupProgressInput) =>
      (await client.updateSetupProgress(input)).checklist,
    onSuccess: (checklist) => queryClient.setQueryData(queryKeys.setupChecklist, checklist),
  });
}
