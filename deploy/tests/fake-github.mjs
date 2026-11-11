#!/usr/bin/env node
/**
 * A tiny stand-in for GitHub releases, for the install and update tests.
 *
 *   node deploy/tests/fake-github.mjs <root> [port]
 *
 * Serves <root>/download/v<version>/<file> at /download/v<version>/<file>,
 * <root>/api/latest at /repos/mrcool5556/teamflow/releases/latest and
 * <root>/api/releases at /repos/mrcool5556/teamflow/releases.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 8099);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let file = null;
    if (url.pathname === "/repos/mrcool5556/teamflow/releases/latest") file = path.join(root, "api", "latest");
    else if (url.pathname === "/repos/mrcool5556/teamflow/releases") file = path.join(root, "api", "releases");
    else if (url.pathname.startsWith("/download/")) file = path.join(root, ...url.pathname.split("/").filter(Boolean));
    if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": file.includes(`${path.sep}api${path.sep}`) ? "application/json" : "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "127.0.0.1", () => console.log(`fake GitHub on http://127.0.0.1:${port} serving ${root}`));
