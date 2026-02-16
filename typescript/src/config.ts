/**
 * Configuration loading for apdev.
 *
 * Reads the "apdev" field from the consumer project's package.json.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadConfig(
  projectDir?: string,
): Record<string, unknown> {
  const dir = projectDir ?? process.cwd();
  const pkgPath = join(dir, "package.json");

  let raw: string;
  try {
    raw = readFileSync(pkgPath, "utf-8");
  } catch {
    return {};
  }

  const pkg = JSON.parse(raw) as Record<string, unknown>;
  const apdev = pkg["apdev"];
  if (apdev && typeof apdev === "object" && !Array.isArray(apdev)) {
    return apdev as Record<string, unknown>;
  }

  return {};
}
