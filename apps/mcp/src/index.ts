#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TeamflowClient } from "@teamflow/api-client";

import type { IssuePublic } from "@teamflow/core";

import { z } from "zod";



const baseUrl = process.env.TEAMFLOW_URL ?? "http://localhost:3000";

const token = process.env.TEAMFLOW_TOKEN;



if (!token) {

  console.error("TEAMFLOW_TOKEN is required");

  process.exit(1);

}



const client = new TeamflowClient({ baseUrl, token });



function json(data: unknown) {

  return {

    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],

  };

}



async function resolveRowId(teamId: string, rowId?: string, rowName?: string) {

  if (rowId) return rowId;

  if (!rowName) return undefined;

  const { rows } = await client.listRows(teamId);

  const match = rows.find(

    (row) => row.name.toLowerCase() === rowName.toLowerCase(),

  );

  return match?.id;

}



async function resolveAssigneeId(

  teamId: string,

  assigneeId?: string,

  assigneeEmail?: string,

) {

  if (assigneeId) return assigneeId;

  if (!assigneeEmail) return undefined;

  const { members } = await client.listTeamMembers(teamId);

  const match = members.find(

    (member) => member.email.toLowerCase() === assigneeEmail.toLowerCase(),

  );

  return match?.userId;

}



function compactIssue(issue: IssuePublic) {

  return {

    id: issue.id,

    identifier: issue.identifier,

    title: issue.title,

    statusName: issue.statusName,

    statusId: issue.statusId,

    rowId: issue.rowId,

    priority: issue.priority,

    assigneeId: issue.assigneeId,

    assigneeName: issue.assigneeName,

    descriptionPreview: issue.description?.slice(0, 280) ?? null,

    updatedAt: issue.updatedAt,

  };

}



const server = new McpServer({

  name: "teamflow",

  version: "0.2.0",

});



server.tool(

  "list_teams",

  "List teams the authenticated user can access",

  {},

  async () => json(await client.listTeams()),

);



server.tool(

  "list_projects",

  "List projects, optionally filtered by teamId",

  { teamId: z.string().uuid().optional() },

  async ({ teamId }) => json(await client.listProjects(teamId)),

);



server.tool(

  "list_rows",

  "List board rows (swimlanes) for a team",

  { teamId: z.string().uuid() },

  async ({ teamId }) => json(await client.listRows(teamId)),

);



server.tool(

  "list_statuses",

  "List workflow columns (statuses) for a team or a specific row",

  {
    teamId: z.string().uuid(),
    rowId: z.string().uuid().optional(),
  },

  async ({ teamId, rowId }) => {
    if (rowId) return json(await client.listRowStatuses(rowId));
    return json(await client.listStatuses(teamId));
  },

);



server.tool(

  "list_team_members",

  "List users on a team (for assignment)",

  { teamId: z.string().uuid() },

  async ({ teamId }) => json(await client.listTeamMembers(teamId)),

);



server.tool(

  "list_issues",

  "List issues with optional filters (team, project, status, assignee, row, search)",

  {

    teamId: z.string().uuid().optional(),

    projectId: z.string().uuid().optional(),

    statusId: z.string().uuid().optional(),

    assigneeId: z.string().uuid().optional(),

    assigneeEmail: z.string().email().optional(),

    rowId: z.string().uuid().optional(),

    rowName: z.string().optional(),

    search: z.string().optional(),

    compact: z.boolean().optional(),

  },

  async (filters) => {

    const teamId = filters.teamId;

    const rowId =

      teamId && (filters.rowId || filters.rowName)

        ? await resolveRowId(teamId, filters.rowId, filters.rowName)

        : filters.rowId;

    const assigneeId = teamId

      ? await resolveAssigneeId(

          teamId,

          filters.assigneeId,

          filters.assigneeEmail,

        )

      : filters.assigneeId;



    const { issues } = await client.listIssues({

      teamId: filters.teamId,

      projectId: filters.projectId,

      statusId: filters.statusId,

      assigneeId,

      rowId,

      search: filters.search,

    });



    if (filters.compact === false) {

      return json({ issues });

    }

    return json({ issues: issues.map(compactIssue) });

  },

);



server.tool(

  "get_my_work",

  "List issues assigned to the authenticated user",

  {

    teamId: z.string().uuid(),

    rowId: z.string().uuid().optional(),

    rowName: z.string().optional(),

    includeRowOwned: z

      .boolean()

      .optional()

      .describe("Also include issues in rows assigned to you"),

  },

  async ({ teamId, rowId, rowName, includeRowOwned }) => {

    const { user } = await client.me();

    const resolvedRowId = await resolveRowId(teamId, rowId, rowName);

    const [{ issues: assigned }, { rows }, { issues: allIssues }] =

      await Promise.all([

        client.listIssues({ teamId, assigneeId: user.id, rowId: resolvedRowId }),

        client.listRows(teamId),

        includeRowOwned

          ? client.listIssues({ teamId, rowId: resolvedRowId })

          : Promise.resolve({ issues: [] as IssuePublic[] }),

      ]);



    const ownedRowIds = new Set(

      rows.filter((row) => row.assigneeId === user.id).map((row) => row.id),

    );



    const rowOwned = includeRowOwned

      ? allIssues.filter((issue) => issue.rowId && ownedRowIds.has(issue.rowId))

      : [];



    const byId = new Map<string, IssuePublic>();

    for (const issue of [...assigned, ...rowOwned]) {

      byId.set(issue.id, issue);

    }



    return json({

      user: { id: user.id, name: user.name, email: user.email },

      issues: [...byId.values()].map(compactIssue),

    });

  },

);



server.tool(

  "get_board_summary",

  "Compact board overview: rows, columns, counts — for AI orientation without loading every card",

  { teamId: z.string().uuid() },

  async ({ teamId }) => {

    const [{ rows }, { statuses }, { issues }] = await Promise.all([

      client.listRows(teamId),

      client.listStatuses(teamId),

      client.listIssues({ teamId }),

    ]);



    const defaultRowId = rows[0]?.id ?? null;



    const summary = rows.map((row) => {

      const rowIssues = issues.filter(

        (issue) => (issue.rowId ?? defaultRowId) === row.id,

      );

      const rowStatuses = statuses.filter((status) => status.rowId === row.id);

      const byStatus = Object.fromEntries(

        rowStatuses.map((status) => [

          status.name,

          rowIssues.filter((issue) => issue.statusId === status.id).length,

        ]),

      );

      return {

        rowId: row.id,

        name: row.name,

        assigneeName: row.assigneeName,

        color: row.color,

        total: rowIssues.length,

        byStatus,

        columns: rowStatuses.map((status) => ({
          id: status.id,
          name: status.name,
          type: status.type,
          position: status.position,
        })),

        open: rowIssues.filter((issue) => issue.statusName !== "Done").length,

      };

    });



    return json({

      teamId,

      rows: summary,

      statuses: statuses.map((status) => ({

        id: status.id,

        rowId: status.rowId,

        name: status.name,

        type: status.type,

      })),

      totalIssues: issues.length,

    });

  },

);



server.tool(

  "get_issue",

  "Get a single issue with full description and comments",

  { issueId: z.string().uuid() },

  async ({ issueId }) => json(await client.getIssue(issueId)),

);



server.tool(

  "create_issue",

  "Create a new issue (use description for source doc path + excerpt)",

  {

    teamId: z.string().uuid(),

    title: z.string().min(1),

    description: z.string().optional(),

    projectId: z.string().uuid().optional(),

    statusId: z.string().uuid().optional(),

    rowId: z.string().uuid().optional(),

    rowName: z.string().optional(),

    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),

    assigneeId: z.string().uuid().optional(),

    assigneeEmail: z.string().email().optional(),

  },

  async (input) => {

    const rowId = await resolveRowId(input.teamId, input.rowId, input.rowName);

    const assigneeId = await resolveAssigneeId(

      input.teamId,

      input.assigneeId,

      input.assigneeEmail,

    );

    const { issue } = await client.createIssue({

      teamId: input.teamId,

      title: input.title,

      description: input.description,

      projectId: input.projectId,

      statusId: input.statusId,

      rowId,

      priority: input.priority ?? "none",

      assigneeId,

    });

    return json({ issue });

  },

);



server.tool(

  "update_issue",

  "Update issue fields",

  {

    issueId: z.string().uuid(),

    title: z.string().optional(),

    description: z.string().optional(),

    statusId: z.string().uuid().optional(),

    rowId: z.string().uuid().nullable().optional(),

    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),

    assigneeId: z.string().uuid().nullable().optional(),

  },

  async ({ issueId, ...updates }) => {

    const { issue } = await client.updateIssue(issueId, updates);

    return json({ issue });

  },

);



server.tool(

  "complete_issue",

  "Mark an issue as Done",

  { issueId: z.string().uuid() },

  async ({ issueId }) => json(await client.completeIssue(issueId)),

);



server.tool(

  "add_comment",

  "Add a comment to an issue (progress notes, doc sync status)",

  {

    issueId: z.string().uuid(),

    body: z.string().min(1),

  },

  async ({ issueId, body }) => json(await client.addComment(issueId, { body })),

);



const transport = new StdioServerTransport();

await server.connect(transport);


