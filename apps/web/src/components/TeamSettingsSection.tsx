import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  TeamInvitePublic,
  TeamMemberPublic,
  TeamPermissionsPublic,
  TeamRolePublic,
} from "@teamflow/core";
import { client } from "../api";
import { queryKeys } from "../queries/keys";
import { useInvitesQuery } from "../queries/members";
import { useTeamRolesQuery } from "../queries/roles";
import { buildInviteShareUrl, extractInviteToken } from "../lib/inviteLinks";
import { hasTeamPermission } from "../lib/teamPermissions";
import { TeamDataTransferSection } from "./TeamDataTransferSection";
import { errorMessage } from "../lib/errorSink";
import type { PanelMessage } from "../lib/panelStatus";

type TeamSettingsSectionProps = {
  teamId: string;
  teamName: string;
  teamKey: string;
  members: TeamMemberPublic[];
  currentUserId: string | null;
  permissions: TeamPermissionsPublic | null;
  onMessage: PanelMessage;
  onTeamJoined?: (teamId: string) => void;
  onTeamLeft?: (teamId: string) => void;
  onTeamDeleted?: (teamId: string) => void;
  onBoardChanged?: () => void;
};

const NO_ROLES: TeamRolePublic[] = [];
const NO_INVITES: TeamInvitePublic[] = [];

export function TeamSettingsSection({
  teamId,
  teamName,
  teamKey,
  members,
  currentUserId,
  permissions,
  onMessage,
  onTeamJoined,
  onTeamLeft,
  onTeamDeleted,
  onBoardChanged,
}: TeamSettingsSectionProps) {
  const queryClient = useQueryClient();
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [multiUseInvite, setMultiUseInvite] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [leavingTeam, setLeavingTeam] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [updatingMemberRoleId, setUpdatingMemberRoleId] = useState<string | null>(null);
  const [inviteRoleId, setInviteRoleId] = useState("");
  const copyTimeoutRef = useRef<number | null>(null);

  const canManageMembers = hasTeamPermission(permissions, "team.members.manage");
  const canManageInvites = hasTeamPermission(permissions, "team.invites.manage");
  const canDeleteTeam = hasTeamPermission(permissions, "team.delete");
  const canTransferData = hasTeamPermission(permissions, "team.data.transfer");
  const rolesQuery = useTeamRolesQuery(canManageMembers || canManageInvites ? teamId : null);
  const roles = rolesQuery.data ?? NO_ROLES;
  const invitesQuery = useInvitesQuery(teamId, canManageInvites);
  const invites = canManageInvites ? (invitesQuery.data ?? NO_INVITES) : NO_INVITES;
  const invitesLoading = invitesQuery.isFetching;

  useEffect(() => {
    if (!inviteRoleId && roles.length > 0) {
      const memberRole = roles.find((role) => role.slug === "member") ?? roles[0];
      if (memberRole) setInviteRoleId(memberRole.id);
    }
  }, [inviteRoleId, roles]);

  useEffect(() => {
    if (invitesQuery.error) {
      onMessage(errorMessage(invitesQuery.error, "Failed to load invites"), "error");
    }
  }, [invitesQuery.error, onMessage]);

  const loadInvites = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.invites(teamId) }),
    [queryClient, teamId],
  );

  /** Membership changed: refresh the member list and (for own role changes) permissions. */
  const refreshMembers = useCallback(
    (forTeamId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(forTeamId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.permissions(forTeamId) }),
      ]),
    [queryClient],
  );

  async function createInviteLink() {
    setCreatingInvite(true);
    onMessage(null);
    try {
      const { invite } = await client.createTeamInvite(teamId, {
        roleId: inviteRoleId || undefined,
        maxUses: multiUseInvite ? null : 1,
      });
      const url = buildInviteShareUrl(invite.token);
      setLatestInviteUrl(url);
      onMessage(`Invite link created for ${teamName}.`);
      await loadInvites();
    } catch (err) {
      onMessage(errorMessage(err, "Failed to create invite"), "error");
    } finally {
      setCreatingInvite(false);
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function copyInviteUrl(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      setCopiedKey(key);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      onMessage("Could not copy — select and copy the link manually.", "error");
    }
  }

  async function revokeInvite(inviteId: string) {
    onMessage(null);
    try {
      await client.revokeTeamInvite(teamId, inviteId);
      onMessage("Invite revoked.");
      if (latestInviteUrl) setLatestInviteUrl(null);
      await loadInvites();
    } catch (err) {
      onMessage(errorMessage(err, "Failed to revoke invite"), "error");
    }
  }

  async function changeMemberRole(member: TeamMemberPublic, roleId: string) {
    if (roleId === member.roleId) return;
    setUpdatingMemberRoleId(member.id);
    onMessage(null);
    try {
      await client.updateTeamMemberRole(teamId, member.id, roleId);
      await refreshMembers(teamId);
      onMessage(`Updated role for ${member.name}.`);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to update member role"), "error");
    } finally {
      setUpdatingMemberRoleId(null);
    }
  }

  async function removeMember(member: TeamMemberPublic) {
    if (
      !window.confirm(
        `Remove ${member.name} from ${teamName}? They will lose access until re-invited.`,
      )
    ) {
      return;
    }
    setRemovingMemberId(member.id);
    onMessage(null);
    try {
      await client.removeTeamMember(teamId, member.id);
      onMessage(`${member.name} removed from the team.`);
      await refreshMembers(teamId);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to remove member"), "error");
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function leaveCurrentTeam() {
    if (
      !window.confirm(
        `Leave ${teamName}? You can rejoin later with an invite link. Your personal board is not deleted.`,
      )
    ) {
      return;
    }
    setLeavingTeam(true);
    onMessage(null);
    try {
      await client.leaveTeam(teamId);
      onMessage(`You left ${teamName}.`);
      onTeamLeft?.(teamId);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to leave team"), "error");
    } finally {
      setLeavingTeam(false);
    }
  }

  async function deleteCurrentTeam() {
    const label = `${teamKey} — ${teamName}`;
    if (
      !window.confirm(
        `Delete team "${label}"?\n\nAll rows, columns, and issues for this team will be removed.`,
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `This cannot be undone.\n\nPermanently delete "${label}" and all of its board data?`,
      )
    ) {
      return;
    }

    setDeletingTeam(true);
    onMessage(null);
    try {
      await client.deleteTeam(teamId);
      onMessage(`Deleted ${label}.`);
      onTeamDeleted?.(teamId);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to delete team"), "error");
    } finally {
      setDeletingTeam(false);
    }
  }

  async function joinWithToken() {
    const token = extractInviteToken(joinToken);
    if (!token) return;
    setJoining(true);
    onMessage(null);
    try {
      const { team, alreadyMember } = await client.acceptInvite(token);
      onMessage(
        alreadyMember
          ? `You are already on ${team.name}.`
          : `Joined ${team.key} — ${team.name}. Switch teams from the header.`,
      );
      setJoinToken("");
      onTeamJoined?.(team.id);
      await refreshMembers(team.id);
    } catch (err) {
      onMessage(errorMessage(err, "Failed to join team"), "error");
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      {permissions ? (
        <section className="settings-section team-access-summary">
          <h3>Your access</h3>
          <p className="settings-copy">
            Your role is <strong>{permissions.roleName}</strong>. Edit roles under Settings → Roles,
            then assign them to members below.
          </p>
          <ul className="team-access-list">
            {permissions.permissions.includes("team.members.manage") ? (
              <li>Manage members and assign roles</li>
            ) : null}
            {permissions.permissions.includes("team.invites.manage") ? (
              <li>Create and revoke invite links</li>
            ) : null}
            {permissions.permissions.includes("team.roles.manage") ? (
              <li>Create and edit roles & permissions</li>
            ) : null}
            {permissions.permissions.includes("integrations.discord.manage") ? (
              <li>Manage Discord integration settings</li>
            ) : null}
            {permissions.permissions.includes("server.maintenance.view") ? (
              <li>View backups and update status</li>
            ) : null}
            {permissions.permissions.includes("server.maintenance.run") ? (
              <li>Run backups and install updates</li>
            ) : null}
            {permissions.permissions.includes("team.data.transfer") ? (
              <li>Export and import team board bundles</li>
            ) : null}
            {permissions.permissions.length === 1 &&
            permissions.permissions[0] === "team.members.view" ? (
              <li>View team members only</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="settings-section">
        <h3>Team members</h3>
        <p className="settings-copy">
          People who can view and edit <strong>{teamName}</strong>.
        </p>
        <ul className="team-member-list">
          {members.map((member) => (
            <li key={member.id} className="team-member-item">
              <div>
                <strong>{member.name}</strong>
                <span className="muted team-member-email">{member.email}</span>
              </div>
              <div className="team-member-meta">
                {canManageMembers ? (
                  <select
                    className="team-member-role-select"
                    value={member.roleId}
                    disabled={updatingMemberRoleId === member.id}
                    onChange={(e) => void changeMemberRole(member, e.target.value)}
                  >
                    {roles.map((role: TeamRolePublic) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="team-member-role">{member.roleName}</span>
                )}
                {canManageMembers && member.userId !== currentUserId ? (
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={removingMemberId === member.id}
                    onClick={() => void removeMember(member)}
                  >
                    {removingMemberId === member.id ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <div className="team-leave-row">
          <button
            type="button"
            className="ghost danger"
            disabled={leavingTeam}
            onClick={() => void leaveCurrentTeam()}
          >
            {leavingTeam ? "Leaving…" : `Leave ${teamName}`}
          </button>
        </div>
      </section>

      {canManageInvites ? (
        <section className="settings-section">
          <h3>Invite link</h3>
          <p className="settings-copy">
            Share a link so someone can join this team. Links expire after 30 days. New links are
            single-use by default.
          </p>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={multiUseInvite}
              onChange={(e) => setMultiUseInvite(e.target.checked)}
            />
            Allow multiple people to use the same link
          </label>
          <label>
            Role for new members
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
              disabled={roles.length === 0}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row settings-actions">
            <button type="button" disabled={creatingInvite} onClick={() => void createInviteLink()}>
              {creatingInvite ? "Creating…" : "Create invite link"}
            </button>
          </div>
          {latestInviteUrl ? (
            <div className="invite-link-box">
              <code>{latestInviteUrl}</code>
              <button
                type="button"
                className={`ghost copy-feedback-btn ${copiedKey === "latest" ? "copied" : ""}`}
                onClick={() => void copyInviteUrl(latestInviteUrl, "latest")}
              >
                {copiedKey === "latest" ? "Copied!" : "Copy link"}
              </button>
            </div>
          ) : null}
          {invitesLoading ? <p className="settings-hint">Loading invites…</p> : null}
          {!invitesLoading && invites.length > 0 ? (
            <ul className="team-invite-list">
              {invites.map((invite) => (
                <li key={invite.id} className="team-invite-item">
                  <div>
                    <code>{invite.token.slice(0, 10)}…</code>
                    <span className="muted">
                      {invite.roleName} · {invite.maxUses === 1 ? "single-use" : "multi-use"} ·
                      expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="row settings-actions">
                    <button
                      type="button"
                      className={`ghost copy-feedback-btn ${copiedKey === invite.id ? "copied" : ""}`}
                      onClick={() =>
                        void copyInviteUrl(buildInviteShareUrl(invite.token), invite.id)
                      }
                    >
                      {copiedKey === invite.id ? "Copied!" : "Copy"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void revokeInvite(invite.id)}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {canTransferData ? (
        <TeamDataTransferSection
          teamId={teamId}
          teamName={teamName}
          teamKey={teamKey}
          onMessage={onMessage}
          onImported={onBoardChanged}
        />
      ) : null}

      {canDeleteTeam ? (
        <section className="settings-section settings-danger-zone">
          <h3>Delete team</h3>
          <p className="settings-copy">
            Permanently remove{" "}
            <strong>
              {teamKey} — {teamName}
            </strong>{" "}
            and all board data. Members lose access immediately.
          </p>
          <button
            type="button"
            className="danger"
            disabled={deletingTeam}
            onClick={() => void deleteCurrentTeam()}
          >
            {deletingTeam ? "Deleting…" : `Delete ${teamName}`}
          </button>
        </section>
      ) : null}

      <section className="settings-section">
        <h3>Join a team</h3>
        <p className="settings-copy">
          Paste an invite link or token from a teammate. You keep your personal board — this adds
          another team to your account.
        </p>
        <label>
          Invite link or token
          <input
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
            placeholder="https://…/?invite=… or token"
          />
        </label>
        <button
          type="button"
          disabled={joining || !joinToken.trim()}
          onClick={() => void joinWithToken()}
        >
          {joining ? "Joining…" : "Join team"}
        </button>
      </section>
    </>
  );
}
