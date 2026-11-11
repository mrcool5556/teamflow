#!/usr/bin/env node
/**
 * Test-only stand-in for github.com and api.github.com over HTTPS, so the installer, update.sh
 * and the server's release check run with their real default URLs (no overrides). Used by
 * linux-systemd-test.sh, which points both host names at this server in the test container's
 * /etc/hosts and trusts the test CA there. Never used by an install.
 *
 *   node deploy/tests/fake-github-tls.mjs <root> <cert.pem> <key.pem> [port]
 *
 * <root>/api/latest      -> /repos/mrcool5556/teamflow/releases/latest
 * <root>/api/releases    -> /repos/mrcool5556/teamflow/releases
 * <root>/download/vX/F   -> /mrcool5556/teamflow/releases/download/vX/F
 *                           /mrcool5556/teamflow/releases/latest/download/F (vX from api/latest)
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const [rootArg, certFile, keyFile, portArg] = process.argv.slice(2);
const root = path.resolve(rootArg ?? ".");
const port = Number(portArg ?? 443);
const repo = "/mrcool5556/teamflow";

function latestTag() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "api", "latest"), "utf8")).tag_name;
  } catch {
    return null;
  }
}

https
  .createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, (req, res) => {
    const url = new URL(req.url ?? "/", "https://x");
    const p = url.pathname;
    let file = null;
    if (p === `/repos${repo}/releases/latest`) file = path.join(root, "api", "latest");
    else if (p === `/repos${repo}/releases`) file = path.join(root, "api", "releases");
    else if (p.startsWith(`${repo}/releases/download/`)) {
      file = path.join(root, "download", ...p.slice(`${repo}/releases/download/`.length).split("/").filter(Boolean));
    } else if (p.startsWith(`${repo}/releases/latest/download/`)) {
      const tag = latestTag();
      if (tag) file = path.join(root, "download", tag, path.basename(p));
    }
    console.log(`${req.headers.host} ${p} -> ${file ?? "404"}`);
    if (!file || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": file.includes(`${path.sep}api${path.sep}`) ? "application/json" : "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, "0.0.0.0", () => console.log(`fake GitHub (TLS) on :${port} serving ${root}`));
