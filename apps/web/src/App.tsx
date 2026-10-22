import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  Priority,
  TeamMemberPublic,
  TeamPublic,
  UserPublic,
  UserProfile,
} from "@teamflow/core";
import {
  createDefaultUserProfile,
  mergeUserProfile,
  permissionsForSystemSlug,
  type SystemRoleSlug,
} from "@teamflow/core";
import { clearSession, client, getStoredUser, setSession } from "./api";
import { applyUserProfile, clearLegacyLocalProfile, mergeWithLegacyDefaults } from "./profile";
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
import { queryKeys } from "./queries/keys";
import { refreshTeams, useTeamPermissionsQuery, useTeamsQuery } from "./queries/teams";
import { updateBoard, useBoardQuery, type BoardData } from "./queries/board";
import {
  createColumn as createColumnChange,
  completeIssue as completeIssueChange,
  createIssue as createIssueChange,
  createRow as createRowChange,
  insertIssueSorted,
  patchColumn,
  patchIssue,
  patchIssues,
  patchRow,
  reorderColumns as reorderColumnsChange,
  reorderRows as reorderRowsChange,
  useBoardMutation,
} from "./queries/boardMutations";
import { hideBoardItems } from "./queries/hiddenBoardItems";
import { errorMessage, useErrorSink } from "./lib/errorSink";
import type { IssueTimerPatch } from "./lib/timer";
import { useMembersQuery } from "./queries/members";
import { useAuthConfigQuery } from "./queries/auth";
import { hasTeamPermission } from "./lib/teamPermissions";
import {
  normalizeRefInput,
  scrollToColumnRef,
  scrollToIssueRef,
  scrollToRowRef,
} from "./lib/refLinks";
import { hasPendingInvite, stashPendingInvite, takePendingInvite } from "./lib/inviteLinks";
import { clearRefBackStack, peekRefBack, popRefBack, pushRefBack } from "./lib/refBackStack";
import {
  boardPath,
  isSettingsPanel,
  issuePath,
  legacyLinkTarget,
  planPath,
  settingsPath,
  useAppRoute,
  type AuthMode,
} from "./lib/appRoute";

/** Location state: where to go after login, and a row/column ref for the board to open. */
type NavState = { from?: Pick<Location, "pathname" | "search" | "state">; ref?: string } | null;

const APP_VERSION = __TEAMFLOW_VERSION__;

const NO_TEAMS: TeamPublic[] = [];
const NO_ROWS: BoardRowPublic[] = [];
const NO_STATUSES: IssueStatusPublic[] = [];
const NO_ISSUES: IssuePublic[] = [];
const NO_MEMBERS: TeamMemberPublic[] = [];

type QuickAddTarget =
  | { kind: "row" }
  | { kind: "column"; rowId: string }
  | { kind: "issue"; rowId: string; statusId: string };

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useAppRoute();
  const navState = location.state as NavState;
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserPublic | null>(getStoredUser);
  /** Set once /auth/me and the profile are loaded; team data waits for it. */
  const [sessionReady, setSessionReady] = useState(false);
  const teamsQuery = useTeamsQuery(Boolean(user) && sessionReady);
  const teams = teamsQuery.data ?? NO_TEAMS;
  const teamsLoaded = teamsQuery.isSuccess;
  const routeTeam = route.teamKey ? (teams.find((team) => team.key === route.teamKey) ?? null) : null;
  const teamId = routeTeam?.id ?? null;
  const teamKey = routeTeam?.key ?? null;
  // Board data is keyed by team: a slow response for the previous team cannot land here.
  const boardQuery = useBoardQuery(teamId);
  const rows = boardQuery.data?.rows ?? NO_ROWS;
  const statuses = boardQuery.data?.statuses ?? NO_STATUSES;
  const issues = boardQuery.data?.issues ?? NO_ISSUES;
  const boardTeamId = boardQuery.isSuccess ? teamId : null;
  const membersQuery = useMembersQuery(teamId);
  const members = membersQuery.data ?? NO_MEMBERS;
  // The open issue is whatever /t/:teamKey/issue/:issueRef names, read from the board cache.
  const selectedIssue = route.issueRef
    ? (issues.find((issue) => issue.identifier === route.issueRef) ?? null)
    : null;
  const [rowFilesRow, setRowFilesRow] = useState<BoardRowPublic | null>(null);
  const [teamFilesOpen, setTeamFilesOpen] = useState(false);
  const [refBackLabel, setRefBackLabel] = useState<string | null>(
    () => peekRefBack()?.label ?? null,
  );
  const { error, report, clear: clearError } = useErrorSink();
  const [sessionLoading, setSessionLoading] = useState(false);
  const loading = sessionLoading || (Boolean(teamId) && boardQuery.isPending);
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
  const handledRefStateRef = useRef<unknown>(null);
  const handledInviteRef = useRef<string | null>(null);
  const lastSettingsPanelRef = useRef<SettingsPanel>("general");
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
  const settingsPanel: SettingsPanel = isSettingsPanel(route.settingsPanel ?? undefined)
    ? (route.settingsPanel as SettingsPanel)
    : "general";
  const permissionsQuery = useTeamPermissionsQuery(teamId);
  const teamPermissions = permissionsQuery.data ?? null;
  const teamPermissionsReady = Boolean(teamId) && permissionsQuery.isFetched;
  const currentMember = members.find((member) => member.userId === user?.id);
  const effectiveTeamPermissions =
    teamPermissions ??
    (currentMember && ["owner", "admin", "member", "viewer"].includes(currentMember.roleSlug)
      ? {
          roleId: currentMember.roleId,
          roleName: currentMember.roleName,
          roleSlug: currentMember.roleSlug,
          permissions: permissionsForSystemSlug(currentMember.roleSlug as SystemRoleSlug),
        }
      : null);
  const showRoles = hasTeamPermission(effectiveTeamPermissions, "team.roles.view");
  const canManageRoles = hasTeamPermission(effectiveTeamPermissions, "team.roles.manage");
  const showIntegrations = hasTeamPermission(effectiveTeamPermissions, "integrations.discord.view");
  const canManageDiscord = hasTeamPermission(
    effectiveTeamPermissions,
    "integrations.discord.manage",
  );
  // Server-wide panels need the instance-admin flag (GET /auth/me) on top of the team permission.
  const isInstanceAdmin = user?.isInstanceAdmin === true;
  const canManageDiscordSecrets =
    isInstanceAdmin && hasTeamPermission(effectiveTeamPermissions, "integrations.discord.secrets");
  const showMaintenance =
    isInstanceAdmin && hasTeamPermission(effectiveTeamPermissions, "server.maintenance.view");
  const canRunMaintenance =
    isInstanceAdmin && hasTeamPermission(effectiveTeamPermissions, "server.maintenance.run");
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
      report(err, "Failed to save profile");
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

  function reloadBoard() {
    if (teamId) void queryClient.invalidateQueries({ queryKey: queryKeys.board(teamId) });
  }

  const bootstrap = useCallback(async () => {
    setSessionLoading(true);
    clearError();
    try {
      const { user: me } = await client.me();
      setUser(me);

      try {
        const { profile: serverProfile } = await client.getProfile();
        const { profile: next, migrated } = mergeWithLegacyDefaults(serverProfile);
        profileRef.current = next;
        applyUserProfile(next);
        setProfile(next);
        if (migrated) {
          await client.saveProfile(next);
          clearLegacyLocalProfile();
        }
      } catch {
        const { profile: fallback } = mergeWithLegacyDefaults(createDefaultUserProfile());
        profileRef.current = fallback;
        applyUserProfile(fallback);
        setProfile(fallback);
      }

      setSessionReady(true);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  /** Team to open when the URL names none: the last one used, else the first. */
  function defaultTeamKey(list: TeamPublic[] = teams) {
    const savedTeamId = profileRef.current.ui?.lastTeamId ?? null;
    return (list.find((team) => team.id === savedTeamId) ?? list[0])?.key ?? null;
  }

  // Remember the open team so the next visit to / lands on it.
  useEffect(() => {
    if (!teamId || profileRef.current.ui?.lastTeamId === teamId) return;
    updateProfile(mergeUserProfile(profileRef.current, { ui: { lastTeamId: teamId } }));
  }, [teamId, updateProfile]);

  const switchTeam = useCallback(
    (nextTeamId: string, list: TeamPublic[] = teams) => {
      const next = list.find((team) => team.id === nextTeamId);
      if (!next) return;
      clearRefBackStack();
      setRefBackLabel(null);
      navigate(boardPath(next.key));
    },
    [navigate, teams],
  );

  async function refreshTeamsAndSwitch(teamIdToSelect: string) {
    const nextTeams = await refreshTeams(queryClient);
    switchTeam(teamIdToSelect, nextTeams);
  }

  async function handleTeamCreated(newTeamId: string, switchToNew: boolean) {
    const nextTeams = await refreshTeams(queryClient);
    if (switchToNew || !teamId) {
      switchTeam(newTeamId, nextTeams);
    }
  }

  async function handleTeamLeft(leftTeamId: string) {
    const nextTeams = await refreshTeams(queryClient);
    if (teamId === leftTeamId) {
      const fallback = nextTeams[0]?.key ?? null;
      navigate(boardPath(fallback));
    }
  }

  async function handleTeamDeleted(deletedTeamId: string) {
    const nextTeams = await refreshTeams(queryClient);
    if (teamId === deletedTeamId) {
      const fallback = nextTeams[0]?.key ?? null;
      navigate(boardPath(fallback));
    }
  }

  // /invite/:token: accept once signed in (the logged-out case stashes it for register).
  useEffect(() => {
    const token = route.inviteToken;
    if (!token || !user || !teamsLoaded || handledInviteRef.current === token) return;
    handledInviteRef.current = token;
    takePendingInvite();
    void (async () => {
      try {
        const { team, alreadyMember } = await client.acceptInvite(token);
        await refreshTeams(queryClient);
        setRefNotice(
          alreadyMember
            ? `Already on team ${team.key} — ${team.name}`
            : `Joined team ${team.key} — ${team.name}`,
        );
        navigate(boardPath(team.key), { replace: true });
      } catch (err) {
        report(err, "Failed to accept invite");
        navigate("/", { replace: true });
      }
    })();
  }, [route.inviteToken, user, teamsLoaded, navigate, queryClient]);

  // A row/column ref handed over by a legacy ?ref= link or by goToRef across a reload.
  useEffect(() => {
    const ref = navState?.ref;
    if (!ref || !teamId || loading || handledRefStateRef.current === navState) return;
    handledRefStateRef.current = navState;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void goToRef(ref);
  }, [navState, teamId, loading]);

  // An issue the URL names but the board list lacks is resolved once and added to the cache.
  useEffect(() => {
    if (!route.issueRef || selectedIssue) return;
    if (teamId && boardTeamId === teamId && !loading) {
      void goToRef(route.issueRef, { skipBackPush: true });
    }
  }, [route.issueRef, selectedIssue, teamId, boardTeamId, loading]);

  function openIssue(issue: Pick<IssuePublic, "identifier">) {
    if (!teamKey) return;
    navigate(issuePath(teamKey, issue.identifier));
  }

  function closeIssue() {
    if (route.issueRef) navigate(boardPath(teamKey));
  }

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
  }

  async function handleRegister(name: string, email: string, password: string) {
    setSessionLoading(true);
    clearError();
    try {
      const inviteToken = takePendingInvite() ?? undefined;
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
      report(err, "Registration failed");
    } finally {
      setSessionLoading(false);
    }
  }

  const board: BoardData = { rows, statuses, issues };
  const mutateBoard = useBoardMutation(teamId);

  function reorderRows(activeRowId: string, overRowId: string) {
    const change = reorderRowsChange(board, activeRowId, overRowId);
    if (change) void mutateBoard(change);
  }

  function reorderColumns(rowId: string, activeStatusId: string, overStatusId: string) {
    const change = reorderColumnsChange(board, rowId, activeStatusId, overStatusId);
    if (change) void mutateBoard(change);
  }

  function reorderIssuesInCell(rowId: string, statusId: string, orderedIssueIds: string[]) {
    void mutateBoard(
      patchIssues(
        board,
        members,
        orderedIssueIds.map((id, boardSort) => ({ id, patch: { rowId, statusId, boardSort } })),
        "Failed to reorder issue",
      ),
    );
  }

  function assignIssue(issue: IssuePublic, assigneeIds: string[]) {
    void mutateBoard(patchIssue(board, members, issue.id, { assigneeIds }, "Failed to assign issue"));
  }

  /** Column assign and bulk assign: one change, parallel requests, one rollback. */
  function assignIssues(issueIds: string[], assigneeIds: string[]) {
    if (issueIds.length === 0) return;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id) => ({ id, patch: { assigneeIds } })),
        "Failed to assign issues",
      ),
    );
  }

  function assignRow(row: BoardRowPublic, assigneeIds: string[]) {
    const assignees = members
      .filter((member) => assigneeIds.includes(member.userId))
      .map((member) => ({ userId: member.userId, name: member.name }));
    void mutateBoard(
      patchRow(row, { assigneeIds }, "Failed to assign row", {
        assignees,
        assigneeId: assigneeIds[0] ?? null,
        assigneeName: assignees[0]?.name ?? null,
      }),
    );
  }

  function bulkMoveIssues(issueIds: string[], rowId: string, statusId: string) {
    if (issueIds.length === 0) return;
    const baseSort = issues.filter((issue) => {
      const issueRow = issue.rowId ?? defaultRowId;
      return issueRow === rowId && issue.statusId === statusId && !issueIds.includes(issue.id);
    }).length;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id, index) => ({
          id,
          patch: { rowId, statusId, boardSort: baseSort + index },
        })),
        "Failed to move issues",
      ),
    );
  }

  function bulkSetPriority(issueIds: string[], priority: Priority) {
    if (issueIds.length === 0) return;
    void mutateBoard(
      patchIssues(
        board,
        members,
        issueIds.map((id) => ({ id, patch: { priority } })),
        "Failed to update issues",
      ),
    );
  }

  function bulkTimerIssues(issueIds: string[], action: "pause" | "reset") {
    const now = Date.now();
    const patches = issues
      .filter((issue) => issueIds.includes(issue.id))
      .map((issue) => ({
        id: issue.id,
        patch:
          action === "reset"
            ? { timerActiveAt: null, timerElapsedSec: 0, timerTargetSec: null }
            : {
                timerActiveAt: null,
                timerElapsedSec: issue.timerActiveAt
                  ? issue.timerElapsedSec +
                    Math.max(0, Math.floor((now - Date.parse(issue.timerActiveAt)) / 1000))
                  : issue.timerElapsedSec,
                timerTargetSec: issue.timerTargetSec,
              },
      }));
    if (patches.length === 0) return;
    void mutateBoard(patchIssues(board, members, patches, "Failed to update timers"));
  }

  /**
   * Issues go to the server trash at once. Undo (and Restore in the history) calls the restore
   * route for every one of them, so an undone delete survives the next refetch.
   */
  function trashIssues(issuesToDelete: IssuePublic[], label: string) {
    if (!teamId || issuesToDelete.length === 0) return;
    const forTeamId = teamId;
    const ids = issuesToDelete.map((issue) => issue.id);
    const idSet = new Set(ids);
    const reopen = selectedIssue && idSet.has(selectedIssue.id) ? selectedIssue : null;
    const show = hideBoardItems({ issueIds: ids });
    if (reopen) closeIssue();

    scheduleUndo({
      label,
      issueId: ids.length === 1 ? ids[0] : undefined,
      timing: "now",
      restore: () => {
        show();
        if (reopen) openIssue(reopen);
      },
      commit: async () => {
        try {
          await Promise.all(ids.map((id) => client.deleteIssue(id)));
        } catch (err) {
          report(err, ids.length === 1 ? "Failed to delete issue" : "Failed to delete issues");
          void queryClient.invalidateQueries({ queryKey: queryKeys.board(forTeamId) });
          throw err;
        }
        updateBoard(queryClient, forTeamId, (current) => ({
          ...current,
          issues: current.issues.filter((issue) => !idSet.has(issue.id)),
        }));
        show();
      },
      restoreFromTrash: async () => {
        const restored = await Promise.all(ids.map((id) => client.restoreIssue(id)));
        updateBoard(queryClient, forTeamId, (current) => ({
          ...current,
          issues: restored.map(({ issue }) => issue).reduce(insertIssueSorted, current.issues),
        }));
      },
    });
  }

  function bulkDeleteIssues(issuesToDelete: IssuePublic[]) {
    trashIssues(
      issuesToDelete,
      issuesToDelete.length === 1
        ? `Deleted ${issuesToDelete[0]!.identifier}`
        : `Deleted ${issuesToDelete.length} issues`,
    );
  }

  function updateRowColor(row: BoardRowPublic, color: string | null) {
    void mutateBoard(patchRow(row, { color }, "Failed to update row color"));
  }

  function updateStatusColor(status: IssueStatusPublic, color: string | null) {
    void mutateBoard(patchColumn(status, { color }, "Failed to update column color"));
  }

  function updateIssueColor(issue: IssuePublic, color: string | null) {
    void mutateBoard(patchIssue(board, members, issue.id, { color }, "Failed to update card color"));
  }

  function updateIssuePriority(issue: IssuePublic, priority: Priority) {
    if (issue.priority === priority) return;
    void mutateBoard(
      patchIssue(board, members, issue.id, { priority }, "Failed to update priority"),
    );
  }

  function updateIssueTimer(issue: IssuePublic, patch: IssueTimerPatch) {
    void mutateBoard(patchIssue(board, members, issue.id, patch, "Failed to update timer"));
  }

  function renameStatus(status: IssueStatusPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === status.name) return;
    void mutateBoard(patchColumn(status, { name: trimmed }, "Failed to rename column"));
  }

  /**
   * Rows and columns have no restore route, so their delete is only sent when the undo window
   * closes. Until then the board query hides them and a refetch cannot bring them back.
   */
  function scheduleStructureDelete(options: {
    label: string;
    hide: { rowIds?: string[]; statusIds?: string[] };
    send: () => Promise<unknown>;
    drop: (board: BoardData) => BoardData;
    errorMessage: string;
  }) {
    if (!teamId) return;
    const forTeamId = teamId;
    const show = hideBoardItems(options.hide);
    scheduleUndo({
      label: options.label,
      timing: "deferred",
      restore: show,
      commit: async () => {
        try {
          await options.send();
        } catch (err) {
          report(err, options.errorMessage);
          throw err;
        }
        updateBoard(queryClient, forTeamId, options.drop);
        show();
      },
    });
  }

  function removeRow(row: BoardRowPublic) {
    scheduleStructureDelete({
      label: `Removed row "${row.name}"`,
      hide: {
        rowIds: [row.id],
        statusIds: statuses.filter((status) => status.rowId === row.id).map((status) => status.id),
      },
      send: () => client.deleteRow(row.id),
      drop: (current) => ({
        ...current,
        rows: current.rows.filter((item) => item.id !== row.id),
        statuses: current.statuses.filter((status) => status.rowId !== row.id),
      }),
      errorMessage: "Failed to remove row",
    });
  }

  function removeColumn(status: IssueStatusPublic) {
    scheduleStructureDelete({
      label: `Removed column "${status.name}"`,
      hide: { statusIds: [status.id] },
      send: () => client.deleteStatus(status.id),
      drop: (current) => ({
        ...current,
        statuses: current.statuses.filter((item) => item.id !== status.id),
      }),
      errorMessage: "Failed to remove column",
    });
  }

  function deleteIssue(issue: IssuePublic) {
    trashIssues([issue], `Deleted ${issue.identifier}`);
  }

  function openQuickAdd(target: QuickAddTarget, initialValue = "") {
    setQuickAdd(target);
    setQuickAddValue(initialValue);
    clearError();
  }

  function closeQuickAdd() {
    setQuickAdd(null);
    setQuickAddValue("");
  }

  function submitQuickAdd() {
    if (!quickAdd || !teamId) return;
    const value = quickAddValue.trim();
    if (!value) return;

    if (quickAdd.kind === "column") {
      void mutateBoard(createColumnChange(board, teamId, quickAdd.rowId, value));
    } else if (quickAdd.kind === "row") {
      void mutateBoard(createRowChange(board, value, teamId));
    } else {
      void mutateBoard(
        createIssueChange(board, {
          teamId,
          rowId: quickAdd.rowId,
          statusId: quickAdd.statusId,
          title: value,
        }),
      );
    }
    closeQuickAdd();
  }

  function addColumn(rowId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "column", rowId });
  }

  function addRow() {
    if (!teamId) return;
    openQuickAdd({ kind: "row" }, `Row ${rows.length + 1}`);
  }

  function addIssue(rowId: string, statusId: string) {
    if (!teamId) return;
    openQuickAdd({ kind: "issue", rowId, statusId });
  }

  function renameRow(row: BoardRowPublic, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === row.name) return;
    void mutateBoard(patchRow(row, { name: trimmed }, "Failed to rename row"));
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

    clearError();
    setRefNotice(null);
    try {
      const result = await client.resolveRef(teamId, ref);
      triggerRefNavMotion();

      if (result.issue) {
        const found = result.issue;
        updateBoard(queryClient, teamId, (current) => ({
          ...current,
          issues: current.issues.some((item) => item.id === found.id)
            ? current.issues
            : [...current.issues, found],
        }));
        if (route.issueRef !== result.issue.identifier) openIssue(result.issue);
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
          setRefNotice(`${result.status.name} · ${result.row.name}`);
          return;
        }

        scrollToRowRef(result.row.id);
        setHighlightedColumnKey(null);
        setRefNotice(`Row: ${result.row.name}`);
        return;
      }
    } catch (err) {
      report(err, "Reference not found");
      if (route.issueRef) navigate(boardPath(teamKey), { replace: true });
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
      report(err, "Failed to export profile");
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
      report(err, "Failed to import profile");
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
      report(err, "Failed to create token");
    }
  }

  function logout() {
    clearSession();
    handledRefStateRef.current = null;
    handledInviteRef.current = null;
    setUser(null);
    setSessionReady(false);
    queryClient.clear();
    navigate("/login");
  }

  const settingsOpen = route.settingsOpen;
  const roadmapOpen = route.planOpen;
  if (settingsOpen) lastSettingsPanelRef.current = settingsPanel;

  const setSettingsPanel = useCallback(
    (panel: SettingsPanel, options?: { replace?: boolean }) => {
      navigate(settingsPath(teamKey, panel), options);
    },
    [navigate, teamKey],
  );

  // Panels the URL names but the user cannot open fall back to General.
  useEffect(() => {
    if (!settingsOpen || !teamsLoaded) return;
    const teamReady = Boolean(teamId) && teamPermissionsReady;
    const unknownPanel = route.settingsPanel !== settingsPanel;
    if (
      unknownPanel ||
      (settingsPanel === "team" && !teamId) ||
      (settingsPanel === "roles" && teamReady && !showRoles) ||
      (settingsPanel === "integrations" && teamReady && !showIntegrations)
    ) {
      setSettingsPanel("general", { replace: true });
    }
  }, [
    settingsOpen,
    teamsLoaded,
    route.settingsPanel,
    settingsPanel,
    showIntegrations,
    showRoles,
    teamId,
    teamPermissionsReady,
    setSettingsPanel,
  ]);
  const overlayOpen = settingsOpen || roadmapOpen;
  const useSamplePreview = settingsOpen && rows.length === 0;

  const closeSettings = useCallback(() => {
    navigate(boardPath(teamKey));
  }, [navigate, teamKey]);

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
              onSelectIssue={settingsOpen ? () => {} : openIssue}
              onDeleteIssue={settingsOpen ? () => {} : deleteIssue}
              onRenameRow={settingsOpen ? () => {} : (row, name) => void renameRow(row, name)}
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
              onAssignIssues={settingsOpen ? () => {} : assignIssues}
              members={members}
              onAssignIssue={
                settingsOpen
                  ? () => {}
                  : (issue, assigneeIds) => void assignIssue(issue, assigneeIds)
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
                settingsOpen
                  ? () => {}
                  : (issue, priority) => void updateIssuePriority(issue, priority)
              }
              onUpdateIssueTimer={settingsOpen ? () => {} : updateIssueTimer}
              highlightedIssueId={settingsOpen ? null : highlightedIssueId}
              highlightedColumnKey={settingsOpen ? null : highlightedColumnKey}
              onGoToRef={settingsOpen ? undefined : (ref) => void goToRef(ref)}
              onBulkMove={settingsOpen ? undefined : bulkMoveIssues}
              onBulkAssign={settingsOpen ? undefined : assignIssues}
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

  // Old query-string links first, so they survive a detour through the login page.
  if (route.isIndex) {
    const legacy = legacyLinkTarget(location.search, location.hash);
    if (legacy) {
      return <Navigate to={legacy.to} replace state={legacy.ref ? { ref: legacy.ref } : null} />;
    }
  }

  const signedIn = Boolean(user) && (teamsLoaded || !route.authMode);

  if (!signedIn) {
    if (route.authMode) {
      return (
        <>
          <LoginScreen
            mode={route.authMode}
            resetToken={new URLSearchParams(location.search).get("token")}
            error={error}
            loading={loading}
            onModeChange={(mode) =>
              navigate(`/${mode}`, { replace: true, state: navState?.from ? navState : null })
            }
            onLogin={handleLogin}
            onRegister={handleRegister}
            onOpenAbout={() => setAboutOpen(true)}
          />
          <AboutDialog open={aboutOpen} version={APP_VERSION} onClose={() => setAboutOpen(false)} />
        </>
      );
    }
    if (route.inviteToken) stashPendingInvite(route.inviteToken);
    const from = { pathname: location.pathname, search: location.search, state: navState };
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (route.authMode) {
    const from = navState?.from;
    return from ? (
      <Navigate to={`${from.pathname}${from.search}`} replace state={from.state} />
    ) : (
      <Navigate to="/" replace />
    );
  }

  if (teamsLoaded) {
    if (route.isIndex && teams.length > 0) {
      return <Navigate to={boardPath(defaultTeamKey())} replace state={navState} />;
    }
    if (route.teamKey && !routeTeam) return <Navigate to="/" replace />;
  }
  const knownPath =
    route.isIndex ||
    route.teamKey ||
    route.settingsOpen ||
    route.planOpen ||
    route.inviteToken !== null;
  if (!knownPath) return <Navigate to="/" replace />;

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
                  switchTeam(e.target.value);
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
            onClick={() => navigate(roadmapOpen ? boardPath(teamKey) : planPath(teamKey))}
          >
            {roadmapOpen ? "Close plan" : "Plan"}
          </button>
          <button
            type="button"
            className={settingsOpen ? "active" : undefined}
            onClick={() =>
              navigate(
                settingsOpen
                  ? boardPath(teamKey)
                  : settingsPath(teamKey, lastSettingsPanelRef.current),
              )
            }
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

      {(error ?? boardQuery.error?.message) && (
        <div className="banner error">{error ?? boardQuery.error?.message}</div>
      )}
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

                    <AppearanceSettingsSection profile={profile} onProfileChange={updateProfile} />
                  </div>
                ) : null}

                {settingsPanel === "team" && teamId && currentTeam ? (
                  <div className="settings-panel">
                    <header className="settings-panel-header">
                      <h2>Team</h2>
                      <p className="settings-copy settings-lead">
                        Members, invites, and team lifecycle for <strong>{currentTeam.name}</strong>
                        .
                      </p>
                    </header>

                    <TeamSettingsSection
                      teamId={teamId}
                      teamName={currentTeam.name}
                      teamKey={currentTeam.key}
                      members={members}
                      currentUserId={user?.id ?? null}
                      permissions={effectiveTeamPermissions}
                      onMessage={setProfileMessage}
                      onTeamJoined={(joinedTeamId) => void refreshTeamsAndSwitch(joinedTeamId)}
                      onTeamLeft={(leftTeamId) => void handleTeamLeft(leftTeamId)}
                      onTeamDeleted={(deletedTeamId) => void handleTeamDeleted(deletedTeamId)}
                      onBoardChanged={reloadBoard}
                    />
                  </div>
                ) : null}

                {settingsPanel === "roles" && teamId && currentTeam && showRoles ? (
                  <RolesSettingsSection
                    teamId={teamId}
                    canManage={canManageRoles}
                    onMessage={setProfileMessage}
                    onRolesChange={() => void permissionsQuery.refetch()}
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
        placeholder={quickAdd?.kind === "issue" ? "What needs to be done?" : "Name"}
        value={quickAddValue}
        onChange={setQuickAddValue}
        onSubmit={submitQuickAdd}
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
          onClose={closeIssue}
          onNavigateRef={(ref) => void goToRef(ref)}
          onPatch={(patch) =>
            mutateBoard(
              patchIssue(board, members, selectedIssue.id, patch, "Failed to update issue"),
            )
          }
          onComplete={() => mutateBoard(completeIssueChange(selectedIssue.id))}
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
      <AboutDialog open={aboutOpen} version={APP_VERSION} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function LoginScreen({
  mode: routeMode,
  resetToken: routeResetToken,
  error,
  loading,
  onModeChange,
  onLogin,
  onRegister,
  onOpenAbout,
}: {
  mode: AuthMode;
  resetToken: string | null;
  error: string | null;
  loading: boolean;
  onModeChange: (mode: AuthMode) => void;
  onLogin: (email: string, password: string) => void;
  onRegister: (name: string, email: string, password: string) => void;
  onOpenAbout: () => void;
}) {
  // "Forgot password" is a step inside /login rather than a URL of its own.
  const [forgot, setForgot] = useState(false);
  const mode = routeMode === "login" && forgot ? "forgot" : routeMode;

  function setMode(next: AuthMode | "forgot") {
    setForgot(next === "forgot");
    const target = next === "forgot" ? "login" : next;
    if (target !== routeMode) onModeChange(target);
  }
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState(routeResetToken ?? "");
  const authConfig = useAuthConfigQuery().data;
  const inviteOnly = authConfig?.inviteOnly ?? false;
  const passwordResetEmail = authConfig?.passwordResetEmail ?? false;
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingInvite = hasPendingInvite();

  const registerBlocked = inviteOnly && !pendingInvite;
  const displayError = localError ?? error;

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
      setLocalError(errorMessage(err, "Request failed"));
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
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMode("login");
      setStatusMessage("Password updated. Log in with your new password.");
    } catch (err) {
      setLocalError(errorMessage(err, "Reset failed"));
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
                Email is not configured on this server. After you submit, the reset link is written
                to the server logs for your administrator.
              </p>
            ) : null}
            <button
              type="button"
              disabled={loading || submitting}
              onClick={() => void handleForgotPassword()}
            >
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
            <button
              type="button"
              disabled={loading || submitting}
              onClick={() => void handleResetPassword()}
            >
              {loading || submitting ? "Working…" : "Update password"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
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
              mode === "login" ? onLogin(email, password) : onRegister(name, email, password)
            }
          >
            {loading ? "Working…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        )}

        {mode === "login" ? (
          <p className="hint">
            New install? Register the first account; it becomes the instance admin.
          </p>
        ) : null}

        <button type="button" className="ghost about-login-link" onClick={onOpenAbout}>
          About Teamflow
        </button>
      </div>
    </div>
  );
}
