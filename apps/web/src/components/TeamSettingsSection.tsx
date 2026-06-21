import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamInvitePublic, TeamMemberPublic } from "@teamflow/core";
import { client } from "../api";
import { buildInviteShareUrl, extractInviteToken } from "../lib/inviteLinks";

type TeamSettingsSectionProps = {
  teamId: string;
  teamName: string;
  teamKey: string;
  members: TeamMemberPublic[];
  currentUserId: string | null;
  onMembersChange: (members: TeamMemberPublic[]) => void;
  onMessage: (message: string | null) => void;
  onTeamJoined?: (teamId: string) => void;
  onTeamLeft?: (teamId: string) => void;
  onTeamDeleted?: (teamId: string) => void;
};

export function TeamSettingsSection({
  teamId,
  teamName,
  teamKey,
  members,
  currentUserId,
  onMembersChange,
  onMessage,
  onTeamJoined,
  onTeamLeft,
  onTeamDeleted,
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
  const copyTimeoutRef = useRef<number | null>(null);

  const currentMember = members.find((member) => member.userId === currentUserId);
  const isAdmin = currentMember?.role === "admin";

  const loadInvites = useCallback(async () => {
    if (!isAdmin) {
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
  }, [isAdmin, onMessage, teamId]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function createInviteLink() {
    setCreatingInvite(true);
    onMessage(null);
    try {
      const { invite } = await client.createTeamInvite(teamId, {
        role: "member",
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
                <span className="team-member-role">{member.role}</span>
                {isAdmin && member.userId !== currentUserId ? (
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

      {isAdmin ? (
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
                      {invite.maxUses === 1 ? "single-use" : "multi-use"} · expires{" "}
                      {new Date(invite.expiresAt).toLocaleDateString()}
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

      {isAdmin ? (
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
