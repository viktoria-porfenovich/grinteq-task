import fs from "node:fs";

function parseEnvFile(contents: string): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

export function readDevVars(path = ".dev.vars"): Record<string, string> {
  if (!fs.existsSync(path)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(path, "utf8"));
}

export function loadVars(): Record<string, string> {
  const wranglerVars = fs.existsSync("wrangler.toml")
    ? parseEnvFile(fs.readFileSync("wrangler.toml", "utf8"))
    : {};

  return {
    ...wranglerVars,
    ...readDevVars(),
  };
}

export function requireVar(vars: Record<string, string>, key: string): string {
  const value = vars[key];
  if (!value) {
    throw new Error(`Missing ${key} in wrangler.toml [vars] or .dev.vars`);
  }
  return value;
}
