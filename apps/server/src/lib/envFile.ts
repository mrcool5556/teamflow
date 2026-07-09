import fs from "node:fs/promises";
import path from "node:path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export async function readEnvFile(filePath: string): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed) values.set(parsed.key, parsed.value);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return values;
}

export async function getEnvFileValue(filePath: string, key: string) {
  const values = await readEnvFile(filePath);
  return values.get(key) ?? null;
}

export async function setEnvFileValue(filePath: string, key: string, value: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let lines: string[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    lines = raw.split(/\r?\n/);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const nextLine = `${key}=${value}`;
  let replaced = false;
  const output: string[] = [];

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (parsed?.key === key) {
      if (!replaced) {
        output.push(nextLine);
        replaced = true;
      }
      continue;
    }
    output.push(line);
  }

  if (!replaced) {
    if (output.length > 0 && output[output.length - 1] !== "") {
      output.push("");
    }
    output.push(nextLine);
  }

  const content = output.join("\n").replace(/\n*$/, "\n");
  await fs.writeFile(filePath, content, { mode: 0o600 });
}
