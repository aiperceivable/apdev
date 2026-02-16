import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { isAllowedChar, checkFile, checkPaths } from "../src/check-chars.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "apdev-test-"));
}

describe("isAllowedChar", () => {
  it("allows all standard ASCII characters (0-127)", () => {
    for (let i = 0; i < 128; i++) {
      expect(isAllowedChar(String.fromCodePoint(i))).toBe(true);
    }
  });

  it("allows common emoji characters", () => {
    const emojis = ["\u{1F600}", "\u{1F680}", "\u2705", "\u2B50"]; // grinning, rocket, check, star
    for (const emoji of emojis) {
      expect(isAllowedChar(emoji)).toBe(true);
    }
  });

  it("allows box-drawing characters", () => {
    const chars = ["\u2500", "\u2502", "\u251C", "\u2514"]; // horizontal, vertical, tee, corner
    for (const ch of chars) {
      expect(isAllowedChar(ch)).toBe(true);
    }
  });

  it("allows arrow characters", () => {
    expect(isAllowedChar("\u2192")).toBe(true); // rightwards arrow
    expect(isAllowedChar("\u2190")).toBe(true); // leftwards arrow
  });

  it("rejects CJK characters", () => {
    expect(isAllowedChar("\u4E2D")).toBe(false); // Chinese character
  });
});

describe("checkFile", () => {
  it("returns empty for clean ASCII file", () => {
    const dir = makeTmpDir();
    const f = join(dir, "clean.ts");
    writeFileSync(f, "console.log('hello world');\n", "utf-8");
    expect(checkFile(f)).toEqual([]);
  });

  it("reports illegal CJK characters", () => {
    const dir = makeTmpDir();
    const f = join(dir, "bad.ts");
    writeFileSync(f, "const x = '\u4E2D\u6587';\n", "utf-8");
    const problems = checkFile(f);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain("U+4E2D");
  });

  it("reports at most 5 problems per file", () => {
    const dir = makeTmpDir();
    const f = join(dir, "many.ts");
    writeFileSync(f, "\u4E00\u4E01\u4E02\u4E03\u4E04\u4E05\u4E06\u4E07\u4E08\u4E09", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(5);
  });

  it("reports error for non-existent file", () => {
    const dir = makeTmpDir();
    const problems = checkFile(join(dir, "nope.ts"));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Failed to read");
  });
});

describe("checkPaths", () => {
  it("returns 0 for clean files, 1 for dirty files", () => {
    const dir = makeTmpDir();

    const clean = join(dir, "ok.ts");
    writeFileSync(clean, "const x = 1;\n", "utf-8");
    expect(checkPaths([clean])).toBe(0);

    const bad = join(dir, "bad.ts");
    writeFileSync(bad, "const x = '\u4E2D';\n", "utf-8");
    expect(checkPaths([bad])).toBe(1);
  });
});
