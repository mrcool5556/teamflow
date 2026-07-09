import sqlite3

db = sqlite3.connect("/opt/teamflow/data/teamflow.db")
cur = db.cursor()

cur.execute(
    "SELECT teamflow_url, public_url, length(pat_enc), length(bot_token_enc), length(client_id) "
    "FROM discord_bot_secrets"
)
rows = cur.fetchall()
if not rows:
    print("no rows in discord_bot_secrets")
else:
    for row in rows:
        print(row)

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'discord%'")
print("discord tables:", [r[0] for r in cur.fetchall()])

for table in ("discord_guild_links", "discord_team_settings"):
    try:
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"{table} count:", cur.fetchone()[0])
    except sqlite3.OperationalError as exc:
        print(f"{table}: {exc}")
