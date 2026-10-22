import fs from "node:fs/promises";
import path from "node:path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    // Double-quoted: unescape what formatEnvValue produced.
    value = value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Serialise a value for a KEY=VALUE line. Control characters (newline, carriage return, NUL)
 * are refused outright because they would start a new line and inject other variables; values
 * with quotes, spaces, `#` or `=` are double-quoted with backslash escapes.
 */
export function formatEnvValue(value: string) {
  if (/[\r\n\0]/.test(value)) {
    throw new Error("Environment values cannot contain line breaks or NUL characters");
  }
  if (value === "" || /[\s"'#=\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
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
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error("Invalid environment variable name");
  }
  const serialized = formatEnvValue(value);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let lines: string[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    lines = raw.split(/\r?\n/);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const nextLine = `${key}=${serialized}`;
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
