import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
  TeamPublic,
  UserPublic,
  UserProfile,
  UpdateIssueInput,
} from "@teamflow/core";
import {
  createDefaultUserProfile,
  mergeUserProfile,
  permissionsForSystemSlug,
  type SystemRoleSlug,
} from "@teamflow/core";
import {
  clearSession,
  client,
  getStoredUser,
  setSession,
} from "./api";
import {
  applyUserProfile,
  clearLegacyLocalProfile,
  mergeWithLegacyDefaults,
} from "./profile";
import { KanbanBoard } from "./KanbanBoard";
import { usePanScroll } from "./lib/usePanScroll";
import { QuickAddModal } from "./components/QuickAddModal";
import { BoardLayoutPreview } from "./components/BoardLayoutPreview";
import { ChangeHistoryPanel } from "./components/ChangeHistoryPanel";
import { GoToRefBar } from "./components/GoToRefBar";
import { IssueDrawer } from "./components/IssueDrawer";
import { RowFilesDrawer } from "./components/RowFilesDrawer";
import { TeamFilesDrawer } from "./components/TeamFilesDrawer";
import { RoadmapPanel } from "./components/RoadmapPanel";
import { CreateTeamSection } from "./components/CreateTeamSection";
import { AdvancedProfileSettingsSection } from "./components/AdvancedProfileSettingsSection";
import { AppearanceSettingsSection } from "./components/AppearanceSettingsSection";
import { IntegrationsSettingsSection } from "./components/IntegrationsSettingsSection";
import { RolesSettingsSection } from "./components/RolesSettingsSection";
import { ServerMaintenanceSettingsSection } from "./components/ServerMaintenanceSettingsSection";
import { SettingsNav, type SettingsPanel } from "./components/SettingsNav";
import { TeamSettingsSection } from "./components/TeamSettingsSection";
import { UndoToast } from "./components/UndoToast";
import { AboutDialog } from "./components/AboutDialog";
import { useChangeHistory } from "./hooks/useChangeHistory";
import { useTeamPermissions } from "./hooks/useTeamPermissions";
import { hasTeamPermission } from "./lib/teamPermissions";
import {
  normalizeRefInput,
  readRefFromLocation,
  scrollToColumnRef,
  scrollToIssueRef,
  scrollToRowRef,
  stashPendingRef,
  syncRefInLocation,
  takePendingRef,
} from "./lib/refLinks";
import {
  hasPendingInvite,
  readInviteFromLocation,
  stashPendingInvite,
  syncInviteInLocation,
  takePendingInvite,
} from "./lib/inviteLinks";
import {
  clearRefBackStack,
  peekRefBack,
  popRefBack,
  pushRefBack,
} from "./lib/refBackStack";

type View = "login" | "board" | "settings" | "roadmap";

const APP_VERSION = __TEAMFLOW_VERSION__;

type QuickAddTarget =
  | { kind: "row" }
  | { kind: "column"; rowId: string }
  | { kind: "issue"; rowId: string; statusId: string };

export function App() {
  const [view, setView] = useState<View>(() =>
    getStoredUser() ? "board" : "login",
  );
  const [user, setUser] = useState<UserPublic | null>(getStoredUser);
  const [teams, setTeams] = useState<TeamPublic[]>([]);
  const [rows, setRows] = useState<BoardRowPublic[]>([]);
  const [statuses, setStatuses] = useState<IssueStatusPublic[]>([]);
  const [issues, setIssues] = useState<IssuePublic[]>([]);
  const [members, setMembers] = useState<TeamMemberPublic[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssuePublic | null>(null);
  const [rowFilesRow, setRowFilesRow] = useState<BoardRowPublic | null>(null);
  const [teamFilesOpen, setTeamFilesOpen] = useState(false);
  const [refBackLabel, setRefBackLabel] = useState<string | null>(() => peekRefBack()?.label ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patName, setPatName] = useState("Cursor MCP");
  const [createdPat, setCreatedPat] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(createDefaultUserProfile);
  const [profileImportText, setProfileImportText] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const profileSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<UserProfile>(createDefaultUserProfile());
  const settingsPointerDownRef = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);
  const [highlightedColumnKey, setHighlightedColumnKey] = useState<string | null>(null);
  const [refNotice, setRefNotice] = useState<string | null>(null);
  const [refNavActive, setRefNavActive] = useState(false);
  const refNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingRefHandledRef = useRef(false);
  const pendingInviteHandledRef = useRef(false);
  const {
    history: changeHistory,
    pending: pendingUndo,
    schedule: scheduleUndo,
    undo: undoDelete,
    undoEntry,
    restoreEntry,
  } = useChangeHistory();
  const [quickAdd, setQuickAdd] = useState<QuickAddTarget | null>(null);
  const [quickAddValue, setQuickAddValue] = useState("");
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>("general");
  const { permissions: teamPermissions, reload: reloadTeamPermissions } =
    useTeamPermissions(teamId);
  const currentMember = members.find((member) => member.userId === user?.id);
  const effectiveTeamPermissions =
    teamPermissions ??
    (currentMember &&
    ["owner", "admin", "member", "viewer"].includes(currentMember.roleSlug)
      ? {
          roleId: currentMember.roleId,
          roleName: currentMember.roleName,
          roleSlug: currentMember.roleSlug,
          permissions: permissionsForSystemSlug(currentMember.roleSlug as SystemRoleSlug),
        }
      : null);
  const showRoles = hasTeamPermission(effectiveTeamPermissions, "team.roles.view");
  const canManageRoles = hasTeamPermission(effectiveTeamPermissions, "team.roles.manage");
  const showIntegrations = hasTeamPermission(
    effectiveTeamPermissions,
    "integrations.discord.view",
  );
  const canManageDiscord = hasTeamPermission(
    effectiveTeamPermissions,
    "integrations.discord.manage",
  );
  const canManageDiscordSecrets = hasTeamPermission(
    effectiveTeamPermissions,
    "integrations.discord.secrets",
  );
  const showMaintenance = hasTeamPermission(
    effectiveTeamPermissions,
    "server.maintenance.view",
  );
  const canRunMaintenance = hasTeamPermission(
    effectiveTeamPermissions,
    "server.maintenance.run",
  );
  const currentTeam = teams.find((team) => team.id === teamId) ?? null;

  const persistProfile = useCallback(async (next: UserProfile) => {
    try {
      const { profile: saved } = await client.saveProfile(next);
      const merged = mergeUserProfile(saved, {
        appearance: next.appearance,
        board: {
          rowHeadersVisible: next.board.rowHeadersVisible,
        },
      });
      profileRef.current = merged;
      setProfile(merged);
      applyUserProfile(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    }
  }, []);

  const updateProfile = useCallback(
    (next: UserProfile) => {
      profileRef.current = next;
      applyUserProfile(next);
      setProfile(next);
      if (profileSaveTimerRef.current) {
        clearTimeout(profileSaveTimerRef.current);
      }
      profileSaveTimerRef.current = setTimeout(() => {
        void persistProfile(profileRef.current);
      }, 600);
    },
    [persistProfile],
  );

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const isRowHeadersVisible = useCallback(
    (rowId: string) => profile.board.rowHeadersVisible[rowId] !== false,
    [profile.board.rowHeadersVisible],
  );

  function toggleRowHeaders(rowId: string) {
    const currentlyVisible = profile.board.rowHeadersVisible[rowId] !== false;
    updateProfile(
      mergeUserProfile(profile, {
        board: {
          rowHeadersVisible: {
            [rowId]: !currentlyVisible,
          },
        },
      }),
    );
  }

  const loadBoard = useCallback(async (activeTeamId: string) => {
    if (!activeTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const [
        statusesResult,
        rowsResult,
        issuesResult,
        membersResult,
      ] = await Promise.allSettled([
        client.listStatuses(activeTeamId),
        client.listRows(activeTeamId),
        client.listIssues({ teamId: activeTeamId }),
        client.listTeamMembers(activeTeamId),
      ]);

      if (statusesResult.status === "rejected") throw statusesResult.reason;
      if (rowsResult.status === "rejected") throw rowsResult.reason;
      if (issuesResult.status === "rejected") throw issuesResult.reason;

      setStatuses(statusesResult.value.statuses);
      setRows(rowsResult.value.rows);
      setIssues(issuesResult.value.issues);
      setMembers(
        membersResult.status === "fulfilled"
          ? membersResult.value.members
          : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { user: me } = await client.me();
      setUser(me);

      let profileState = createDefaultUserProfile();
      try {
        const { profile: serverProfile } = await client.getProfile();
        const { profile: next, migrated } = mergeWithLegacyDefaults(serverProfile);
        profileState = next;
        profileRef.current = next;
        applyUserProfile(next);
        setProfile(next);
        if (migrated) {
          await client.saveProfile(next);
          clearLegacyLocalProfile();
        }
      } catch {
        const { profile: fallback } = mergeWithLegacyDefaults(createDefaultUserProfile());
        profileState = fallback;
        profileRef.current = fallback;
        applyUserProfile(fallback);
        setProfile(fallback);
      }

      let joinedTeamId: string | null = null;
      if (!pendingInviteHandledRef.current) {
        const pendingInvite = takePendingInvite() ?? readInviteFromLocation();
        if (pendingInvite) {
          pendingInviteHandledRef.current = true;
          try {
            const { team, alreadyMember } = await client.acceptInvite(pendingInvite);
            syncInviteInLocation(null);
            joinedTeamId = team.id;
            setRefNotice(
              alreadyMember
                ? `Already on team ${team.key} — ${team.name}`
                : `Joined team ${team.key} — ${team.name}`,
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to accept invite");
          }
        }
      }

      const { teams: nextTeams } = await client.listTeams();
      setTeams(nextTeams);

      const savedTeamId = profileState.ui?.lastTeamId ?? null;
      const activeTeam =
        (joinedTeamId && nextTeams.some((team) => team.id === joinedTeamId)
          ? joinedTeamId
          : null) ??
        (savedTeamId && nextTeams.some((team) => team.id === savedTeamId)
          ? savedTeamId
          : null) ??
        nextTeams[0]?.id ??
        null;

      setTeamId(activeTeam);
      if (activeTeam && activeTeam !== savedTeamId) {
        const withTeam = mergeUserProfile(profileState, { ui: { lastTeamId: activeTeam } });
        profileRef.current = withTeam;
        setProfile(withTeam);
        applyUserProfile(withTeam);
        void client.patchProfile({ ui: { lastTeamId: activeTeam } });
      }
      if (activeTeam) await loadBoard(activeTeam);
      setView("board");
    } catch {
      clearSession();
      setUser(null);
      setView("login");
    } finally {
      setLoading(false);
    }
  }, [loadBoard]);

  const switchTeam = useCallback(
    async (nextTeamId: string) => {
      if (!nextTeamId) return;
      setTeamId(nextTeamId);
      setSelectedIssue(null);
      clearRefBackStack();
      setRefBackLabel(null);
      updateProfile(
        mergeUserProfile(profileRef.current, { ui: { lastTeamId: nextTeamId } }),
      );
      await loadBoard(nextTeamId);
    },
    [loadBoard, updateProfile],
  );

  async function refreshTeamsAndSwitch(teamIdToSelect: string) {
    const { teams: nextTeams } = await client.listTeams();
    setTeams(nextTeams);
    await switchTeam(teamIdToSelect);
  }

  async function handleTeamCreated(newTeamId: string, switchToNew: boolean) {
    const { teams: nextTeams } = await client.listTeams();
    setTeams(nextTeams);
    if (switchToNew || !teamId) {
      await refreshTeamsAndSwitch(newTeamId);
    }
  }

  async function handleTeamLeft(leftTeamId: string) {
    const { teams: nextTeams } = await client.listTeams();
    setTeams(nextTeams);
    if (teamId === leftTeamId) {
      const fallback = nextTeams[0]?.id ?? null;
      setTeamId(fallback);
      setSelectedIssue(null);
      setRows([]);
      setIssues([]);
      setStatuses([]);
      setMembers([]);
      if (fallback) {
        await switchTeam(fallback);
      }
    }
  }

  async function handleTeamDeleted(deletedTeamId: string) {
    const { teams: nextTeams } = await client.listTeams();
    setTeams(nextTeams);
    if (teamId === deletedTeamId) {
      const fallback = nextTeams[0]?.id ?? null;
      setTeamId(fallback);
      setSelectedIssue(null);
      setRows([]);
      setIssues([]);
      setStatuses([]);
      setMembers([]);
      if (fallback) {
        await switchTeam(fallback);
      }
    }
  }

  useEffect(() => {
    const ref = readRefFromLocation();
    if (ref && !getStoredUser()) {
      stashPendingRef(ref);
    }
    const invite = readInviteFromLocation();
    if (invite && !getStoredUser()) {
      stashPendingInvite(invite);
    }
  }, []);

  useEffect(() => {
    if (view !== "board" || !teamId || loading || pendingRefHandledRef.current) return;
    const ref = takePendingRef() ?? readRefFromLocation();
    if (!ref) return;
    pendingRefHandledRef.current = true;
    void goToRef(ref);
  }, [view, teamId, loading]);

  useEffect(() => {
    if (!refNotice) return;
    const id = window.setTimeout(() => setRefNotice(null), 3500);
    return () => window.clearTimeout(id);
  }, [refNotice]);

  useEffect(
    () => () => {
      if (refNavTimerRef.current) clearTimeout(refNavTimerRef.current);
    },
    [],
  );

  function triggerRefNavMotion() {
    setRefNavActive(true);
    if (refNavTimerRef.current) clearTimeout(refNavTimerRef.current);
    refNavTimerRef.current = setTimeout(() => setRefNavActive(false), 420);
  }

  useEffect(() => {
    if (getStoredUser()) {
      void bootstrap();
    }
  }, [bootstrap]);

  const defaultRowId = rows[0]?.id ?? null;

  const issuesForCell = useCallback(
    (rowId: string, statusId: string) =>
      issues
        .filter((issue) => {
          const issueRow = issue.rowId ?? defaultRowId;
          return issueRow === rowId && issue.statusId === statusId;
        })
        .sort((a, b) => (a.boardSort ?? 0) - (b.boardSort ?? 0)),
    [issues, defaultRowId],
  );

  async function handleLogin(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await client.login({ email, password });
      setSession(result.token, result.user);
      setUser(result.user);
      await bootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(name: string, email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const inviteToken = takePendingInvite() ?? readInviteFromLocation() ?? undefined;
      const result = await client.register({
        name,
        email,
        password,
        inviteToken,
      });
      setSession(result.token, result.user);
      setUser(result.user);
      await bootstrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function reorderRows(activeRowId: string, overRowId: string) {
    const oldIndex = rows.findIndex((row) => row.id === activeRowId);
    const newIndex = rows.findIndex((row) => row.id === overRowId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const next = [...rows];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved!);
    setRows(next.map((row, position) => ({ ...row, position })));

    try {
      await client.updateRow(activeRowId, { position: newIndex });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder row");
      if (teamId) await loadBoard(teamId);
    }
  }

  async function reorderColumns(
    rowId: string,
    activeStatusId: string,
    overStatusId: string,
  ) {
    const rowStatuses = statuses
      .filter((status) => status.rowId === rowId)
      .sort((a, b) => a.position - b.position);
    const oldIndex = rowStatuses.findIndex((status) => status.id === activeStatusId);
    const newIndex = rowStatuses.findIndex((status) => status.id === overStatusId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const next = [...rowStatuses];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved!);
    const reordered = next.map((status, position) => ({ ...status, position }));

    setStatuses((prev) => {
      const others = prev.filter((status) => status.rowId !== rowId);
      return [...others, ...reordered];
    });

    try {
      await client.updateStatus(activeStatusId, { position: newIndex });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder column");
      if (teamId) await loadBoard(teamId);
    }
  }

  function reorderIssuesInCell(
    rowId: string,
    statusId: string,
    orderedIssueIds: string[],
    movedIssuePatch?: Pick<IssuePublic, "rowId" | "statusId">,
  ) {
    const statusName = statuses.find((status) => status.id === statusId)?.name;

    setIssues((prev) =>
      prev.map((issue) => {
        const index = orderedIssueIds.indexOf(issue.id);
        if (index === -1) return issue;
        return {
          ...issue,
          rowId,
          statusId,
          statusName: statusName ?? issue.statusName,
          boardSort: index,
          ...movedIssuePatch,
        };
      }),
    );

    void Promise.all(
      orderedIssueIds.map((id, boardSort) =>
        client.updateIssue(id, { rowId, statusId, boardSort }),
      ),
    ).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to reorder issue");
      if (teamId) void loadBoard(teamId);
    });
  }
  async function assignIssue(issue: IssuePublic, assigneeIds: string[]) {
    const assignees = members
      .filter((member) => assigneeIds.includes(member.userId))
      .map((member) => ({ userId: member.userId, name: member.name }));

    setIssues((prev) =>
      prev.map((item) =>
        item.id === issue.id
          ? {
              ...item,
              assignees,
              assigneeId: assigneeIds[0] ?? null,
              assigneeName: assignees[0]?.name ?? null,
            }
          : item,
      ),
    );
    if (selectedIssue?.id === issue.id) {
      setSelectedIssue((prev) =>
        prev
          ? {
              ...prev,
              assignees,
              assigneeId: assigneeIds[0] ?? null,
              assigneeName: assignees[0]?.name ?? null,
            }
          : prev,
      );
    }

    try {
      const { issue: updated } = await client.updateIssue(issue.id, { assigneeIds });
      setIssues((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedIssue?.id === updated.id) setSelectedIssue(updated);
    } catch (err) {
      setIssues((prev) =>
        prev.map((item) => (item.id === issue.id ? issue : item)),
      );
      if (selectedIssue?.id === issue.id) setSelectedIssue(issue);
      setError(err instanceof Error ? err.message : "Failed to assign issue");
    }
  }

  async function assignRow(row: BoardRowPublic, assigneeIds: string[]) {
    try {
      const { row: updated } = await client.updateRow(row.id, { assigneeIds });
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign row");
    }
  }

  function insertIssueSorted(list: IssuePublic[], issue: IssuePublic) {
    if (list.some((item) => item.id === issue.id)) return list;
    return [...list, issue].sort((a, b) => {
      const rowA = a.rowId ?? "";
      const rowB = b.rowId ?? "";
      if (rowA !== rowB) return rowA.localeCompare(rowB);
      if (a.statusId !== b.statusId) return a.statusId.localeCompare(b.statusId);
      return (a.boardSort ?? 0) - (b.boardSort ?? 0);
    });
  }

  function applyIssuePatch(issue: IssuePublic, patch: UpdateIssueInput): IssuePublic {
    const nextStatus = patch.statusId
      ? statuses.find((status) => status.id === patch.statusId)
      : null;
    const next: IssuePublic = {
      ...issue,
      ...patch,
      statusName: nextStatus?.name ?? issue.statusName,
      boardSort: patch.boardSort ?? issue.boardSort,
    };
    if (patch.assigneeIds !== undefined) {
      const assignees = members
        .filter((member) => patch.assigneeIds!.includes(member.userId))
        .map((member) => ({ userId: member.userId, name: member.name }));
      next.assignees = assignees;
      next.assigneeId = patch.assigneeIds[0] ?? null;
      next.assigneeName = assignees[0]?.name ?? null;
    }
    return next;
  }

  async function bulkPatchIssues(issueIds: string[], patch: UpdateIssueInput) {
    if (issueIds.length === 0) return;
    setIssues((prev) =>
      prev.map((issue) =>
        issueIds.includes(issue.id) ? applyIssuePatch(issue, patch) : issue,
      ),
    );
    try {
      const results = await Promise.all(
        issueIds.map((id) => client.updateIssue(id, patch)),
      );
      setIssues((prev) => {
        const updatedById = new Map(results.map(({ issue }) => [issue.id, issue]));
        return prev.map((issue) => updatedById.get(issue.id) ?? issue);
      });
      if (selectedIssue && issueIds.includes(selectedIssue.id)) {
        const refreshed = results.find(({ issue }) => issue.id === selectedIssue.id)?.issue;
        if (refreshed) setSelectedIssue(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update issues");
      if (teamId) await loadBoard(teamId);
    }
  }

  function bulkMoveIssues(issueIds: string[], rowId: string, statusId: string) {
    if (issueIds.length === 0) return;
    const statusName = statuses.find((status) => status.id === statusId)?.name;
    const baseSort = issues.filter((issue) => {
      const issueRow = issue.rowId ?? defaultRowId;
      return issueRow === rowId && issue.statusId === statusId && !issueIds.includes(issue.id);
    }).length;

    setIssues((prev) =>
      prev.map((issue) => {
        if (!issueIds.includes(issue.id)) return issue;
        const index = issueIds.indexOf(issue.id);
        return {
          ...issue,
          rowId,
          statusId,
          statusName: statusName ?? issue.statusName,
          boardSort: baseSort + index,
        };
      }),
    );

    void Promise.all(
      issueIds.map((id, index) =>
        client.updateIssue(id, { rowId, statusId, boardSort: baseSort + index }),
      ),
    ).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to move issues");
      if (teamId) void loadBoard(teamId);
    });
  }

  function bulkAssignIssues(issueIds: string[], assigneeIds: string[]) {
    void bulkPatchIssues(issueIds, { assigneeIds });
  }

  function bulkSetPriority(issueIds: string[], priority: Priority) {
    void bulkPatchIssues(issueIds, { priority });
  }

  function bulkTimerIssues(issueIds: string[], action: "pause" | "reset") {
    if (issueIds.length === 0) return;
    const now = Date.now();
    const patchById = new Map<string, UpdateIssueInput>();

    for (const id of issueIds) {
      const issue = issues.find((item) => item.id === id);
      if (!issue) continue;
      if (action === "reset") {
        patchById.set(id, {
          timerActiveAt: null,
          timerElapsedSec: 0,
          timerTargetSec: null,
        });
      } else {
        const elapsed = issue.timerActiveAt
          ? issue.timerElapsedSec +
            Math.max(0, Math.floor((now - Date.parse(issue.timerActiveAt)) / 1000))
          : issue.timerElapsedSec;
        patchById.set(id, {
          timerActiveAt: null,
          timerElapsedSec: elapsed,
          timerTargetSec: issue.timerTargetSec,
        });
      }
    }

    setIssues((prev) =>
      prev.map((issue) => {
        const patch = patchById.get(issue.id);
        return patch ? applyIssuePatch(issue, patch) : issue;
      }),
    );

    void Promise.all(
      [...patchById.entries()].map(([id, patch]) => client.updateIssue(id, patch)),
    ).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to update timers");
      if (teamId) void loadBoard(teamId);
    });
  }

  function bulkDeleteIssues(issuesToDelete: IssuePublic[]) {
    if (issuesToDelete.length === 0) return;
    const ids = new Set(issuesToDelete.map((issue) => issue.id));
    const wasSelected = selectedIssue && ids.has(selectedIssue.id);

    setIssues((prev) => prev.filter((issue) => !ids.has(issue.id)));
    if (wasSelected) setSelectedIssue(null);

    scheduleUndo({
      label:
        issuesToDelete.length === 1
          ? `Deleted ${issuesToDelete[0]!.identifier}`
          : `Deleted ${issuesToDelete.length} issues`,
      issueId: issuesToDelete.length === 1 ? issuesToDelete[0]!.id : undefined,
      restore: () => {
        setIssues((prev) => {
          let next = prev;
          for (const issue of issuesToDelete) {
            next = insertIssueSorted(next, issue);
          }
          return next;
        });
        if (wasSelected) setSelectedIssue(issuesToDelete[0] ?? null);
      },
      commit: async () => {
        await Promise.all(issuesToDelete.map((issue) => client.deleteIssue(issue.id)));
      },
      restoreFromTrash:
        issuesToDelete.length === 1
          ? async () => {
              const { issue: restored } = await client.restoreIssue(issuesToDelete[0]!.id);
              setIssues((prev) => insertIssueSorted(prev, restored));
              if (wasSelected) setSelectedIssue(restored);
            }
          : undefined,
    });
  }

  async function updateRowColor(row: BoardRowPublic, color: string | null) {
    try {
      const { row: updated } = await client.updateRow(row.id, { color });
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update row color");
    }
  }

  async function updateStatusColor(status: IssueStatusPublic, color: string | null) {
    try {
      const { status: updated } = await client.updateStatus(status.id, { color });
      setStatuses((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update column color");
    }
  }

  async function updateIssueColor(issue: IssuePublic, color: string | null) {
    try {
      const { issue: updated } = await client.updateIssue(issue.id, { color });
      setIssues((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedIssue?.id === updated.id) {
        setSelectedIssue(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update card color");
    }
  }

  async function updateIssuePriority(issue: IssuePublic, priority: Priority) {
    if (issue.priority === priority) return;
    try {
      const { issue: updated } = await client.updateIssue(issue.id, { priority });
      setIssues((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedIssue?.id === updated.id) {
        setSelectedIssue(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update priority");
    }
  }

  function updateIssueTimer(
    issue: IssuePublic,
    patch: {
      timerActiveAt: string | null;
      timerElapsedSec: number;
      timerTargetSec: number | null;
    },
  ) {
    setIssues((prev) =>
      prev.map((item) => (item.id === issue.id ? { ...item, ...patch } : item)),
    );
    if (selectedIssue?.id === issue.id) {
      setSelectedIssue((prev) => (prev ? { ...prev, ...patch } : prev));
    }

    void client.updateIssue(issue.id, patch).then(({ issue: updated }) => {
      setIssues((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedIssue((prev) => (prev?.id === updated.id ? updated : prev));
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to update timer");
      if (teamId) void loadBoard(teamId);
    });
  }

  async function renameStatus(status: IssueStatusPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === status.name) return;
    try {
      const { status: updated } = await client.updateStatus(status.id, { name: trimmed });
      setStatuses((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setIssues((prev) =>
        prev.map((issue) =>
          issue.statusId === updated.id ? { ...issue, statusName: updated.name } : issue,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename column");
    }
  }

  function removeRow(row: BoardRowPublic) {
    const rowStatuses = statuses.filter((status) => status.rowId === row.id);

    setRows((prev) => prev.filter((item) => item.id !== row.id));
    setStatuses((prev) => prev.filter((status) => status.rowId !== row.id));

    scheduleUndo({
      label: `Removed row "${row.name}"`,
      restore: () => {
        setRows((prev) => {
          if (prev.some((item) => item.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.position - b.position);
        });
        setStatuses((prev) => {
          const existing = new Set(prev.map((status) => status.id));
          const restored = rowStatuses.filter((status) => !existing.has(status.id));
          return restored.length > 0 ? [...prev, ...restored] : prev;
        });
      },
      commit: async () => {
        try {
          await client.deleteRow(row.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to remove row");
          throw err;
        }
      },
    });
  }

  function removeColumn(status: IssueStatusPublic) {
    setStatuses((prev) => prev.filter((item) => item.id !== status.id));

    scheduleUndo({
      label: `Removed column "${status.name}"`,
      restore: () => {
        setStatuses((prev) => {
          if (prev.some((item) => item.id === status.id)) return prev;
          return [...prev, status].sort((a, b) => {
            if (a.rowId !== b.rowId) return a.rowId.localeCompare(b.rowId);
            return a.position - b.position;
          });
        });
      },
      commit: async () => {
        try {
          await client.deleteStatus(status.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to remove column");
          throw err;
        }
      },
    });
  }

  function deleteIssue(issue: IssuePublic) {
    const wasSelected = selectedIssue?.id === issue.id;

    setIssues((prev) => prev.filter((item) => item.id !== issue.id));
    if (wasSelected) setSelectedIssue(null);

    scheduleUndo({
      label: `Deleted ${issue.identifier}`,
      issueId: issue.id,
      restore: () => {
        setIssues((prev) => insertIssueSorted(prev, issue));
        if (wasSelected) setSelectedIssue(issue);
      },
      commit: async () => {
        try {
          await client.deleteIssue(issue.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to delete issue");
          throw err;
        }
      },
      restoreFromTrash: async () => {
        const { issue: restored } = await client.restoreIssue(issue.id);
        setIssues((prev) => insertIssueSorted(prev, restored));
        if (wasSelected) setSelectedIssue(restored);
      },
    });
  }

  function openQuickAdd(target: QuickAddTarget, initialValue = "") {
    setQuickAdd(target);
    setQuickAddValue(initialValue);
    setError(null);
  }

  function closeQuickAdd() {
    setQuickAdd(null);
    setQuickAddValue("");
  }

  async function submitQuickAdd() {
    if (!quickAdd || !teamId) return;
    const value = quickAddValue.trim();
    if (!value) return;

    try {
      if (quickAdd.kind === "column") {
        const { status } = await client.createStatus(quickAdd.rowId, { name: value });
        setStatuses((prev) => [...prev, status]);
      } else if (quickAdd.kind === "row") {
        const { row } = await client.createRow(teamId, { name: value });
        setRows((prev) => [...prev, row]);
        const { statuses: rowStatuses } = await client.listRowStatuses(row.id);
        setStatuses((prev) => [...prev, ...rowStatuses]);
      } else {
        const { issue } = await client.createIssue({
          teamId,
          rowId: quickAdd.rowId,
          statusId: quickAdd.statusId,
          title: value,
          priority: "none",
        });
        setIssues((prev) => [issue, ...prev]);
      }
      closeQuickAdd();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : quickAdd.kind === "issue"
            ? "Failed to create issue"
            : quickAdd.kind === "row"
              ? "Failed to add row"
              : "Failed to add column",
      );
    }
  }

  function addColumn(rowId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "column", rowId });
  }

  async function addRow() {
    if (!teamId) return;
    openQuickAdd({ kind: "row" }, `Row ${rows.length + 1}`);
  }

  function addIssue(rowId: string, statusId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "issue", rowId, statusId });
  }

  async function renameRow(row: BoardRowPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === row.name) return;
    try {
      const { row: updated } = await client.updateRow(row.id, { name: trimmed });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename row");
    }
  }

  function refreshRefBackLabel() {
    setRefBackLabel(peekRefBack()?.label ?? null);
  }

  function captureRefBackEntry(): { ref: string; label: string } | null {
    if (selectedIssue) {
      return {
        ref: selectedIssue.identifier,
        label: selectedIssue.identifier,
      };
    }
    if (refNotice) {
      return { ref: refNotice, label: refNotice };
    }
    return null;
  }

  async function goToRef(rawRef: string, options?: { skipBackPush?: boolean }) {
    if (!teamId) return;
    const ref = normalizeRefInput(rawRef);
    if (!ref) return;

    if (!options?.skipBackPush) {
      const current = captureRefBackEntry();
      if (current && current.ref !== ref) {
        pushRefBack(current);
        refreshRefBackLabel();
      }
    }

    setError(null);
    setRefNotice(null);
    try {
      const result = await client.resolveRef(teamId, ref);
      syncRefInLocation(ref);
      triggerRefNavMotion();

      if (result.issue) {
        setIssues((prev) => {
          if (prev.some((item) => item.id === result.issue!.id)) return prev;
          return [...prev, result.issue!];
        });
        setSelectedIssue(result.issue);
        setHighlightedIssueId(result.issue.id);
        setHighlightedColumnKey(null);
        scrollToIssueRef(result.issue.id);
        window.setTimeout(() => setHighlightedIssueId(null), 4000);
        return;
      }

      if (result.row) {
        if (result.status) {
          const headersWereHidden = !isRowHeadersVisible(result.row.id);
          if (headersWereHidden) {
            updateProfile(
              mergeUserProfile(profileRef.current, {
                board: {
                  rowHeadersVisible: {
                    [result.row.id]: true,
                  },
                },
              }),
            );
          }
          setHighlightedColumnKey(result.status.key);
          scrollToColumnRef(result.status.key, headersWereHidden ? 160 : 80);
          window.setTimeout(() => setHighlightedColumnKey(null), 4000);
          setRefNotice(
            `${result.status.name} · ${result.row.name}`,
          );
          return;
        }

        scrollToRowRef(result.row.id);
        setHighlightedColumnKey(null);
        setRefNotice(`Row: ${result.row.name}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reference not found");
      syncRefInLocation(null);
    }
  }

  function goBackRef() {
    const entry = popRefBack();
    refreshRefBackLabel();
    if (!entry) return;
    void goToRef(entry.ref, { skipBackPush: true });
  }

  async function exportProfileFile() {
    setProfileMessage(null);
    try {
      const data = await client.exportProfile();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `teamflow-profile-${user?.name?.replace(/\s+/g, "-").toLowerCase() ?? "user"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setProfileMessage("Profile exported. Share this file so others can import your layout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export profile");
    }
  }

  async function importProfileFile() {
    setProfileMessage(null);
    const raw = profileImportText.trim();
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as unknown;
      const { profile: imported } = await client.importProfile(payload);
      applyUserProfile(imported);
      setProfile(imported);
      setProfileImportText("");
      setProfileMessage("Profile imported and saved to your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import profile");
    }
  }

  async function createPat() {
    try {
      const token = await client.createToken({
        name: patName,
        scopes: ["read", "write"],
      });
      setCreatedPat(token.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    }
  }

  function logout() {
    clearSession();
    pendingRefHandledRef.current = false;
    pendingInviteHandledRef.current = false;
    setUser(null);
    setView("login");
  }

  useEffect(() => {
    if (settingsPanel === "team" && !teamId) {
      setSettingsPanel("general");
    }
    if (settingsPanel === "roles" && !showRoles) {
      setSettingsPanel("general");
    }
    if (settingsPanel === "integrations" && !showIntegrations) {
      setSettingsPanel("general");
    }
  }, [settingsPanel, showIntegrations, showRoles, teamId]);

  const settingsOpen = view === "settings";
  const roadmapOpen = view === "roadmap";
  const overlayOpen = settingsOpen || roadmapOpen;
  const useSamplePreview = settingsOpen && rows.length === 0;

  const closeSettings = useCallback(() => {
    setView("board");
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, closeSettings]);

  const dismissSettingsFromPreview = useCallback(() => {
    if (settingsPointerDownRef.current) {
      settingsPointerDownRef.current = false;
      return;
    }
    closeSettings();
  }, [closeSettings]);

  usePanScroll(boardScrollRef, !settingsOpen);

  const boardPanel = (
    <div
      className={`board-wrap ${settingsOpen ? "board-wrap--preview" : ""} ${refNavActive ? "board-wrap--ref-nav" : ""}`}
      onClick={settingsOpen ? dismissSettingsFromPreview : undefined}
      title={settingsOpen ? "Click board to close settings" : undefined}
    >
      {settingsOpen ? (
        <div className="board-preview-banner">
          <div>
            <p className="eyebrow">Live preview</p>
            <p className="settings-copy board-preview-copy">
              {useSamplePreview
                ? "Sample row and cards — your board is empty."
                : "Your real board — theme and layout update as you change settings. Click anywhere here to close settings."}
            </p>
          </div>
          <button
            type="button"
            className="ghost board-preview-close"
            onClick={(event) => {
              event.stopPropagation();
              closeSettings();
            }}
          >
            Close
          </button>
        </div>
      ) : (
        <div className="board-toolbar">
          <button type="button" onClick={() => addRow()}>
            + Add row
          </button>
          <span className="board-toolbar-hint">
            Ctrl/Shift+Click to multi-select · drag a selected card to move all · Alt+drag or
            middle-click to pan · wheel scroll passes through columns
          </span>
        </div>
      )}

      <div
        ref={boardScrollRef}
        className={`board-scroll ${settingsOpen ? "board-scroll--preview" : ""}`}
      >
        <div className={settingsOpen ? "board-preview-surface" : undefined}>
          {useSamplePreview ? (
            <BoardLayoutPreview />
          ) : (
            <KanbanBoard
              previewMode={settingsOpen}
              rows={rows}
              statuses={statuses}
              issues={issues}
              defaultRowId={defaultRowId}
              isRowHeadersVisible={isRowHeadersVisible}
              toggleRowHeaders={settingsOpen ? () => {} : toggleRowHeaders}
              issuesForCell={issuesForCell}
              onSelectIssue={settingsOpen ? () => {} : setSelectedIssue}
              onDeleteIssue={settingsOpen ? () => {} : deleteIssue}
              onRenameRow={
                settingsOpen ? () => {} : (row, name) => void renameRow(row, name)
              }
              onRenameStatus={
                settingsOpen ? () => {} : (status, name) => void renameStatus(status, name)
              }
              onUpdateStatusColor={
                settingsOpen ? () => {} : (status, color) => void updateStatusColor(status, color)
              }
              onRemoveRow={settingsOpen ? () => {} : removeRow}
              onRemoveColumn={settingsOpen ? () => {} : removeColumn}
              onAddColumn={settingsOpen ? () => {} : addColumn}
              onAddIssue={
                settingsOpen ? () => {} : (rowId, statusId) => void addIssue(rowId, statusId)
              }
              onReorderRows={
                settingsOpen
                  ? () => {}
                  : (activeRowId, overRowId) => void reorderRows(activeRowId, overRowId)
              }
              onReorderColumns={
                settingsOpen
                  ? () => {}
                  : (rowId, activeStatusId, overStatusId) =>
                      void reorderColumns(rowId, activeStatusId, overStatusId)
              }
              onReorderIssuesInCell={settingsOpen ? () => {} : reorderIssuesInCell}
              members={members}
              onAssignIssue={
                settingsOpen ? () => {} : (issue, assigneeIds) => void assignIssue(issue, assigneeIds)
              }
              onAssignRow={
                settingsOpen ? () => {} : (row, assigneeIds) => void assignRow(row, assigneeIds)
              }
              onUpdateRowColor={
                settingsOpen ? () => {} : (row, color) => void updateRowColor(row, color)
              }
              onUpdateIssueColor={
                settingsOpen ? () => {} : (issue, color) => void updateIssueColor(issue, color)
              }
              onUpdateIssuePriority={
                settingsOpen ? () => {} : (issue, priority) => void updateIssuePriority(issue, priority)
              }
              onUpdateIssueTimer={settingsOpen ? () => {} : updateIssueTimer}
              highlightedIssueId={settingsOpen ? null : highlightedIssueId}
              highlightedColumnKey={settingsOpen ? null : highlightedColumnKey}
              onGoToRef={settingsOpen ? undefined : (ref) => void goToRef(ref)}
              onBulkMove={settingsOpen ? undefined : bulkMoveIssues}
              onBulkAssign={settingsOpen ? undefined : bulkAssignIssues}
              onBulkPriority={settingsOpen ? undefined : bulkSetPriority}
              onBulkTimer={settingsOpen ? undefined : bulkTimerIssues}
              onBulkDelete={settingsOpen ? undefined : bulkDeleteIssues}
              onOpenRowFiles={settingsOpen ? undefined : setRowFilesRow}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (view === "login") {
    return (
      <>
        <LoginScreen
          error={error}
          loading={loading}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onOpenAbout={() => setAboutOpen(true)}
        />
        <AboutDialog
          open={aboutOpen}
          version={APP_VERSION}
          onClose={() => setAboutOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TEAMFLOW</p>
          <h1>{teams.find((t) => t.id === teamId)?.name ?? "Board"}</h1>
        </div>
        <div className="topbar-actions">
          {!overlayOpen && refBackLabel ? (
            <button
              type="button"
              className="secondary ref-back-btn"
              title={`Back to ${refBackLabel}`}
              onClick={goBackRef}
            >
              ← Back
            </button>
          ) : null}
          {!overlayOpen && (
            <GoToRefBar disabled={!teamId || loading} onGo={(ref) => void goToRef(ref)} />
          )}
          {teams.length > 0 && (
            <label className="topbar-team-switch">
              <span className="sr-only">Workspace</span>
              <select
                aria-label="Workspace"
                value={teamId ?? ""}
                disabled={!teamId || loading}
                onChange={(e) => {
                  void switchTeam(e.target.value);
                }}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.key} — {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={historyOpen ? "active" : undefined}
            disabled={changeHistory.length === 0}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            Recent{changeHistory.length > 0 ? ` (${changeHistory.length})` : ""}
          </button>
          {!overlayOpen && teamId ? (
            <button type="button" onClick={() => setTeamFilesOpen(true)}>
              Files
            </button>
          ) : null}
          <button
            type="button"
            className={roadmapOpen ? "active" : undefined}
            onClick={() => setView(roadmapOpen ? "board" : "roadmap")}
          >
            {roadmapOpen ? "Close plan" : "Plan"}
          </button>
          <button
            type="button"
            className={settingsOpen ? "active" : undefined}
            onClick={() => setView(settingsOpen ? "board" : "settings")}
          >
            {settingsOpen ? "Close settings" : "Settings"}
          </button>
          <button type="button" className="ghost" onClick={() => setAboutOpen(true)}>
            About
          </button>
          <button type="button" className="ghost" onClick={logout}>
            Log out ({user?.name})
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {refNotice && <div className="banner ref-notice">{refNotice}</div>}
      {loading && <div className="banner">Loading…</div>}

      {settingsOpen ? (
        <div className="app-workspace app-workspace--settings">
          <aside
            className="settings-sidebar panel settings"
            onPointerDown={() => {
              settingsPointerDownRef.current = true;
            }}
          >
            <div className="settings-sidebar-header">
              <h2>Settings</h2>
              <button
                type="button"
                className="ghost settings-close-btn"
                aria-label="Close settings"
                onClick={closeSettings}
              >
                ×
              </button>
            </div>
            <div className="settings-shell">
              <SettingsNav
                panel={settingsPanel}
                onPanelChange={setSettingsPanel}
                showTeam={Boolean(teamId)}
                showRoles={showRoles}
                showIntegrations={showIntegrations}
                showUpdates={showMaintenance}
              />
              <div className="settings-main">
                {settingsPanel === "general" ? (
                  <div className="settings-panel">
                    <header className="settings-panel-header">
                      <h2>General</h2>
                      <p className="settings-copy settings-lead">
                        Board layout, profile backup, and creating new teams.
                      </p>
                    </header>

                    <AdvancedProfileSettingsSection
                      profile={profile}
                      onProfileChange={updateProfile}
                      profileImportText={profileImportText}
                      onProfileImportTextChange={setProfileImportText}
                      profileMessage={profileMessage}
                      onExportProfile={exportProfileFile}
                      onImportProfile={importProfileFile}
                    />

                    <CreateTeamSection
                      onMessage={setProfileMessage}
                      onTeamCreated={(newTeamId, switchToNew) =>
                        void handleTeamCreated(newTeamId, switchToNew)
                      }
                    />
                  </div>
                ) : null}

                {settingsPanel === "appearance" ? (
                  <div className="settings-panel">
                    <header className="settings-panel-header">
                      <h2>Appearance</h2>
                      <p className="settings-copy settings-lead">
                        Personalize how you feel your board should be.
                      </p>
                    </header>

                    <AppearanceSettingsSection
                      profile={profile}
                      onProfileChange={updateProfile}
                    />
                  </div>
                ) : null}

                {settingsPanel === "team" && teamId && currentTeam ? (
                  <div className="settings-panel">
                    <header className="settings-panel-header">
                      <h2>Team</h2>
                      <p className="settings-copy settings-lead">
                        Members, invites, and team lifecycle for{" "}
                        <strong>{currentTeam.name}</strong>.
                      </p>
                    </header>

                    <TeamSettingsSection
                      teamId={teamId}
                      teamName={currentTeam.name}
                      teamKey={currentTeam.key}
                      members={members}
                      currentUserId={user?.id ?? null}
                      permissions={effectiveTeamPermissions}
                      onMembersChange={setMembers}
                      onMessage={setProfileMessage}
                      onTeamJoined={(joinedTeamId) => void refreshTeamsAndSwitch(joinedTeamId)}
                      onTeamLeft={(leftTeamId) => void handleTeamLeft(leftTeamId)}
                      onTeamDeleted={(deletedTeamId) => void handleTeamDeleted(deletedTeamId)}
                    />
                  </div>
                ) : null}

                {settingsPanel === "roles" && teamId && currentTeam && showRoles ? (
                  <RolesSettingsSection
                    teamId={teamId}
                    canManage={canManageRoles}
                    onMessage={setProfileMessage}
                    onRolesChange={() => void reloadTeamPermissions()}
                  />
                ) : null}

                {settingsPanel === "integrations" && teamId && currentTeam && showIntegrations ? (
                  <IntegrationsSettingsSection
                    teamId={teamId}
                    teamKey={currentTeam.key}
                    canManageDiscord={canManageDiscord}
                    canManageSecrets={canManageDiscordSecrets}
                    onMessage={setProfileMessage}
                  />
                ) : null}

                {settingsPanel === "updates" && teamId && currentTeam && showMaintenance ? (
                  <ServerMaintenanceSettingsSection
                    teamId={teamId}
                    canRun={canRunMaintenance}
                    onMessage={setProfileMessage}
                  />
                ) : null}

                {settingsPanel === "tokens" ? (
                  <div className="settings-panel">
                    <header className="settings-panel-header">
                      <h2>API tokens</h2>
                      <p className="settings-copy settings-lead">
                        Personal access tokens for MCP, CLI, and the Discord bot.
                      </p>
                    </header>

                    <section className="settings-section">
                      <h3>Personal access tokens</h3>
                      <p className="settings-copy">
                        Use a PAT for MCP and CLI. It is shown once when created.
                      </p>
                      <div className="row">
                        <input
                          value={patName}
                          onChange={(e) => setPatName(e.target.value)}
                          placeholder="Token name"
                        />
                        <button type="button" onClick={() => void createPat()}>
                          Create token
                        </button>
                      </div>
                      {createdPat ? <pre className="token-box">{createdPat}</pre> : null}
                    </section>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
          {boardPanel}
        </div>
      ) : roadmapOpen ? (
        <div className="app-workspace app-workspace--roadmap">
          <RoadmapPanel />
        </div>
      ) : (
        boardPanel
      )}

      <QuickAddModal
        open={quickAdd !== null}
        title={
          quickAdd?.kind === "row"
            ? "Add row"
            : quickAdd?.kind === "column"
              ? `Add column — ${rows.find((row) => row.id === quickAdd.rowId)?.name ?? "row"}`
              : "Add issue"
        }
        label={
          quickAdd?.kind === "issue"
            ? "Issue title"
            : quickAdd?.kind === "row"
              ? "Row name"
              : "Column name"
        }
        placeholder={
          quickAdd?.kind === "issue" ? "What needs to be done?" : "Name"
        }
        value={quickAddValue}
        onChange={setQuickAddValue}
        onSubmit={() => void submitQuickAdd()}
        onClose={closeQuickAdd}
      />

      {rowFilesRow && !overlayOpen && (
        <RowFilesDrawer
          row={rowFilesRow}
          onClose={() => setRowFilesRow(null)}
          onNavigateRef={(ref) => void goToRef(ref)}
        />
      )}

      {teamFilesOpen && teamId && !overlayOpen && (
        <TeamFilesDrawer
          teamId={teamId}
          open={teamFilesOpen}
          onClose={() => setTeamFilesOpen(false)}
          onNavigateRef={(ref) => {
            setTeamFilesOpen(false);
            void goToRef(ref);
          }}
        />
      )}
      {selectedIssue && !overlayOpen && (
        <IssueDrawer
          issue={selectedIssue}
          members={members}
          statuses={statuses}
          rows={rows}
          currentUserId={user?.id ?? null}
          onClose={() => setSelectedIssue(null)}
          onNavigateRef={(ref) => void goToRef(ref)}
          onUpdate={(updated) => {
            setIssues((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item)),
            );
            setSelectedIssue(updated);
          }}
          onDelete={deleteIssue}
        />
      )}
      {pendingUndo && (
        <UndoToast
          label={pendingUndo.label}
          historyCount={changeHistory.length}
          historyOpen={historyOpen}
          onUndo={undoDelete}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
        />
      )}
      <ChangeHistoryPanel
        entries={changeHistory}
        pendingId={pendingUndo?.id ?? null}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onUndo={undoEntry}
        onRestore={restoreEntry}
      />
      <AboutDialog
        open={aboutOpen}
        version={APP_VERSION}
        onClose={() => setAboutOpen(false)}
      />
    </div>
  );
}

function LoginScreen({
  error,
  loading,
  onLogin,
  onRegister,
  onOpenAbout,
}: {
  error: string | null;
  loading: boolean;
  onLogin: (email: string, password: string) => void;
  onRegister: (name: string, email: string, password: string) => void;
  onOpenAbout: () => void;
}) {
  const initialResetToken = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset");
  })();

  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    initialResetToken ? "reset" : "login",
  );
  const [name, setName] = useState("Demo User");
  const [email, setEmail] = useState("demo@teamflow.local");
  const [password, setPassword] = useState("changeme123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(initialResetToken ?? "");
  const [inviteOnly, setInviteOnly] = useState(false);
  const [passwordResetEmail, setPasswordResetEmail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingInvite = hasPendingInvite();

  useEffect(() => {
    void client
      .getAuthConfig()
      .then((config) => {
        setInviteOnly(config.inviteOnly);
        setPasswordResetEmail(config.passwordResetEmail);
      })
      .catch(() => {
        setInviteOnly(false);
        setPasswordResetEmail(false);
      });
  }, []);

  const registerBlocked = inviteOnly && !pendingInvite;
  const displayError = localError ?? error;

  function clearResetFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  async function handleForgotPassword() {
    setLocalError(null);
    setStatusMessage(null);
    if (!email.trim()) {
      setLocalError("Enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await client.requestPasswordReset({ email: email.trim() });
      setStatusMessage(result.message);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setLocalError(null);
    setStatusMessage(null);
    if (!resetToken.trim()) {
      setLocalError("Reset link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await client.resetPassword({ token: resetToken.trim(), password });
      clearResetFromUrl();
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMode("login");
      setStatusMessage("Password updated. Log in with your new password.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">TEAMFLOW</p>
        <h1>
          {mode === "forgot"
            ? "Forgot password"
            : mode === "reset"
              ? "Set new password"
              : "Team task board"}
        </h1>
        <p className="muted">
          {mode === "forgot"
            ? "We'll send a reset link if email is configured on this server."
            : mode === "reset"
              ? "Choose a new password for your account."
              : "Self-hosted issues with MCP for AI assistants."}
        </p>

        {pendingInvite && mode !== "forgot" && mode !== "reset" ? (
          <p className="hint invite-login-hint">
            You have a team invite — log in or register to join.
          </p>
        ) : inviteOnly && mode === "register" ? (
          <p className="hint invite-login-hint">
            Registration is invite-only. Open an invite link before creating an account.
          </p>
        ) : null}

        {mode === "login" || mode === "register" ? (
          <div className="tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              disabled={registerBlocked}
              onClick={() => {
                setMode("register");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Register
            </button>
          </div>
        ) : null}

        {mode === "register" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {mode !== "reset" ? (
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        ) : null}

        {mode === "login" || mode === "register" || mode === "reset" ? (
          <label>
            {mode === "reset" ? "New password" : "Password"}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "reset" ? "new-password" : "current-password"}
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}

        {mode === "login" ? (
          <button
            type="button"
            className="ghost login-forgot-link"
            onClick={() => {
              setMode("forgot");
              setLocalError(null);
              setStatusMessage(null);
            }}
          >
            Forgot password?
          </button>
        ) : null}

        {displayError && <div className="banner error">{displayError}</div>}
        {statusMessage && <div className="banner">{statusMessage}</div>}

        {mode === "forgot" ? (
          <>
            {!passwordResetEmail ? (
              <p className="hint">
                Email is not configured on this server. After you submit, the reset link is
                written to the server logs for your administrator.
              </p>
            ) : null}
            <button type="button" disabled={loading || submitting} onClick={() => void handleForgotPassword()}>
              {loading || submitting ? "Working…" : "Send reset link"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode("login");
                setLocalError(null);
                setStatusMessage(null);
              }}
            >
              Back to log in
            </button>
          </>
        ) : mode === "reset" ? (
          <>
            <button type="button" disabled={loading || submitting} onClick={() => void handleResetPassword()}>
              {loading || submitting ? "Working…" : "Update password"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearResetFromUrl();
                setMode("login");
                setLocalError(null);
              }}
            >
              Back to log in
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={loading || (mode === "register" && registerBlocked)}
            onClick={() =>
              mode === "login"
                ? onLogin(email, password)
                : onRegister(name, email, password)
            }
          >
            {loading ? "Working…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        )}

        {mode === "login" ? (
          <p className="hint">Demo: demo@teamflow.local / changeme123 (after seed)</p>
        ) : null}

        <button type="button" className="ghost about-login-link" onClick={onOpenAbout}>
          About Teamflow
        </button>
      </div>
    </div>
  );
}
