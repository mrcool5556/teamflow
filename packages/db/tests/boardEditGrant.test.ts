import { describe, expect, it, vi } from "vitest";
import { createDb } from "../src/index.js";
import { applySchemaPatches } from "../src/patches.js";

describe("board.edit upgrade grant", () => {
  it("gives every existing role except Viewer the new permission, once", () => {
    const sqlite = createDb(":memory:").$client;
    sqlite.exec(`
      INSERT INTO workspaces (id, name, slug) VALUES ('w1', 'W', 'w1');
      INSERT INTO teams (id, workspace_id, name, key, issue_counter) VALUES ('t1', 'w1', 'T', 'T', 0);
      INSERT INTO team_roles (id, team_id, name, slug, permissions, is_system, position) VALUES
        ('r-owner', 't1', 'Owner', 'owner', '["team.members.view"]', 1, 0),
        ('r-member', 't1', 'Member', 'member', '["team.members.view"]', 1, 2),
        ('r-viewer', 't1', 'Viewer', 'viewer', '["team.members.view"]', 1, 3),
        ('r-custom', 't1', 'Triage', 'triage', '[]', 0, 4),
        ('r-custom-ro', 't1', 'Readers', 'readers', '["team.members.view"]', 0, 5);
      INSERT INTO board_rows (id, team_id, key, name, position) VALUES ('row1', 't1', 'row_a', 'R', 0);
      INSERT INTO issue_statuses (id, team_id, row_id, key, name, type, position)
        VALUES ('s1', 't1', 'row1', 'col_a', 'Todo', 'todo', 0);
    `);
    const permissionsOf = (id: string) =>
      JSON.parse(
        (
          sqlite.prepare("SELECT permissions FROM team_roles WHERE id = ?").get(id) as {
            permissions: string;
          }
        ).permissions,
      ) as string[];

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      sqlite.prepare("UPDATE schema_version SET version = 2").run();
      applySchemaPatches(sqlite);
      expect(permissionsOf("r-owner")).toContain("board.edit");
      expect(permissionsOf("r-member")).toContain("board.edit");
      expect(permissionsOf("r-custom")).toEqual(["board.edit"]);
      expect(permissionsOf("r-custom-ro")).toContain("board.edit");
      expect(permissionsOf("r-viewer")).not.toContain("board.edit");

      // An admin removes it from a custom role; a later patch run must not grant it again.
      sqlite.prepare("UPDATE team_roles SET permissions = '[]' WHERE id = 'r-custom'").run();
      sqlite.prepare("UPDATE schema_version SET version = 3").run();
      applySchemaPatches(sqlite);
      expect(permissionsOf("r-custom")).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });
});
