/**
 * Command-line interface for apdev.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Command } from "commander";
import { checkPaths, resolveCharsets } from "./check-chars.js";
import { checkCircularImports } from "./check-imports.js";
import { loadConfig } from "./config.js";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function getVersion(): string {
  // Resolve package.json relative to this file
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(thisDir, "..", "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getReleaseScript(): string {
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  return join(thisDir, "..", "release.sh");
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("apdev")
    .description("Shared development tools for TypeScript/JavaScript projects")
    .version(getVersion());

  program
    .command("check-chars")
    .description("Validate files contain only allowed characters")
    .argument("<files...>", "Files to check")
    .option("--charset <name>", "Extra charset preset (repeatable)", collect, [])
    .option("--charset-file <path>", "Custom charset JSON file (repeatable)", collect, [])
    .action((files: string[], opts: { charset: string[]; charsetFile: string[] }) => {
      let charsetNames = opts.charset;
      let charsetFiles = opts.charsetFile;

      // Fall back to APDEV_EXTRA_CHARS env var if no CLI args
      if (charsetNames.length === 0 && charsetFiles.length === 0) {
        const envVal = process.env.APDEV_EXTRA_CHARS ?? "";
        if (envVal) {
          for (const item of envVal.split(",")) {
            const trimmed = item.trim();
            if (!trimmed) continue;
            if (trimmed.includes("/") || trimmed.includes(sep) || trimmed.endsWith(".json")) {
              charsetFiles.push(trimmed);
            } else {
              charsetNames.push(trimmed);
            }
          }
        }
      }

      const { ranges, dangerous } = resolveCharsets(charsetNames, charsetFiles);
      const resolved = files.map((f) => resolve(f));
      const code = checkPaths(resolved, ranges, dangerous);
      process.exit(code);
    });

  program
    .command("check-imports")
    .description("Detect circular imports in a JS/TS package")
    .option("--package <name>", "Base package name (e.g. mylib). Reads from package.json apdev config if omitted.")
    .option("--src-dir <dir>", "Source directory containing the package (default: src)")
    .action((opts: { package?: string; srcDir?: string }) => {
      const config = loadConfig();
      const basePackage = opts.package ?? (config["base_package"] as string | undefined);
      const srcDir = opts.srcDir ?? (config["src_dir"] as string | undefined) ?? "src";

      if (!basePackage) {
        console.error(
          'Error: --package is required (or set base_package in package.json "apdev" field)',
        );
        process.exit(1);
      }

      const code = checkCircularImports(resolve(srcDir), basePackage);
      process.exit(code);
    });

  program
    .command("release")
    .description("Interactive release automation (build, tag, GitHub release, npm publish)")
    .option("-y, --yes", "Auto-accept all defaults (silent mode)")
    .argument("[version]", "Version to release (auto-detected from package.json if omitted)")
    .action((version?: string, opts?: { yes?: boolean }) => {
      const script = getReleaseScript();
      try {
        readFileSync(script);
      } catch {
        console.error("Error: release.sh not found in package");
        process.exit(1);
      }

      const args = ["bash", script];
      if (opts?.yes) args.push("--yes");
      if (version) args.push(version);

      try {
        execFileSync(args[0], args.slice(1), {
          stdio: "inherit",
          env: process.env,
        });
      } catch (e: unknown) {
        const err = e as { status?: number };
        process.exit(err.status ?? 1);
      }
    });

  return program;
}

const program = buildProgram();
program.parse();
