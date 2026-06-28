import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamInvitePublic, TeamMemberPublic, TeamPermissionsPublic, TeamRolePublic } from "@teamflow/core";
import { client } from "../api";
import { useTeamRoles } from "../hooks/useTeamRoles";
import { buildInviteShareUrl, extractInviteToken } from "../lib/inviteLinks";
import { hasTeamPermission } from "../lib/teamPermissions";
import { TeamDataTransferSection } from "./TeamDataTransferSection";

type TeamSettingsSectionProps = {
  teamId: string;
  teamName: string;
  teamKey: string;
  members: TeamMemberPublic[];
  currentUserId: string | null;
  permissions: TeamPermissionsPublic | null;
  onMembersChange: (members: TeamMemberPublic[]) => void;
  onMessage: (message: string | null) => void;
  onTeamJoined?: (teamId: string) => void;
  onTeamLeft?: (teamId: string) => void;
  onTeamDeleted?: (teamId: string) => void;
  onBoardChanged?: () => void;
};

export function TeamSettingsSection({
  teamId,
  teamName,
  teamKey,
  members,
  currentUserId,
  permissions,
  onMembersChange,
  onMessage,
  onTeamJoined,
  onTeamLeft,
  onTeamDeleted,
  onBoardChanged,
}: TeamSettingsSectionProps) {
  const [invites, setInvites] = useState<TeamInvitePublic[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
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
  const { roles } = useTeamRoles(canManageMembers || canManageInvites ? teamId : null);

  useEffect(() => {
    if (!inviteRoleId && roles.length > 0) {
      const memberRole = roles.find((role) => role.slug === "member") ?? roles[0];
      if (memberRole) setInviteRoleId(memberRole.id);
    }
  }, [inviteRoleId, roles]);

  const loadInvites = useCallback(async () => {
    if (!canManageInvites) {
      setInvites([]);
      return;
    }
    setInvitesLoading(true);
    try {
      const { invites: next } = await client.listTeamInvites(teamId);
      setInvites(next);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setInvitesLoading(false);
    }
  }, [canManageInvites, onMessage, teamId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

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
      onMessage(err instanceof Error ? err.message : "Failed to create invite");
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
      onMessage("Could not copy — select and copy the link manually.");
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
      onMessage(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  }

  async function changeMemberRole(member: TeamMemberPublic, roleId: string) {
    if (roleId === member.roleId) return;
    setUpdatingMemberRoleId(member.id);
    onMessage(null);
    try {
      await client.updateTeamMemberRole(teamId, member.id, roleId);
      const { members: refreshed } = await client.listTeamMembers(teamId);
      onMembersChange(refreshed);
      onMessage(`Updated role for ${member.name}.`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to update member role");
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
      const { members: refreshed } = await client.listTeamMembers(teamId);
      onMembersChange(refreshed);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to remove member");
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
      onMessage(err instanceof Error ? err.message : "Failed to leave team");
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
      onMessage(err instanceof Error ? err.message : "Failed to delete team");
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
      const { members: refreshed } = await client.listTeamMembers(team.id);
      onMembersChange(refreshed);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to join team");
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
            Your role is <strong>{permissions.roleName}</strong>. Edit roles under Settings →
            Roles, then assign them to members below.
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
            Permanently remove <strong>{teamKey} — {teamName}</strong> and all board data. Members
            lose access immediately.
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
        <button type="button" disabled={joining || !joinToken.trim()} onClick={() => void joinWithToken()}>
          {joining ? "Joining…" : "Join team"}
        </button>
      </section>
    </>
  );
}
