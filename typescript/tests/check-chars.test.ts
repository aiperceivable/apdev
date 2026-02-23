import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import {
  isAllowedChar,
  isDangerousChar,
  checkFile,
  checkPaths,
  loadCharset,
  resolveCharsets,
} from "../src/check-chars.js";

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

  it("allows block element characters", () => {
    const chars = ["\u2580", "\u2584", "\u2588", "\u2591", "\u2592", "\u2593"]; // ▀ ▄ █ ░ ▒ ▓
    for (const ch of chars) {
      expect(isAllowedChar(ch)).toBe(true);
    }
  });

  it("allows braille pattern characters", () => {
    const chars = ["\u2800", "\u2801", "\u28FF", "\u2840"]; // ⠀ ⠁ ⣿ ⡀
    for (const ch of chars) {
      expect(isAllowedChar(ch)).toBe(true);
    }
  });

  it("rejects CJK characters", () => {
    expect(isAllowedChar("\u4E2D")).toBe(false); // Chinese character
  });
});

describe("isDangerousChar", () => {
  it("identifies bidi control characters as dangerous", () => {
    expect(isDangerousChar("\u202A")).toBe(true); // LRE
    expect(isDangerousChar("\u202E")).toBe(true); // RLO
    expect(isDangerousChar("\u2066")).toBe(true); // LRI
    expect(isDangerousChar("\u2069")).toBe(true); // PDI
  });

  it("identifies zero-width characters as dangerous", () => {
    expect(isDangerousChar("\u200B")).toBe(true); // ZWSP
    expect(isDangerousChar("\u200D")).toBe(true); // ZWJ
    expect(isDangerousChar("\u200E")).toBe(true); // LRM
    expect(isDangerousChar("\u2060")).toBe(true); // WJ
  });

  it("does not flag normal characters", () => {
    expect(isDangerousChar("a")).toBe(false);
    expect(isDangerousChar("\u2014")).toBe(false); // em dash
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

  // --- Dangerous character tests ---

  it("detects bidi override in TS code", () => {
    const dir = makeTmpDir();
    const f = join(dir, "trojan.ts");
    writeFileSync(f, "let x = '\u202E';\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Dangerous character in code");
    expect(problems[0]).toContain("U+202E");
  });

  it("allows bidi char in TS line comment", () => {
    const dir = makeTmpDir();
    const f = join(dir, "safe.ts");
    writeFileSync(f, "let x = 1; // test \u202E bidi\n", "utf-8");
    expect(checkFile(f)).toEqual([]);
  });

  it("allows bidi char in TS block comment", () => {
    const dir = makeTmpDir();
    const f = join(dir, "safe2.ts");
    writeFileSync(f, "/* \u202E bidi */\nlet x = 1;\n", "utf-8");
    expect(checkFile(f)).toEqual([]);
  });

  it("detects zero-width space in JS code", () => {
    const dir = makeTmpDir();
    const f = join(dir, "zw.js");
    writeFileSync(f, "x\u200B= 1;\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ZERO WIDTH SPACE");
  });

  it("detects dangerous char in string literal (not a comment)", () => {
    const dir = makeTmpDir();
    const f = join(dir, "str.ts");
    writeFileSync(f, "const s = 'hello\u200Bworld';\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Dangerous character in code");
  });

  it("allows bidi char in Python # comment via .py extension", () => {
    const dir = makeTmpDir();
    const f = join(dir, "safe.py");
    writeFileSync(f, "x = 1  # test \u202E bidi\n", "utf-8");
    expect(checkFile(f)).toEqual([]);
  });

  it("does not treat # in JS string as comment", () => {
    const dir = makeTmpDir();
    const f = join(dir, "hash.js");
    // \u202E after the string, in code
    writeFileSync(f, "let s = '# not a comment';\u202E\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Dangerous character in code");
  });

  it("treats all as code for unknown extensions (conservative)", () => {
    const dir = makeTmpDir();
    const f = join(dir, "file.txt");
    writeFileSync(f, "hello \u202E world\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Dangerous character in code");
  });

  it("CJK still rejected as illegal after dangerous check", () => {
    const dir = makeTmpDir();
    const f = join(dir, "cjk.ts");
    writeFileSync(f, "const x = '\u4E2D';\n", "utf-8");
    const problems = checkFile(f);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Illegal character");
  });

  it("allows CJK with chinese charset", () => {
    const dir = makeTmpDir();
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D\u6587';\n", "utf-8");
    const { ranges, dangerous } = resolveCharsets(["chinese"], []);
    const problems = checkFile(f, 5, ranges, dangerous);
    expect(problems).toEqual([]);
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

  it("passes charsets through to checkFile", () => {
    const dir = makeTmpDir();
    const f = join(dir, "cn.ts");
    writeFileSync(f, "const x = '\u4E2D';\n", "utf-8");
    const { ranges, dangerous } = resolveCharsets(["chinese"], []);
    expect(checkPaths([f], ranges, dangerous)).toBe(0);
  });
});

describe("loadCharset", () => {
  it("loads base charset", () => {
    const data = loadCharset("base");
    expect(data.name).toBe("base");
    expect(data.emoji_ranges!.length).toBeGreaterThan(0);
    expect(data.extra_ranges!.length).toBeGreaterThan(0);
    expect(data.dangerous!.length).toBeGreaterThan(0);
  });

  it("loads chinese charset", () => {
    const data = loadCharset("chinese");
    expect(data.name).toBe("chinese");
    expect(data.extra_ranges!.length).toBeGreaterThan(0);
  });

  it("throws for unknown charset", () => {
    expect(() => loadCharset("nonexistent")).toThrow();
  });

  it("loads from absolute file path", () => {
    const dir = makeTmpDir();
    const f = join(dir, "custom.json");
    writeFileSync(f, JSON.stringify({
      name: "custom",
      extra_ranges: [{ start: "0x4E00", end: "0x9FFF", name: "CJK" }],
    }));
    const data = loadCharset(f);
    expect(data.name).toBe("custom");
  });
});

describe("resolveCharsets", () => {
  it("returns base ranges by default", () => {
    const { ranges, dangerous } = resolveCharsets([], []);
    expect(ranges.length).toBeGreaterThan(0);
    expect(dangerous.size).toBeGreaterThan(0);
  });

  it("includes CJK range with chinese charset", () => {
    const { ranges } = resolveCharsets(["chinese"], []);
    const hasCjk = ranges.some(([s, e]) => s <= 0x4E00 && 0x9FFF <= e);
    expect(hasCjk).toBe(true);
  });

  it("includes custom file ranges", () => {
    const dir = makeTmpDir();
    const f = join(dir, "custom.json");
    writeFileSync(f, JSON.stringify({
      name: "custom",
      extra_ranges: [{ start: "0xABCD", end: "0xABFF", name: "Test" }],
    }));
    const { ranges } = resolveCharsets([], [f]);
    const hasCustom = ranges.some(([s, e]) => s <= 0xABCD && 0xABFF <= e);
    expect(hasCustom).toBe(true);
  });

  it("deduplicates overlapping charset ranges", () => {
    const { ranges } = resolveCharsets(["chinese", "japanese"], []);
    const cjkCount = ranges.filter(([s, e]) => s === 0x4E00 && e === 0x9FFF).length;
    expect(cjkCount).toBe(1);
  });
});
