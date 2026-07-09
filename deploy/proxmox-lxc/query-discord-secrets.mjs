import Database from "better-sqlite3";

const dbPath = process.env.TEAMFLOW_DB ?? "/opt/teamflow/data/teamflow.db";
const db = new Database(dbPath, { readonly: true });
const rows = db
  .prepare(
    "SELECT teamflow_url, public_url, length(pat_enc) AS pat_len, length(bot_token_enc) AS token_len, length(client_id) AS client_len FROM discord_bot_secrets",
  )
  .all();
console.log(rows.length === 0 ? "no rows in discord_bot_secrets" : JSON.stringify(rows, null, 2));
