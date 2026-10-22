import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  BoardRowPublic,
  IssuePublic,
  IssueStatusPublic,
  TeamMemberPublic,
  TeamPublic,
} from "@teamflow/core";
import { mergeUserProfile, permissionsForSystemSlug, type SystemRoleSlug } from "@teamflow/core";
import { client } from "../../api";
import { KanbanBoard } from "../../KanbanBoard";
import { AboutDialog } from "../../components/AboutDialog";
import { BoardTips } from "../../components/BoardTips";
import { ChangeHistoryPanel } from "../../components/ChangeHistoryPanel";
import { GoToRefBar } from "../../components/GoToRefBar";
import { IssueDrawer } from "../../components/IssueDrawer";
import { QuickAddModal } from "../../components/QuickAddModal";
import { RowFilesDrawer } from "../../components/RowFilesDrawer";
import { TeamFilesDrawer } from "../../components/TeamFilesDrawer";
import { UndoToast } from "../../components/UndoToast";
import { UserMenu } from "../../components/UserMenu";
import type { SettingsPanel } from "../../components/SettingsNav";
import { useChangeHistory } from "../../hooks/useChangeHistory";
import {
  boardPath,
  isSettingsPanel,
  issuePath,
  legacyLinkTarget,
  planPath,
  settingsPath,
  useAppRoute,
} from "../../lib/appRoute";
import { useErrorSink } from "../../lib/errorSink";
import { stashPendingInvite } from "../../lib/inviteLinks";
import type { NavState } from "../../lib/navState";
import { clearRefBackStack, peekRefBack, popRefBack, pushRefBack } from "../../lib/refBackStack";
import {
  normalizeRefInput,
  scrollToColumnRef,
  scrollToIssueRef,
  scrollToRowRef,
} from "../../lib/refLinks";
import { hasTeamPermission, TeamPermissionsContext } from "../../lib/teamPermissions";
import { usePanScroll } from "../../lib/usePanScroll";
import { updateBoard, useBoardQuery } from "../../queries/board";
import { completeIssue as completeIssueChange, patchIssue } from "../../queries/boardMutations";
import { queryKeys } from "../../queries/keys";
import { useMembersQuery } from "../../queries/members";
import { refreshTeams, useTeamPermissionsQuery } from "../../queries/teams";
import { useSession, useTeams } from "../../session/session";
import { ShellContext, type ShellContextValue } from "./shellContext";
import { useBoardActions } from "./useBoardActions";
import { Toast } from "../../ui/BottomDock";

const APP_VERSION = __TEAMFLOW_VERSION__;

const NO_ROWS: BoardRowPublic[] = [];
const NO_STATUSES: IssueStatusPublic[] = [];
const NO_ISSUES: IssuePublic[] = [];
const NO_MEMBERS: TeamMemberPublic[] = [];

/**
 * The signed-in screen: top bar, board, drawers and undo. Settings panels and the plan render
 * in its outlet. It also handles `/` (legacy links, default team) and sends signed-out users to
 * /login.
 */
export function BoardShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useAppRoute();
  const navState = location.state as NavState;
  const queryClient = useQueryClient();
  const { user, sessionLoading, profile, profileRef, updateProfile, logout } = useSession();
  const { teams, teamsLoaded } = useTeams();
  const { error, report, clear: clearError } = useErrorSink();
  const [dismissedBoardError, setDismissedBoardError] = useState<string | null>(null);

  const routeTeam = route.teamKey
    ? (teams.find((team) => team.key === route.teamKey) ?? null)
    : null;
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
  const loading = sessionLoading || (Boolean(teamId) && boardQuery.isPending);
  const boardError = boardQuery.error?.message ?? null;
  const shownError = error ?? (boardError !== dismissedBoardError ? boardError : null);
  // The open issue is whatever /t/:teamKey/issue/:issueRef names, read from the board cache.
  const selectedIssue = route.issueRef
    ? (issues.find((issue) => issue.identifier === route.issueRef) ?? null)
    : null;

  const [rowFilesRow, setRowFilesRow] = useState<BoardRowPublic | null>(null);
  const [teamFilesOpen, setTeamFilesOpen] = useState(false);
  const [refBackLabel, setRefBackLabel] = useState<string | null>(
    () => peekRefBack()?.label ?? null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<string | null>(null);
  const [highlightedColumnKey, setHighlightedColumnKey] = useState<string | null>(null);
  const [refNotice, setRefNotice] = useState<string | null>(null);
  const [refNavActive, setRefNavActive] = useState(false);
  const refNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const handledNavStateRef = useRef<unknown>(null);
  const lastSettingsPanelRef = useRef<SettingsPanel>("general");
  const {
    history: changeHistory,
    pending: pendingUndo,
    schedule: scheduleUndo,
    undo: undoDelete,
    undoEntry,
    restoreEntry,
  } = useChangeHistory();

  const permissionsQuery = useTeamPermissionsQuery(teamId);
  const currentMember = members.find((member) => member.userId === user?.id);
  const effectiveTeamPermissions =
    permissionsQuery.data ??
    (currentMember && ["owner", "admin", "member", "viewer"].includes(currentMember.roleSlug)
      ? {
          roleId: currentMember.roleId,
          roleName: currentMember.roleName,
          roleSlug: currentMember.roleSlug,
          permissions: permissionsForSystemSlug(currentMember.roleSlug as SystemRoleSlug),
        }
      : null);
  // Server-wide panels need the instance-admin flag (GET /auth/me) on top of the team permission.
  const isInstanceAdmin = user?.isInstanceAdmin === true;
  const can = (permission: Parameters<typeof hasTeamPermission>[1]) =>
    hasTeamPermission(effectiveTeamPermissions, permission);
  const access = {
    showRoles: can("team.roles.view"),
    canManageRoles: can("team.roles.manage"),
    showIntegrations: can("integrations.discord.view"),
    canManageDiscord: can("integrations.discord.manage"),
    canManageDiscordSecrets: isInstanceAdmin && can("integrations.discord.secrets"),
    showMaintenance: isInstanceAdmin && can("server.maintenance.view"),
    canRunMaintenance: isInstanceAdmin && can("server.maintenance.run"),
  };

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

  const reloadBoard = useCallback(() => {
    if (teamId) void queryClient.invalidateQueries({ queryKey: queryKeys.board(teamId) });
  }, [queryClient, teamId]);

  /** Team to open when the URL names none: the last one used, else the first. */
  function defaultTeamKey(list: TeamPublic[] = teams) {
    const savedTeamId = profileRef.current.ui?.lastTeamId ?? null;
    return (list.find((team) => team.id === savedTeamId) ?? list[0])?.key ?? null;
  }

  // Remember the open team so the next visit to / lands on it.
  useEffect(() => {
    if (!teamId || profileRef.current.ui?.lastTeamId === teamId) return;
    updateProfile(mergeUserProfile(profileRef.current, { ui: { lastTeamId: teamId } }));
  }, [teamId, updateProfile, profileRef]);

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

  /** Leaving or deleting the open team moves to the first remaining team. */
  async function handleTeamGone(goneTeamId: string) {
    const nextTeams = await refreshTeams(queryClient);
    if (teamId === goneTeamId) {
      navigate(boardPath(nextTeams[0]?.key ?? null));
    }
  }

  // A ref (legacy ?ref= link) or notice (invite accepted) handed over through location state.
  useEffect(() => {
    if (!navState || !teamId || loading || handledNavStateRef.current === navState) return;
    if (!navState.ref && !navState.notice) return;
    handledNavStateRef.current = navState;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    if (navState.notice) setRefNotice(navState.notice);
    if (navState.ref) void goToRef(navState.ref);
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

  const board = { rows, statuses, issues };
  const actions = useBoardActions({
    teamId,
    board,
    members,
    defaultRowId,
    selectedIssue,
    openIssue,
    closeIssue,
    scheduleUndo,
  });
  const {
    mutateBoard,
    reorderRows,
    reorderColumns,
    reorderIssuesInCell,
    assignIssue,
    assignIssues,
    assignRow,
    bulkMoveIssues,
    bulkSetPriority,
    bulkTimerIssues,
    bulkDeleteIssues,
    updateRowColor,
    updateStatusColor,
    updateIssueColor,
    updateIssuePriority,
    updateIssueTimer,
    renameStatus,
    removeRow,
    removeColumn,
    deleteIssue,
    closeQuickAdd,
    submitQuickAdd,
    addColumn,
    addRow,
    addIssue,
    renameRow,
    quickAdd,
    quickAddValue,
    setQuickAddValue,
  } = actions;

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

  const settingsOpen = route.settingsOpen;
  const roadmapOpen = route.planOpen;
  if (settingsOpen && isSettingsPanel(route.settingsPanel)) {
    lastSettingsPanelRef.current = route.settingsPanel;
  }
  const overlayOpen = settingsOpen || roadmapOpen;

  const closeSettings = useCallback(() => {
    navigate(boardPath(teamKey));
  }, [navigate, teamKey]);

  usePanScroll(boardScrollRef, !settingsOpen);

  const shellValue: ShellContextValue = {
    team: routeTeam,
    teamKey,
    teamsLoaded,
    members,
    permissions: effectiveTeamPermissions,
    permissionsReady: Boolean(teamId) && permissionsQuery.isFetched,
    access,
    reloadBoard,
    reloadPermissions: () => void permissionsQuery.refetch(),
    onTeamCreated: (newTeamId, switchToNew) => void handleTeamCreated(newTeamId, switchToNew),
    onTeamJoined: (joinedTeamId) => void refreshTeamsAndSwitch(joinedTeamId),
    onTeamLeft: (leftTeamId) => void handleTeamGone(leftTeamId),
    onTeamDeleted: (deletedTeamId) => void handleTeamGone(deletedTeamId),
    closeSettings,
  };

  const boardPanel = (
    <div className={`board-wrap ${refNavActive ? "board-wrap--ref-nav" : ""}`}>
      <div className="board-toolbar">
        <button type="button" disabled={!can("board.edit")} onClick={() => addRow()}>
          + Add row
        </button>
        <BoardTips />
      </div>

      <div ref={boardScrollRef} className="board-scroll">
        <KanbanBoard
          rows={rows}
          statuses={statuses}
          issues={issues}
          defaultRowId={defaultRowId}
          isRowHeadersVisible={isRowHeadersVisible}
          toggleRowHeaders={toggleRowHeaders}
          issuesForCell={issuesForCell}
          onSelectIssue={openIssue}
          onDeleteIssue={deleteIssue}
          onRenameRow={(row, name) => void renameRow(row, name)}
          onRenameStatus={(status, name) => void renameStatus(status, name)}
          onUpdateStatusColor={(status, color) => void updateStatusColor(status, color)}
          onRemoveRow={removeRow}
          onRemoveColumn={removeColumn}
          onAddColumn={addColumn}
          onAddIssue={(rowId, statusId) => void addIssue(rowId, statusId)}
          onReorderRows={(activeRowId, overRowId) => void reorderRows(activeRowId, overRowId)}
          onReorderColumns={(rowId, activeStatusId, overStatusId) =>
            void reorderColumns(rowId, activeStatusId, overStatusId)
          }
          onReorderIssuesInCell={reorderIssuesInCell}
          onAssignIssues={assignIssues}
          members={members}
          onAssignIssue={(issue, assigneeIds) => void assignIssue(issue, assigneeIds)}
          onAssignRow={(row, assigneeIds) => void assignRow(row, assigneeIds)}
          onUpdateRowColor={(row, color) => void updateRowColor(row, color)}
          onUpdateIssueColor={(issue, color) => void updateIssueColor(issue, color)}
          onUpdateIssuePriority={(issue, priority) => void updateIssuePriority(issue, priority)}
          onUpdateIssueTimer={updateIssueTimer}
          highlightedIssueId={highlightedIssueId}
          highlightedColumnKey={highlightedColumnKey}
          onGoToRef={(ref) => void goToRef(ref)}
          onBulkMove={bulkMoveIssues}
          onBulkAssign={assignIssues}
          onBulkPriority={bulkSetPriority}
          onBulkTimer={bulkTimerIssues}
          onBulkDelete={bulkDeleteIssues}
          onOpenRowFiles={setRowFilesRow}
        />
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

  if (!user) {
    if (route.inviteToken) stashPendingInvite(route.inviteToken);
    const from = { pathname: location.pathname, search: location.search, state: navState };
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (teamsLoaded) {
    if (route.isIndex && teams.length > 0) {
      return <Navigate to={boardPath(defaultTeamKey())} replace state={navState} />;
    }
    if (route.teamKey && !routeTeam) return <Navigate to="/" replace />;
  }

  return (
    <ShellContext.Provider value={shellValue}>
      <TeamPermissionsContext.Provider
        value={permissionsQuery.isFetched ? effectiveTeamPermissions : undefined}
      >
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-start">
              <span className="topbar-brand" aria-hidden="true">
                TEAMFLOW
              </span>
              <h1 className="sr-only">{teams.find((t) => t.id === teamId)?.name ?? "Board"}</h1>
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
              {!overlayOpen && refBackLabel ? (
                <button
                  type="button"
                  className="ghost ref-back-btn"
                  title={`Back to ${refBackLabel}`}
                  onClick={goBackRef}
                >
                  ← Back
                </button>
              ) : null}
              {!overlayOpen && (
                <GoToRefBar disabled={!teamId || loading} onGo={(ref) => void goToRef(ref)} />
              )}
            </div>
            <nav className="topbar-actions" aria-label="Board tools">
              <button
                type="button"
                className={`ghost topbar-btn${historyOpen ? " active" : ""}`}
                aria-pressed={historyOpen}
                disabled={changeHistory.length === 0}
                title="Recent changes"
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <span className="topbar-btn-icon" aria-hidden="true">
                  ⟲
                </span>
                <span className="topbar-btn-label">Recent</span>
                {changeHistory.length > 0 ? (
                  <span className="topbar-btn-badge">{changeHistory.length}</span>
                ) : null}
              </button>
              {!overlayOpen && teamId ? (
                <button
                  type="button"
                  className="ghost topbar-btn"
                  title="Team files"
                  onClick={() => setTeamFilesOpen(true)}
                >
                  <span className="topbar-btn-icon" aria-hidden="true">
                    ▤
                  </span>
                  <span className="topbar-btn-label">Files</span>
                </button>
              ) : null}
              <button
                type="button"
                className={`ghost topbar-btn${roadmapOpen ? " active" : ""}`}
                aria-pressed={roadmapOpen}
                title={roadmapOpen ? "Back to the board" : "Plan & backlog"}
                onClick={() => navigate(roadmapOpen ? boardPath(teamKey) : planPath(teamKey))}
              >
                <span className="topbar-btn-icon" aria-hidden="true">
                  ◫
                </span>
                <span className="topbar-btn-label">Plan</span>
              </button>
              <span className="topbar-divider" aria-hidden="true" />
              <UserMenu
                name={user?.name ?? ""}
                email={user?.email}
                tools={[
                  {
                    key: "recent",
                    icon: "⟲",
                    label: "Recent",
                    badge: changeHistory.length,
                    disabled: changeHistory.length === 0,
                    onSelect: () => setHistoryOpen(true),
                  },
                  ...(!overlayOpen && teamId
                    ? [
                        {
                          key: "files",
                          icon: "▤",
                          label: "Files",
                          onSelect: () => setTeamFilesOpen(true),
                        },
                      ]
                    : []),
                  {
                    key: "plan",
                    icon: "◫",
                    label: roadmapOpen ? "Back to board" : "Plan",
                    onSelect: () => navigate(roadmapOpen ? boardPath(teamKey) : planPath(teamKey)),
                  },
                ]}
                onSettings={() => navigate(settingsPath(teamKey, lastSettingsPanelRef.current))}
                onAbout={() => setAboutOpen(true)}
                onLogout={logout}
              />
            </nav>
          </header>

          {shownError ? (
            <Toast
              tone="error"
              onDismiss={() => {
                if (error) clearError();
                else setDismissedBoardError(shownError);
              }}
            >
              {shownError}
            </Toast>
          ) : null}
          {refNotice && <div className="banner ref-notice">{refNotice}</div>}
          {loading && <div className="banner">Loading…</div>}

          {settingsOpen ? (
            <div className="app-workspace app-workspace--settings">
              <Outlet />
            </div>
          ) : roadmapOpen ? (
            <div className="app-workspace app-workspace--roadmap">
              <Outlet />
            </div>
          ) : (
            <>
              {boardPanel}
              <Outlet />
            </>
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
      </TeamPermissionsContext.Provider>
    </ShellContext.Provider>
  );
}
