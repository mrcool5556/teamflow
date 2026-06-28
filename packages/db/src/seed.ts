import { DEFAULT_STATUSES, generateEntityKey } from "@teamflow/core";
import bcrypt from "bcryptjs";
import { createDb, schema } from "./index.js";

async function seed() {
  const db = createDb();

  const existing = await db.select().from(schema.workspaces).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded. Skipping.");
    return;
  }

  const workspaceId = crypto.randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: "Default Workspace",
    slug: "default",
  });

  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email: "demo@teamflow.local",
    name: "Demo User",
    passwordHash: await bcrypt.hash("changeme123", 10),
  });

  const teamId = crypto.randomUUID();
  await db.insert(schema.teams).values({
    id: teamId,
    workspaceId,
    name: "Engineering",
    key: "ENG",
    issueCounter: 3,
  });

  const ownerPermissions = JSON.stringify([
    "team.members.view",
    "team.members.manage",
    "team.invites.manage",
    "team.roles.view",
    "team.roles.manage",
    "team.delete",
    "team.data.transfer",
    "integrations.discord.view",
    "integrations.discord.manage",
    "integrations.discord.secrets",
    "server.maintenance.view",
    "server.maintenance.run",
  ]);
  const adminPermissions = JSON.stringify([
    "team.members.view",
    "team.members.manage",
    "team.invites.manage",
    "team.roles.view",
    "team.roles.manage",
    "team.delete",
    "integrations.discord.view",
    "integrations.discord.manage",
    "integrations.discord.secrets",
  ]);
  const memberPermissions = JSON.stringify(["team.members.view"]);
  const ownerRoleId = crypto.randomUUID();
  const adminRoleId = crypto.randomUUID();
  const memberRoleId = crypto.randomUUID();
  const viewerRoleId = crypto.randomUUID();

  await db.insert(schema.teamRoles).values([
    {
      id: ownerRoleId,
      teamId,
      name: "Owner",
      slug: "owner",
      permissions: ownerPermissions,
      isSystem: 1,
      position: 0,
    },
    {
      id: adminRoleId,
      teamId,
      name: "Admin",
      slug: "admin",
      permissions: adminPermissions,
      isSystem: 1,
      position: 1,
    },
    {
      id: memberRoleId,
      teamId,
      name: "Member",
      slug: "member",
      permissions: memberPermissions,
      isSystem: 1,
      position: 2,
    },
    {
      id: viewerRoleId,
      teamId,
      name: "Viewer",
      slug: "viewer",
      permissions: memberPermissions,
      isSystem: 1,
      position: 3,
    },
  ]);

  await db.insert(schema.teamMembers).values({
    teamId,
    userId,
    roleId: ownerRoleId,
    role: "owner",
  });

  const rowId = crypto.randomUUID();
  const rowKey = generateEntityKey("row");
  await db.insert(schema.boardRows).values({
    id: rowId,
    teamId,
    key: rowKey,
    name: "Row 1",
    position: 0,
  });

  const statusIds: Record<string, string> = {};
  for (const status of DEFAULT_STATUSES) {
    const id = crypto.randomUUID();
    statusIds[status.type] = id;
    await db.insert(schema.issueStatuses).values({
      id,
      teamId,
      rowId,
      key: generateEntityKey("col"),
      name: status.name,
      type: status.type,
      position: status.position,
    });
  }

  const projectId = crypto.randomUUID();
  await db.insert(schema.projects).values({
    id: projectId,
    teamId,
    name: "Platform",
    description: "Core platform work",
  });

  const demoIssues = [
    {
      number: 1,
      title: "Set up Teamflow monorepo",
      description: "Scaffold apps and packages.",
      statusType: "done",
      priority: "high",
    },
    {
      number: 2,
      title: "Build issue API and web UI",
      description: "CRUD for issues with kanban board.",
      statusType: "in_progress",
      priority: "high",
    },
    {
      number: 3,
      title: "Wire MCP and CLI for AI assistants",
      description: "Allow Cursor to create and complete issues.",
      statusType: "todo",
      priority: "medium",
    },
  ];

  for (const issue of demoIssues) {
    await db.insert(schema.issues).values({
      id: crypto.randomUUID(),
      teamId,
      projectId,
      rowId,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      statusId: statusIds[issue.statusType]!,
      priority: issue.priority,
      creatorId: userId,
      assigneeId: userId,
      completedAt: issue.statusType === "done" ? new Date().toISOString() : null,
    });
  }

  console.log("Seed complete.");
  console.log("Demo login: demo@teamflow.local / changeme123");
  console.log(`Team key: ENG`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
