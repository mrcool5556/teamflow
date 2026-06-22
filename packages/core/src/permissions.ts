/** Built-in role slugs seeded for every team. Custom roles use their own slug. */
export type SystemRoleSlug = "admin" | "member" | "viewer";

/** Granular team permissions stored on each role. */
export const TEAM_PERMISSIONS = [
  "team.members.view",
  "team.members.manage",
  "team.invites.manage",
  "team.roles.view",
  "team.roles.manage",
  "team.delete",
  "integrations.discord.view",
  "integrations.discord.manage",
  /** Future: store bot token / PAT in Settings instead of .env */
  "integrations.discord.secrets",
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const TEAM_PERMISSION_LABELS: Record<TeamPermission, string> = {
  "team.members.view": "View team members",
  "team.members.manage": "Manage members & assign roles",
  "team.invites.manage": "Create and revoke invites",
  "team.roles.view": "View roles & permissions",
  "team.roles.manage": "Create and edit roles",
  "team.delete": "Delete the team",
  "integrations.discord.view": "View Discord integration",
  "integrations.discord.manage": "Edit Discord integration",
  "integrations.discord.secrets": "Manage Discord bot secrets",
};

export const TEAM_PERMISSION_GROUPS: {
  label: string;
  permissions: TeamPermission[];
}[] = [
  {
    label: "Team",
    permissions: [
      "team.members.view",
      "team.members.manage",
      "team.invites.manage",
      "team.roles.view",
      "team.roles.manage",
      "team.delete",
    ],
  },
  {
    label: "Integrations",
    permissions: [
      "integrations.discord.view",
      "integrations.discord.manage",
      "integrations.discord.secrets",
    ],
  },
];

export type TeamPermissionsPublic = {
  roleId: string;
  roleName: string;
  roleSlug: string;
  permissions: TeamPermission[];
};

export type TeamRolePublic = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  permissions: TeamPermission[];
  isSystem: boolean;
  position: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SYSTEM_ROLE_TEMPLATES: {
  slug: SystemRoleSlug;
  name: string;
  isSystem: true;
  position: number;
  permissions: TeamPermission[];
}[] = [
  {
    slug: "admin",
    name: "Admin",
    isSystem: true,
    position: 0,
    permissions: [...TEAM_PERMISSIONS],
  },
  {
    slug: "member",
    name: "Member",
    isSystem: true,
    position: 1,
    permissions: ["team.members.view"],
  },
  {
    slug: "viewer",
    name: "Viewer",
    isSystem: true,
    position: 2,
    permissions: ["team.members.view"],
  },
];

export function isTeamPermission(value: string): value is TeamPermission {
  return (TEAM_PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForSystemSlug(slug: SystemRoleSlug): TeamPermission[] {
  const template = DEFAULT_SYSTEM_ROLE_TEMPLATES.find((role) => role.slug === slug);
  return template ? [...template.permissions] : [];
}
