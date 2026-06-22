import { useCallback, useEffect, useMemo, useState } from "react";
import type { TeamPermission, TeamRolePublic } from "@teamflow/core";
import { TEAM_PERMISSION_GROUPS, TEAM_PERMISSION_LABELS } from "@teamflow/core";
import { client } from "../api";

type RolesSettingsSectionProps = {
  teamId: string;
  canManage: boolean;
  onMessage: (message: string | null) => void;
  onRolesChange?: () => void;
};

export function RolesSettingsSection({
  teamId,
  canManage,
  onMessage,
  onRolesChange,
}: RolesSettingsSectionProps) {
  const [roles, setRoles] = useState<TeamRolePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<TeamPermission[]>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const { roles: next } = await client.listTeamRoles(teamId);
      setRoles(next);
      setSelectedRoleId((current) => current ?? next[0]?.id ?? null);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [onMessage, teamId]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (!selectedRole) return;
    setDraftName(selectedRole.name);
    setDraftPermissions(selectedRole.permissions);
  }, [selectedRole]);

  function togglePermission(permission: TeamPermission) {
    if (!canManage) return;
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission],
    );
  }

  async function saveRole() {
    if (!selectedRole || !canManage) return;
    setSaving(true);
    onMessage(null);
    try {
      const { role } = await client.updateTeamRole(teamId, selectedRole.id, {
        name: draftName.trim(),
        permissions: draftPermissions,
      });
      setRoles((current) => current.map((item) => (item.id === role.id ? role : item)));
      onMessage(`Saved ${role.name}.`);
      onRolesChange?.();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    if (!canManage || !newRoleName.trim()) return;
    setCreating(true);
    onMessage(null);
    try {
      const { role } = await client.createTeamRole(teamId, {
        name: newRoleName.trim(),
        permissions: ["team.members.view"],
      });
      setRoles((current) => [...current, role].sort((a, b) => a.position - b.position));
      setSelectedRoleId(role.id);
      setNewRoleName("");
      onMessage(`Created ${role.name}.`);
      onRolesChange?.();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreating(false);
    }
  }

  async function deleteRole(role: TeamRolePublic) {
    if (!canManage || role.isSystem) return;
    if (
      !window.confirm(
        `Delete role "${role.name}"? This cannot be undone. Members must be moved first.`,
      )
    ) {
      return;
    }

    onMessage(null);
    try {
      await client.deleteTeamRole(teamId, role.id);
      const nextRoles = roles.filter((item) => item.id !== role.id);
      setRoles(nextRoles);
      setSelectedRoleId(nextRoles[0]?.id ?? null);
      onMessage(`Deleted ${role.name}.`);
      onRolesChange?.();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2>Roles & permissions</h2>
        <p className="settings-copy settings-lead">
          Each team member has one role. Roles define what they can do in Settings and integrations.
        </p>
      </header>

      {loading ? <p className="settings-hint">Loading roles…</p> : null}

      {!loading ? (
        <div className="roles-layout">
          <section className="settings-section roles-list-section">
            <h3>Roles</h3>
            <ul className="roles-list">
              {roles.map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    className={`roles-list-btn ${selectedRoleId === role.id ? "active" : ""}`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <span>{role.name}</span>
                    <span className="muted">
                      {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                      {role.isSystem ? " · system" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {canManage ? (
              <div className="roles-create-row">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="New role name"
                />
                <button
                  type="button"
                  disabled={creating || !newRoleName.trim()}
                  onClick={() => void createRole()}
                >
                  {creating ? "Creating…" : "Create role"}
                </button>
              </div>
            ) : null}
          </section>

          {selectedRole ? (
            <section className="settings-section roles-editor-section">
              <h3>{selectedRole.name}</h3>
              <p className="settings-copy">
                Slug: <code>{selectedRole.slug}</code>
                {selectedRole.isSystem ? " · built-in role" : " · custom role"}
              </p>

              <label>
                Display name
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={!canManage}
                />
              </label>

              {TEAM_PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="roles-permission-group">
                  <h4>{group.label}</h4>
                  <ul className="roles-permission-list">
                    {group.permissions.map((permission) => (
                      <li key={permission}>
                        <label className="settings-checkbox">
                          <input
                            type="checkbox"
                            checked={draftPermissions.includes(permission)}
                            disabled={!canManage}
                            onChange={() => togglePermission(permission)}
                          />
                          {TEAM_PERMISSION_LABELS[permission]}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {canManage ? (
                <div className="row settings-actions">
                  <button type="button" disabled={saving} onClick={() => void saveRole()}>
                    {saving ? "Saving…" : "Save role"}
                  </button>
                  {!selectedRole.isSystem ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => void deleteRole(selectedRole)}
                    >
                      Delete role
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="settings-hint">You can view roles but need manage permission to edit.</p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
