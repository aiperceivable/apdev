/**
 * Character validation tool.
 *
 * Checks that files contain only allowed characters: ASCII, common emoji,
 * and standard technical symbols (arrows, box-drawing, math operators, etc.).
 *
 * Additionally flags dangerous invisible/bidi characters in code regions
 * (Trojan Source - CVE-2021-42574) while allowing them in comments.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
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

/**
 * Return true if the character is in the base allowed set.
 *
 * Dangerous codepoints (Trojan Source vectors) are excluded even though
 * they fall within allowed Unicode ranges.
 */
export function isAllowedChar(c: string): boolean {
  const { ranges, dangerous } = getBaseDefaults();
  const code = c.codePointAt(0)!;
  if (dangerous.has(code)) return false;
  return isInRanges(code, ranges);
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
    const defaults = getBaseDefaults();
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
  } catch (e) {
    problems.push(`Failed to read file: ${filePath} (${e})`);
  }
  return problems;
}

const SKIP_SUFFIXES = new Set([
  // Bytecode
  ".pyc", ".pyo",
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
  // Fonts
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  // Archives
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z",
  // Compiled / binary
  ".so", ".dylib", ".dll", ".exe", ".o", ".a", ".whl", ".egg",
  // Media
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".flac", ".ogg",
  // Documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  // Data
  ".db", ".sqlite", ".sqlite3", ".pickle", ".pkl",
]);

const SKIP_DIRS = new Set([
  "__pycache__", "node_modules", ".git", ".venv", "venv",
  ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache",
  "dist", "build",
]);

const DEFAULT_DIRS = ["src", "tests", "examples"];
const DEFAULT_GLOBS = ["*.md", "*.yml", "*.yaml", "*.json", ".gitignore"];

function walkDir(directory: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return files;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const fullPath = join(directory, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.endsWith(".egg-info")) continue;
      files.push(...walkDir(fullPath));
    } else if (stat.isFile()) {
      if (SKIP_SUFFIXES.has(extname(name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }
  return files;
}

function defaultProjectFiles(): string[] {
  const cwd = process.cwd();
  const files: string[] = [];

  for (const dirname of DEFAULT_DIRS) {
    const d = join(cwd, dirname);
    if (existsSync(d) && statSync(d).isDirectory()) {
      files.push(...walkDir(d));
    }
  }

  for (const pattern of DEFAULT_GLOBS) {
    if (pattern.startsWith("*.")) {
      // Simple suffix match in cwd
      const suffix = pattern.slice(1); // e.g. ".md"
      try {
        for (const name of readdirSync(cwd).sort()) {
          if (name.endsWith(suffix) && statSync(join(cwd, name)).isFile()) {
            files.push(join(cwd, name));
          }
        }
      } catch {
        // ignore
      }
    } else {
      // Exact filename like .gitignore
      const fullPath = join(cwd, pattern);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export function resolvePaths(paths: string[]): string[] {
  if (paths.length === 0) {
    return defaultProjectFiles();
  }

  const result: string[] = [];
  for (const p of paths) {
    try {
      if (statSync(p).isDirectory()) {
        result.push(...walkDir(p));
      } else {
        result.push(p);
      }
    } catch {
      result.push(p); // let checkFile handle missing files
    }
  }
  return result;
}

/**
 * Check multiple files. Returns 0 if all clean, 1 if any have problems.
 */
export function checkPaths(
  paths: string[],
  extraRanges?: [number, number][],
  dangerousMap?: Map<number, string>,
): number {
  const resolved = resolvePaths(paths);
  if (resolved.length === 0) {
    console.log("No files to check.");
    return 0;
  }

  let hasError = false;
  let checked = 0;
  for (const path of resolved) {
    const problems = checkFile(path, 5, extraRanges, dangerousMap);
    checked++;
    if (problems.length > 0) {
      hasError = true;
      console.log(`\n${path} contains illegal characters:`);
      for (const p of problems) {
        console.log(`  ${p}`);
      }
    }
  }
  if (!hasError) {
    console.log(`All ${checked} files passed.`);
  }
  return hasError ? 1 : 0;
}
