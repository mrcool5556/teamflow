import type {
  ApiError,
  ApiTokenCreated,
  BoardRowPublic,
  CommentPublic,
  CreateCommentInput,
  IssueAttachmentPublic,
  AttachmentLimitsPublic,
  StreamTokenPublic,
  UploadSessionPublic,
  CreateIssueInput,
  CreateProjectInput,
  CreateTeamInput,
  CreateTokenInput,
  IssuePublic,
  IssueStatusPublic,
  ListIssuesInput,
  LoginInput,
  ProjectPublic,
  RegisterInput,
  ResetPasswordInput,
  ForgotPasswordInput,
  AuthConfigPublic,
  TeamInvitePreview,
  TeamInvitePublic,
  TeamDiscordSettingsPublic,
  TeamFilePublic,
  UpdateTeamDiscordSettingsInput,
  DiscordGuildConfigPublic,
  DiscordBotSecretsPublic,
  MaintenanceJobPublic,
  MaintenanceStatusPublic,
  RunMaintenanceBackupInput,
  RunMaintenanceUpdateInput,
  UpdateDiscordBotSecretsInput,
  TeamPermissionsPublic,
  TeamRolePublic,
  CreateTeamInviteInput,
  CreateTeamRoleInput,
  UpdateTeamRoleInput,
  TeamPublic,
  TeamMemberPublic,
  UpdateIssueInput,
  UpdateBoardRowInput,
  UserPublic,
} from "@teamflow/core";
import type { UserProfile, UserProfileExport, UserProfilePatch } from "@teamflow/core";

export type TeamflowClientOptions = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export class TeamflowApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "TeamflowApiError";
    this.status = status;
    this.code = code;
  }
}

export class TeamflowClient {
  private baseUrl: string;
  private token?: string;
  private fetchImpl: typeof fetch;

  constructor(options: TeamflowClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => fetch(input, init));
  }

  setToken(token?: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let payload: ApiError = { error: response.statusText };
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          payload = (await response.json()) as ApiError;
        } catch {
          // ignore
        }
      }
      throw new TeamflowApiError(
        payload.error ?? response.statusText,
        response.status,
        payload.code,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  register(input: RegisterInput) {
    return this.request<{ user: UserPublic; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  login(input: LoginInput) {
    return this.request<{ user: UserPublic; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getAuthConfig() {
    return this.request<AuthConfigPublic>("/auth/config");
  }

  requestPasswordReset(input: ForgotPasswordInput) {
    return this.request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  resetPassword(input: ResetPasswordInput) {
    return this.request<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  me() {
    return this.request<{ user: UserPublic }>("/auth/me");
  }

  getProfile() {
    return this.request<{ profile: UserProfile }>("/auth/profile");
  }

  saveProfile(profile: UserProfile) {
    return this.request<{ profile: UserProfile }>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }

  patchProfile(patch: UserProfilePatch) {
    return this.request<{ profile: UserProfile }>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  exportProfile() {
    return this.request<UserProfileExport>("/auth/profile/export");
  }

  importProfile(payload: unknown) {
    return this.request<{ profile: UserProfile }>("/auth/profile/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  createToken(input: CreateTokenInput) {
    return this.request<ApiTokenCreated>("/auth/tokens", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listTeams() {
    return this.request<{ teams: TeamPublic[] }>("/teams");
  }

  createTeam(input: CreateTeamInput) {
    return this.request<{ team: TeamPublic }>("/teams", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteTeam(teamId: string) {
    return this.request<void>(`/teams/${teamId}`, { method: "DELETE" });
  }

  listProjects(teamId?: string) {
    const query = teamId ? `?teamId=${teamId}` : "";
    return this.request<{ projects: ProjectPublic[] }>(`/projects${query}`);
  }

  createProject(input: CreateProjectInput) {
    return this.request<{ project: ProjectPublic }>("/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listStatuses(teamId: string) {
    return this.request<{ statuses: IssueStatusPublic[] }>(
      `/teams/${teamId}/statuses`,
    );
  }

  listRowStatuses(rowId: string) {
    return this.request<{ statuses: IssueStatusPublic[] }>(
      `/rows/${rowId}/statuses`,
    );
  }

  createStatus(rowId: string, input: { name: string; type?: string }) {
    return this.request<{ status: IssueStatusPublic }>(
      `/rows/${rowId}/statuses`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  updateStatus(
    statusId: string,
    input: { name?: string; position?: number; color?: string | null },
  ) {
    return this.request<{ status: IssueStatusPublic }>(`/statuses/${statusId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteStatus(statusId: string) {
    return this.request<void>(`/statuses/${statusId}`, { method: "DELETE" });
  }

  listRows(teamId: string) {
    return this.request<{ rows: BoardRowPublic[] }>(`/teams/${teamId}/rows`);
  }

  listTeamMembers(teamId: string) {
    return this.request<{ members: TeamMemberPublic[] }>(
      `/teams/${teamId}/members`,
    );
  }

  removeTeamMember(teamId: string, memberId: string) {
    return this.request<void>(`/teams/${teamId}/members/${memberId}`, {
      method: "DELETE",
    });
  }

  leaveTeam(teamId: string) {
    return this.request<void>(`/teams/${teamId}/members/me`, {
      method: "DELETE",
    });
  }

  listTeamInvites(teamId: string) {
    return this.request<{ invites: TeamInvitePublic[] }>(
      `/teams/${teamId}/invites`,
    );
  }

  createTeamInvite(teamId: string, input: Partial<CreateTeamInviteInput> = {}) {
    return this.request<{ invite: TeamInvitePublic }>(`/teams/${teamId}/invites`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  revokeTeamInvite(teamId: string, inviteId: string) {
    return this.request<void>(`/teams/${teamId}/invites/${inviteId}`, {
      method: "DELETE",
    });
  }

  getTeamPermissions(teamId: string) {
    return this.request<{ permissions: TeamPermissionsPublic }>(
      `/teams/${teamId}/permissions/me`,
    );
  }

  listTeamRoles(teamId: string) {
    return this.request<{ roles: TeamRolePublic[] }>(`/teams/${teamId}/roles`);
  }

  createTeamRole(teamId: string, input: CreateTeamRoleInput) {
    return this.request<{ role: TeamRolePublic }>(`/teams/${teamId}/roles`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateTeamRole(teamId: string, roleId: string, input: UpdateTeamRoleInput) {
    return this.request<{ role: TeamRolePublic }>(`/teams/${teamId}/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteTeamRole(teamId: string, roleId: string) {
    return this.request<void>(`/teams/${teamId}/roles/${roleId}`, {
      method: "DELETE",
    });
  }

  updateTeamMemberRole(teamId: string, memberId: string, roleId: string) {
    return this.request<{ role: TeamRolePublic }>(`/teams/${teamId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ roleId }),
    });
  }

  getTeamDiscordSettings(teamId: string) {
    return this.request<{ settings: TeamDiscordSettingsPublic }>(
      `/teams/${teamId}/discord-settings`,
    );
  }

  updateTeamDiscordSettings(teamId: string, input: UpdateTeamDiscordSettingsInput) {
    return this.request<{ settings: TeamDiscordSettingsPublic }>(
      `/teams/${teamId}/discord-settings`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  getDiscordBotSecrets(teamId: string) {
    return this.request<{ secrets: DiscordBotSecretsPublic }>(
      `/teams/${teamId}/integrations/discord/secrets`,
    );
  }

  updateDiscordBotSecrets(teamId: string, input: UpdateDiscordBotSecretsInput) {
    return this.request<{ secrets: DiscordBotSecretsPublic }>(
      `/teams/${teamId}/integrations/discord/secrets`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  getServerMaintenanceStatus(teamId: string) {
    return this.request<{ status: MaintenanceStatusPublic }>(
      `/teams/${teamId}/server/maintenance`,
    );
  }

  getServerMaintenanceJob(teamId: string) {
    return this.request<{ job: MaintenanceJobPublic | null }>(
      `/teams/${teamId}/server/maintenance/job`,
    );
  }

  runServerMaintenanceBackup(teamId: string, input: RunMaintenanceBackupInput = {}) {
    return this.request<{ job: MaintenanceJobPublic }>(
      `/teams/${teamId}/server/maintenance/backup`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  runServerMaintenanceUpdate(teamId: string, input: RunMaintenanceUpdateInput = {}) {
    return this.request<{ job: MaintenanceJobPublic }>(
      `/teams/${teamId}/server/maintenance/update`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  getDiscordGuildConfig(guildId: string) {
    return this.request<{ config: DiscordGuildConfigPublic }>(
      `/discord/guilds/${guildId}/config`,
    );
  }

  previewInvite(token: string) {
    return this.request<{ preview: TeamInvitePreview }>(`/invites/${encodeURIComponent(token)}`);
  }

  acceptInvite(token: string) {
    return this.request<{ team: TeamPublic; alreadyMember: boolean }>(
      `/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: "{}" },
    );
  }

  createRow(teamId: string, input: { name: string }) {
    return this.request<{ row: BoardRowPublic }>(`/teams/${teamId}/rows`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateRow(rowId: string, input: UpdateBoardRowInput) {
    return this.request<{ row: BoardRowPublic }>(`/rows/${rowId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  deleteRow(rowId: string) {
    return this.request<void>(`/rows/${rowId}`, { method: "DELETE" });
  }

  listIssues(filters: ListIssuesInput = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return this.request<{ issues: IssuePublic[] }>(
      `/issues${query ? `?${query}` : ""}`,
    );
  }

  getIssue(id: string) {
    return this.request<{ issue: IssuePublic; comments: CommentPublic[] }>(
      `/issues/${id}`,
    );
  }

  createIssue(input: CreateIssueInput) {
    return this.request<{ issue: IssuePublic }>("/issues", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateIssue(id: string, input: UpdateIssueInput) {
    return this.request<{ issue: IssuePublic }>(`/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  completeIssue(id: string) {
    return this.request<{ issue: IssuePublic }>(`/issues/${id}/complete`, {
      method: "POST",
    });
  }

  deleteIssue(id: string) {
    return this.request<void>(`/issues/${id}`, { method: "DELETE" });
  }

  restoreIssue(id: string) {
    return this.request<{ issue: IssuePublic }>(`/issues/${id}/restore`, {
      method: "POST",
    });
  }

  addComment(issueId: string, input: CreateCommentInput) {
    return this.request<{ comment: CommentPublic }>(
      `/issues/${issueId}/comments`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  deleteComment(issueId: string, commentId: string) {
    return this.request<void>(`/issues/${issueId}/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  listAttachments(issueId: string) {
    return this.request<{
      attachments: IssueAttachmentPublic[];
      limits: AttachmentLimitsPublic;
    }>(`/issues/${issueId}/attachments`);
  }

  uploadAttachment(
    issueId: string,
    file: File,
    options?: { onProgress?: (percent: number) => void },
  ) {
    const form = new FormData();
    form.append("file", file);

    return new Promise<{ attachment: IssueAttachmentPublic }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/issues/${issueId}/attachments`);

      if (this.token) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
      }

      xhr.upload.addEventListener("progress", (event) => {
        if (!options?.onProgress || !event.lengthComputable || event.total <= 0) return;
        options.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });

      xhr.addEventListener("load", () => {
        const contentType = xhr.getResponseHeader("content-type") ?? "";
        let payload: ApiError = { error: xhr.statusText };

        if (contentType.includes("application/json") && xhr.responseText) {
          try {
            payload = JSON.parse(xhr.responseText) as ApiError;
          } catch {
            // ignore
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { attachment: IssueAttachmentPublic });
          } catch {
            reject(new TeamflowApiError("Invalid upload response", xhr.status));
          }
          return;
        }

        reject(
          new TeamflowApiError(
            payload.error ?? xhr.statusText,
            xhr.status,
            payload.code,
          ),
        );
      });

      xhr.addEventListener("error", () => {
        reject(new TeamflowApiError("Upload failed", 0));
      });

      xhr.addEventListener("abort", () => {
        reject(new TeamflowApiError("Upload cancelled", 0));
      });

      xhr.send(form);
    });
  }

  createUploadSession(
    issueId: string,
    input: { filename: string; mimeType: string; totalBytes: number },
  ) {
    return this.request<{ session: UploadSessionPublic }>(
      `/issues/${issueId}/uploads`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  getUploadSession(sessionId: string) {
    return this.request<{ session: UploadSessionPublic }>(`/uploads/${sessionId}`);
  }

  uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunk: Blob,
    options?: { onProgress?: (percent: number) => void },
  ) {
    return new Promise<{ session: UploadSessionPublic }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${this.baseUrl}/uploads/${sessionId}/chunks/${chunkIndex}`);

      if (this.token) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
      }
      xhr.setRequestHeader("Content-Type", "application/octet-stream");

      xhr.upload.addEventListener("progress", (event) => {
        if (!options?.onProgress || !event.lengthComputable || event.total <= 0) return;
        options.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });

      xhr.addEventListener("load", () => {
        let payload: ApiError = { error: xhr.statusText };
        if (xhr.responseText) {
          try {
            payload = JSON.parse(xhr.responseText) as ApiError;
          } catch {
            // ignore
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as { session: UploadSessionPublic });
          return;
        }

        reject(
          new TeamflowApiError(
            payload.error ?? xhr.statusText,
            xhr.status,
            payload.code,
          ),
        );
      });

      xhr.addEventListener("error", () => reject(new TeamflowApiError("Upload failed", 0)));
      xhr.send(chunk);
    });
  }

  completeUpload(sessionId: string) {
    return this.request<{ attachment: IssueAttachmentPublic }>(
      `/uploads/${sessionId}/complete`,
      { method: "POST" },
    );
  }

  abortUpload(sessionId: string) {
    return this.request<void>(`/uploads/${sessionId}`, { method: "DELETE" });
  }

  async uploadFile(
    issueId: string,
    file: File,
    options?: {
      limits?: AttachmentLimitsPublic;
      onProgress?: (percent: number) => void;
      resumeSessionId?: string;
    },
  ) {
    const limits =
      options?.limits ?? (await this.listAttachments(issueId)).limits;

    if (file.size <= limits.chunkThresholdBytes) {
      return this.uploadAttachment(issueId, file, {
        onProgress: options?.onProgress,
      });
    }

    let session: UploadSessionPublic;
    if (options?.resumeSessionId) {
      session = (await this.getUploadSession(options.resumeSessionId)).session;
    } else {
      session = (
        await this.createUploadSession(issueId, {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          totalBytes: file.size,
        })
      ).session;
    }

    const received = new Set(session.receivedChunks);
    for (let index = 0; index < session.totalChunks; index += 1) {
      if (received.has(index)) continue;

      const start = index * session.chunkSize;
      const end = Math.min(start + session.chunkSize, file.size);
      const chunk = file.slice(start, end);

      const result = await this.uploadChunk(session.sessionId, index, chunk, {
        onProgress: (chunkPercent) => {
          if (!options?.onProgress) return;
          const uploadedBefore = index * session.chunkSize;
          const current = (chunk.size * chunkPercent) / 100;
          const total = Math.max(file.size, 1);
          options.onProgress(
            Math.min(100, Math.round(((uploadedBefore + current) / total) * 100)),
          );
        },
      });
      session = result.session;
      received.add(index);
      if (options?.onProgress) {
        const uploaded = Math.min(file.size, (index + 1) * session.chunkSize);
        options.onProgress(Math.min(100, Math.round((uploaded / file.size) * 100)));
      }
    }

    return this.completeUpload(session.sessionId);
  }

  createStreamToken(linkId: string) {
    return this.request<StreamTokenPublic>(`/attachments/${linkId}/stream-token`, {
      method: "POST",
    });
  }

  async resolveStreamUrl(linkId: string) {
    const { streamUrl } = await this.createStreamToken(linkId);
    if (streamUrl.startsWith("http")) return streamUrl;
    return `${this.baseUrl}${streamUrl}`;
  }

  async downloadAttachment(attachmentId: string) {
    const headers = new Headers();
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}/attachments/${attachmentId}/download`,
      { headers },
    );

    if (!response.ok) {
      let payload: ApiError = { error: response.statusText };
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          payload = (await response.json()) as ApiError;
        } catch {
          // ignore
        }
      }
      throw new TeamflowApiError(
        payload.error ?? response.statusText,
        response.status,
        payload.code,
      );
    }

    return response.blob();
  }

  deleteAttachment(issueId: string, attachmentId: string) {
    return this.request<void>(
      `/issues/${issueId}/attachments/${attachmentId}`,
      { method: "DELETE" },
    );
  }

  linkIssueAttachment(issueId: string, fileId: string) {
    return this.request<{ attachment: IssueAttachmentPublic }>(
      `/issues/${issueId}/attachments/link`,
      {
        method: "POST",
        body: JSON.stringify({ fileId }),
      },
    );
  }

  linkRowAttachment(rowId: string, fileId: string) {
    return this.request<{ attachment: IssueAttachmentPublic }>(
      `/rows/${rowId}/attachments/link`,
      {
        method: "POST",
        body: JSON.stringify({ fileId }),
      },
    );
  }

  listRowAttachments(rowId: string) {
    return this.request<{
      attachments: IssueAttachmentPublic[];
      limits: AttachmentLimitsPublic;
    }>(`/rows/${rowId}/attachments`);
  }

  listTeamFiles(teamId: string, options?: { trash?: boolean }) {
    const query = options?.trash ? "?trash=1" : "";
    return this.request<{
      files: TeamFilePublic[];
      totalBytes: number;
      fileCount: number;
      trash: boolean;
    }>(`/teams/${teamId}/files${query}`);
  }

  softDeleteTeamFile(teamId: string, fileId: string) {
    return this.request<{ fileId: string; deletedAt: string; purgeAt: string | null }>(
      `/teams/${teamId}/files/${fileId}`,
      { method: "DELETE" },
    );
  }

  restoreTeamFile(teamId: string, fileId: string) {
    return this.request<{ fileId: string }>(`/teams/${teamId}/files/${fileId}/restore`, {
      method: "POST",
    });
  }

  renameTeamFile(teamId: string, fileId: string, input: { filename: string }) {
    return this.request<{ fileId: string; filename: string; fileRef: string }>(
      `/teams/${teamId}/files/${fileId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  }

  uploadRowAttachment(
    rowId: string,
    file: File,
    options?: { onProgress?: (percent: number) => void },
  ) {
    const form = new FormData();
    form.append("file", file);

    return new Promise<{ attachment: IssueAttachmentPublic }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/rows/${rowId}/attachments`);

      if (this.token) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
      }

      xhr.upload.addEventListener("progress", (event) => {
        if (!options?.onProgress || !event.lengthComputable || event.total <= 0) return;
        options.onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });

      xhr.addEventListener("load", () => {
        const contentType = xhr.getResponseHeader("content-type") ?? "";
        let payload: ApiError = { error: xhr.statusText };

        if (contentType.includes("application/json") && xhr.responseText) {
          try {
            payload = JSON.parse(xhr.responseText) as ApiError;
          } catch {
            // ignore
          }
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as { attachment: IssueAttachmentPublic });
          } catch {
            reject(new TeamflowApiError("Invalid upload response", xhr.status));
          }
          return;
        }

        reject(
          new TeamflowApiError(
            payload.error ?? xhr.statusText,
            xhr.status,
            payload.code,
          ),
        );
      });

      xhr.addEventListener("error", () => {
        reject(new TeamflowApiError("Upload failed", 0));
      });

      xhr.addEventListener("abort", () => {
        reject(new TeamflowApiError("Upload cancelled", 0));
      });

      xhr.send(form);
    });
  }

  createRowUploadSession(
    rowId: string,
    input: { filename: string; mimeType: string; totalBytes: number },
  ) {
    return this.request<{ session: UploadSessionPublic }>(`/rows/${rowId}/uploads`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async uploadRowFile(
    rowId: string,
    file: File,
    options?: {
      limits?: AttachmentLimitsPublic;
      onProgress?: (percent: number) => void;
      resumeSessionId?: string;
    },
  ) {
    const limits =
      options?.limits ?? (await this.listRowAttachments(rowId)).limits;

    if (file.size <= limits.chunkThresholdBytes) {
      return this.uploadRowAttachment(rowId, file, {
        onProgress: options?.onProgress,
      });
    }

    let session: UploadSessionPublic;
    if (options?.resumeSessionId) {
      session = (await this.getUploadSession(options.resumeSessionId)).session;
    } else {
      session = (
        await this.createRowUploadSession(rowId, {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          totalBytes: file.size,
        })
      ).session;
    }

    const received = new Set(session.receivedChunks);
    for (let index = 0; index < session.totalChunks; index += 1) {
      if (received.has(index)) continue;

      const start = index * session.chunkSize;
      const end = Math.min(start + session.chunkSize, file.size);
      const chunk = file.slice(start, end);

      const result = await this.uploadChunk(session.sessionId, index, chunk, {
        onProgress: (chunkPercent) => {
          if (!options?.onProgress) return;
          const uploadedBefore = index * session.chunkSize;
          const current = (chunk.size * chunkPercent) / 100;
          const total = Math.max(file.size, 1);
          options.onProgress(
            Math.min(100, Math.round(((uploadedBefore + current) / total) * 100)),
          );
        },
      });
      session = result.session;
      received.add(index);
      if (options?.onProgress) {
        const uploaded = Math.min(file.size, (index + 1) * session.chunkSize);
        options.onProgress(Math.min(100, Math.round((uploaded / file.size) * 100)));
      }
    }

    return this.completeUpload(session.sessionId);
  }

  deleteRowAttachment(rowId: string, attachmentId: string) {
    return this.request<void>(`/rows/${rowId}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
  }

  resolveRef(teamId: string, ref: string) {
    const query = encodeURIComponent(ref);
    return this.request<{
      resolved: import("@teamflow/core").ResolvedRef;
      issue?: IssuePublic;
      row?: BoardRowPublic;
      status?: IssueStatusPublic;
      file?: {
        fileId: string;
        fileRef: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
      };
    }>(`/teams/${teamId}/resolve?ref=${query}`);
  }
}
