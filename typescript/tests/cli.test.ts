import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";

const CLI_PATH = join(__dirname, "..", "dist", "cli.js");

function runApdev(
  ...args: string[]
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 10000,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (err.stdout as string) ?? "",
      stderr: (err.stderr as string) ?? "",
      status: err.status ?? 1,
    };
  }
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "apdev-cli-test-"));
}

describe("CLI", () => {
  it("--help shows subcommands", () => {
    const result = runApdev("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check-chars");
    expect(result.stdout).toContain("check-imports");
    expect(result.stdout).toContain("release");
  });

  it("check-chars returns 0 for clean files", () => {
    const dir = makeTmpDir();
    const f = join(dir, "ok.ts");
    writeFileSync(f, "const x = 1;\n");
    const result = runApdev("check-chars", f);
    expect(result.status).toBe(0);
  });

  it("check-chars returns 1 for files with illegal chars", () => {
    const dir = makeTmpDir();
    const f = join(dir, "bad.ts");
    writeFileSync(f, "const x = '\u4E2D';\n");
    const result = runApdev("check-chars", f);
    expect(result.status).toBe(1);
    expect(result.stdout.toLowerCase()).toContain("illegal characters");
  });

  it("check-imports works with --package and --src-dir", () => {
    const dir = makeTmpDir();
    const pkg = join(dir, "mypkg");
    mkdirSync(pkg);
    writeFileSync(join(pkg, "index.ts"), "");
    writeFileSync(join(pkg, "a.ts"), "import os from 'os';\n");

    const result = runApdev(
      "check-imports",
      "--package",
      "mypkg",
      "--src-dir",
      dir,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No circular imports");
  });

  it("check-imports reads config from package.json", () => {
    const dir = makeTmpDir();
    const src = join(dir, "src", "mypkg");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.ts"), "");
    writeFileSync(join(src, "a.ts"), "import os from 'os';\n");

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test",
        apdev: { base_package: "mypkg", src_dir: "src" },
      }),
    );

    const result = runApdev("check-imports");
    // This will use cwd which isn't `dir`, so we run with cwd
    // Actually we need to run with a different approach for cwd:
    try {
      const stdout = execFileSync("node", [CLI_PATH, "check-imports"], {
        encoding: "utf-8",
        cwd: dir,
        timeout: 10000,
      });
      expect(stdout).toContain("No circular imports");
    } catch (e: unknown) {
      const err = e as { stdout?: string; status?: number };
      // If it exits with 0 but throws (shouldn't happen), check output
      if (err.status === 0) {
        expect(err.stdout ?? "").toContain("No circular imports");
      } else {
        // Unexpected failure
        throw e;
      }
    }
  });
});
