import fs from "node:fs";

export function readDevVars(path = ".dev.vars"): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  return vars;
}
