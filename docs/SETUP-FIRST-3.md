# Quick setup — steps 1–3 (done)

## Step 1 — Dev servers

```powershell
cd D:\projects\teamflow
pnpm dev
```

- **Web UI:** http://localhost:5173  
- **API:** http://localhost:3000  

**Login:** `demo@teamflow.local` / `changeme123`

## Step 2 — MCP in Cursor

Configured in `C:\Users\mrcoo\.cursor\mcp.json` under `teamflow`.

PAT stored locally (gitignored): `data/mcp-pat.txt`

**After changing MCP config:** restart Cursor or reload MCP servers (Settings → MCP).

## Step 3 — Test in Cursor chat

Try:

- "Use teamflow to list my issues"
- "Create a Teamflow issue: Test from Cursor, high priority"
- "Mark ENG-4 complete" (or any open issue)

Verification issue **ENG-4** was created and completed via the PAT during setup.
