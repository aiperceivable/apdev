/**
 * Character validation tool.
 *
 * Checks that files contain only allowed characters: ASCII, common emoji,
 * and standard technical symbols (arrows, box-drawing, math operators, etc.).
 *
 * Additionally flags dangerous invisible/bidi characters in code regions
 * (Trojan Source - CVE-2021-42574) while allowing them in comments.
 */

import { readFileSync, existsSync } from "node:fs";
import { extname, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface RangeEntry {
  start: string;
  end: string;
  name: string;
}

export interface DangerousEntry {
  code: string;
  name: string;
}

export interface CharsetData {
  name: string;
  description?: string;
  emoji_ranges?: RangeEntry[];
  extra_ranges?: RangeEntry[];
  dangerous?: DangerousEntry[];
}

function getCharsetsDir(): string {
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  // In dev: src/check-chars.ts -> charsets/ is at src/charsets/
  // In dist: dist/index.js -> charsets/ is at src/charsets/ (one level up from dist)
  const devPath = join(thisDir, "charsets");
  if (existsSync(devPath)) {
    return devPath;
  }
  return join(thisDir, "..", "src", "charsets");
}

export function loadCharset(nameOrPath: string): CharsetData {
  if (nameOrPath.includes(sep) || nameOrPath.includes("/") || nameOrPath.endsWith(".json")) {
    if (!existsSync(nameOrPath)) {
      throw new Error(`Charset file not found: ${nameOrPath}`);
    }
    return JSON.parse(readFileSync(nameOrPath, "utf-8"));
  }
  const filePath = join(getCharsetsDir(), `${nameOrPath}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Unknown charset: ${nameOrPath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function parseRanges(entries: RangeEntry[]): [number, number][] {
  return entries.map((e) => [parseInt(e.start, 16), parseInt(e.end, 16)]);
}

function parseDangerous(entries: DangerousEntry[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const e of entries) {
    map.set(parseInt(e.code, 16), e.name);
  }
  return map;
}

export function resolveCharsets(
  charsetNames: string[],
  charsetFiles: string[],
): { ranges: [number, number][]; dangerous: Map<number, string> } {
  const base = loadCharset("base");
  const rangesSet = new Map<string, [number, number]>();
  const dangerous = parseDangerous(base.dangerous ?? []);

  function addRanges(entries: RangeEntry[]) {
    for (const [s, e] of parseRanges(entries)) {
      rangesSet.set(`${s}-${e}`, [s, e]);
    }
  }

  addRanges(base.emoji_ranges ?? []);
  addRanges(base.extra_ranges ?? []);

  for (const name of charsetNames) {
    const data = loadCharset(name);
    addRanges(data.emoji_ranges ?? []);
    addRanges(data.extra_ranges ?? []);
    if (data.dangerous) {
      for (const [code, dname] of parseDangerous(data.dangerous)) {
        dangerous.set(code, dname);
      }
    }
  }

  for (const path of charsetFiles) {
    const data = loadCharset(path);
    addRanges(data.emoji_ranges ?? []);
    addRanges(data.extra_ranges ?? []);
    if (data.dangerous) {
      for (const [code, dname] of parseDangerous(data.dangerous)) {
        dangerous.set(code, dname);
      }
    }
  }

  const ranges = [...rangesSet.values()].sort((a, b) => a[0] - b[0]);
  return { ranges, dangerous };
}

const PYTHON_SUFFIXES = new Set([".py"]);
const JS_SUFFIXES = new Set([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"]);

function isInRanges(code: number, ranges: [number, number][]): boolean {
  if (code <= 127) return true;
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return true;
  }
  return false;
}

let _baseRanges: [number, number][] | null = null;
let _baseDangerous: Map<number, string> | null = null;

function getBaseDefaults(): { ranges: [number, number][]; dangerous: Map<number, string> } {
  if (!_baseRanges || !_baseDangerous) {
    const defaults = resolveCharsets([], []);
    _baseRanges = defaults.ranges;
    _baseDangerous = defaults.dangerous;
  }
  return { ranges: _baseRanges, dangerous: _baseDangerous };
}

/** Return true if the character is in the base allowed set. */
export function isAllowedChar(c: string): boolean {
  const { ranges } = getBaseDefaults();
  return isInRanges(c.codePointAt(0)!, ranges);
}

/** Return true if the character is a dangerous invisible/bidi codepoint. */
export function isDangerousChar(c: string): boolean {
  const { dangerous } = getBaseDefaults();
  return dangerous.has(c.codePointAt(0)!);
}

/**
 * Return the set of code-unit indices that are within comments.
 *
 * Uses a simple state machine that tracks string literals to avoid
 * treating # / // inside strings as comment starts.
 */
export function computeCommentMask(
  content: string,
  suffix: string,
): Set<number> {
  if (PYTHON_SUFFIXES.has(suffix)) {
    return computeCommentMaskPython(content);
  }
  if (JS_SUFFIXES.has(suffix)) {
    return computeCommentMaskJs(content);
  }
  return new Set();
}

function computeCommentMaskPython(content: string): Set<number> {
  const mask = new Set<number>();
  let i = 0;
  const n = content.length;

  while (i < n) {
    // Triple-quoted strings (""" or ''')
    if (
      i + 2 < n &&
      (content.slice(i, i + 3) === '"""' || content.slice(i, i + 3) === "'''")
    ) {
      const quote = content.slice(i, i + 3);
      i += 3;
      while (i < n) {
        if (content[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (i + 2 < n && content.slice(i, i + 3) === quote) {
          i += 3;
          break;
        }
        i++;
      }
      continue;
    }

    // Single / double quoted strings
    if (content[i] === '"' || content[i] === "'") {
      const quoteChar = content[i];
      i++;
      while (i < n && content[i] !== "\n") {
        if (content[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (content[i] === quoteChar) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Line comment
    if (content[i] === "#") {
      while (i < n && content[i] !== "\n") {
        mask.add(i);
        i++;
      }
      continue;
    }

    i++;
  }

  return mask;
}

function computeCommentMaskJs(content: string): Set<number> {
  const mask = new Set<number>();
  let i = 0;
  const n = content.length;

  while (i < n) {
    // Template literal
    if (content[i] === "`") {
      i++;
      while (i < n) {
        if (content[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (content[i] === "`") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Single / double quoted strings
    if (content[i] === '"' || content[i] === "'") {
      const quoteChar = content[i];
      i++;
      while (i < n && content[i] !== "\n") {
        if (content[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (content[i] === quoteChar) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Line comment
    if (i + 1 < n && content[i] === "/" && content[i + 1] === "/") {
      while (i < n && content[i] !== "\n") {
        mask.add(i);
        i++;
      }
      continue;
    }

    // Block comment
    if (i + 1 < n && content[i] === "/" && content[i + 1] === "*") {
      while (i < n) {
        if (i + 1 < n && content[i] === "*" && content[i + 1] === "/") {
          mask.add(i);
          mask.add(i + 1);
          i += 2;
          break;
        }
        mask.add(i);
        i++;
      }
      continue;
    }

    i++;
  }

  return mask;
}

/**
 * Check a single file for illegal characters.
 * Returns a list of problem descriptions (empty if the file is clean).
 */
export function checkFile(
  filePath: string,
  maxProblems = 5,
  extraRanges?: [number, number][],
  dangerousMap?: Map<number, string>,
): string[] {
  const problems: string[] = [];
  if (!extraRanges || !dangerousMap) {
    const defaults = resolveCharsets([], []);
    extraRanges ??= defaults.ranges;
    dangerousMap ??= defaults.dangerous;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const suffix = extname(filePath).toLowerCase();
    const commentMask = computeCommentMask(content, suffix);

    let position = 0;
    let offset = 0;
    for (const char of content) {
      position++;
      const code = char.codePointAt(0)!;

      if (dangerousMap.has(code)) {
        if (!commentMask.has(offset)) {
          const name = dangerousMap.get(code)!;
          const hex = code.toString(16).toUpperCase().padStart(4, "0");
          problems.push(
            `Dangerous character in code at position ${position}: U+${hex} (${name})`,
          );
        }
      } else if (!isInRanges(code, extraRanges)) {
        const hex = code.toString(16).toUpperCase().padStart(4, "0");
        problems.push(
          `Illegal character at position ${position}: ${JSON.stringify(char)} (U+${hex})`,
        );
      }

      if (problems.length >= maxProblems) {
        break;
      }
      offset += char.length; // 1 for BMP, 2 for supplementary
    }
  } catch {
    problems.push(`Failed to read file: ${filePath}`);
  }
  return problems;
}

/**
 * Check multiple files. Returns 0 if all clean, 1 if any have problems.
 */
export function checkPaths(
  paths: string[],
  extraRanges?: [number, number][],
  dangerousMap?: Map<number, string>,
): number {
  let hasError = false;
  for (const path of paths) {
    const problems = checkFile(path, 5, extraRanges, dangerousMap);
    if (problems.length > 0) {
      hasError = true;
      console.log(`\n${path} contains illegal characters:`);
      for (const p of problems) {
        console.log(`  ${p}`);
      }
    }
  }
  return hasError ? 1 : 0;
}
