import sqlite3

db = sqlite3.connect("/opt/teamflow/data/teamflow.db")
cur = db.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%discord%'")
print("tables:", [r[0] for r in cur.fetchall()])
