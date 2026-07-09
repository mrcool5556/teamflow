import sqlite3

db = sqlite3.connect("/opt/teamflow/data/teamflow.db")
cur = db.cursor()
cur.execute(
    "SELECT team_id, guild_id, length(allowed_role_ids), allow_discord_administrators, "
    "length(ticket_channel_ids) FROM team_discord_settings"
)
rows = cur.fetchall()
print("team_discord_settings rows:", len(rows))
for row in rows:
    print(row)
