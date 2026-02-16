/**
 * @aipartnerup/apdev - Shared development tools for TypeScript/JavaScript projects.
 */

export { isAllowedChar, checkFile, checkPaths } from "./check-chars.js";
export { checkCircularImports, findCycles, buildDependencyGraph, fileToModule } from "./check-imports.js";
export { loadConfig } from "./config.js";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readVersion(): string {
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  try {
    const pkg = JSON.parse(readFileSync(join(thisDir, "..", "package.json"), "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const version: string = readVersion();
