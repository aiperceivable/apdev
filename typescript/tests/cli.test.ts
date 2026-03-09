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

  it("check-chars --charset chinese allows CJK", () => {
    const dir = makeTmpDir();
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D\u6587';\n");
    const result = runApdev("check-chars", "--charset", "chinese", f);
    expect(result.status).toBe(0);
  });

  it("check-chars with APDEV_EXTRA_CHARS=chinese allows CJK", () => {
    const dir = makeTmpDir();
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D\u6587';\n");
    try {
      execFileSync("node", [CLI_PATH, "check-chars", f], {
        encoding: "utf-8",
        env: { ...process.env, APDEV_EXTRA_CHARS: "chinese" },
        timeout: 10000,
      });
      // exit 0 means pass — test passes
    } catch (e: unknown) {
      const err = e as { status?: number };
      // Should NOT fail
      expect(err.status).toBe(0);
    }
  });

  it("CLI --charset-file overrides APDEV_EXTRA_CHARS", () => {
    const dir = makeTmpDir();
    // Env says chinese, but CLI provides an empty charset file
    const empty = join(dir, "empty.json");
    writeFileSync(empty, JSON.stringify({ name: "empty", extra_ranges: [] }));
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D\u6587';\n");
    try {
      execFileSync("node", [CLI_PATH, "check-chars", "--charset-file", empty, f], {
        encoding: "utf-8",
        env: { ...process.env, APDEV_EXTRA_CHARS: "chinese" },
        timeout: 10000,
      });
      // exit 0 means CJK was allowed — that's wrong, CLI should override env
      expect.unreachable("Should have exited with non-zero");
    } catch (e: unknown) {
      const err = e as { status?: number };
      // CLI args present → env var ignored → CJK rejected
      expect(err.status).toBe(1);
    }
  });

  it("check-chars --charset-file allows custom ranges", () => {
    const dir = makeTmpDir();
    const custom = join(dir, "custom.json");
    writeFileSync(custom, JSON.stringify({
      name: "custom",
      extra_ranges: [{ start: "0x4E00", end: "0x9FFF", name: "CJK" }],
    }));
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D';\n");
    const result = runApdev("check-chars", "--charset-file", custom, f);
    expect(result.status).toBe(0);
  });

  it("check-chars with directory recursively checks files", () => {
    const dir = makeTmpDir();
    const sub = join(dir, "pkg");
    mkdirSync(sub);
    writeFileSync(join(sub, "a.ts"), "const x = 1;\n");
    writeFileSync(join(sub, "b.ts"), "const x = '\u4E2D';\n");

    const result = runApdev("check-chars", sub);
    expect(result.status).toBe(1);
    expect(result.stdout.toLowerCase()).toContain("illegal characters");
  });

  it("check-chars with clean directory returns 0", () => {
    const dir = makeTmpDir();
    const sub = join(dir, "pkg");
    mkdirSync(sub);
    writeFileSync(join(sub, "a.ts"), "const x = 1;\n");

    const result = runApdev("check-chars", sub);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("All 1 files passed.");
  });

  it("check-chars skips binary files in directories", () => {
    const dir = makeTmpDir();
    const sub = join(dir, "pkg");
    mkdirSync(sub);
    writeFileSync(join(sub, "ok.ts"), "const x = 1;\n");
    writeFileSync(join(sub, "bad.pyc"), Buffer.from([0xcb, 0x00, 0x00, 0x00]));

    const result = runApdev("check-chars", sub);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("bad.pyc");
  });

  it("check-chars skips hidden directories", () => {
    const dir = makeTmpDir();
    const sub = join(dir, "pkg");
    mkdirSync(sub);
    writeFileSync(join(sub, "ok.ts"), "const x = 1;\n");
    const hidden = join(sub, ".hidden");
    mkdirSync(hidden);
    writeFileSync(join(hidden, "bad.ts"), "const x = '\u4E2D';\n");

    const result = runApdev("check-chars", sub);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(".hidden");
  });

  it("check-chars no args scans default dirs", () => {
    const dir = makeTmpDir();
    const src = join(dir, "src", "pkg");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.ts"), "const x = 1;\n");
    const tests = join(dir, "tests");
    mkdirSync(tests);
    writeFileSync(join(tests, "test_a.ts"), "const y = 2;\n");
    writeFileSync(join(dir, "README.md"), "hello\n");

    try {
      const stdout = execFileSync("node", [CLI_PATH, "check-chars"], {
        encoding: "utf-8",
        cwd: dir,
        timeout: 10000,
      });
      expect(stdout).toContain("All 3 files passed.");
    } catch (e: unknown) {
      const err = e as { status?: number };
      expect(err.status).toBe(0);
    }
  });

  it("check-chars no args detects bad files in default dirs", () => {
    const dir = makeTmpDir();
    const src = join(dir, "src");
    mkdirSync(src);
    writeFileSync(join(src, "bad.ts"), "const x = '\u4E2D';\n");

    try {
      execFileSync("node", [CLI_PATH, "check-chars"], {
        encoding: "utf-8",
        cwd: dir,
        timeout: 10000,
      });
      expect.unreachable("Should have exited with non-zero");
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: string };
      expect(err.status).toBe(1);
      expect((err.stdout ?? "").toLowerCase()).toContain("illegal characters");
    }
  });

  it("check-chars no args with empty project returns 0", () => {
    const dir = makeTmpDir();

    try {
      const stdout = execFileSync("node", [CLI_PATH, "check-chars"], {
        encoding: "utf-8",
        cwd: dir,
        timeout: 10000,
      });
      expect(stdout).toContain("No files to check");
    } catch (e: unknown) {
      const err = e as { status?: number };
      expect(err.status).toBe(0);
    }
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
