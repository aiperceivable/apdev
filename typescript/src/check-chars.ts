/**
 * Character validation tool.
 *
 * Checks that files contain only allowed characters: ASCII, common emoji,
 * and standard technical symbols (arrows, box-drawing, math operators, etc.).
 *
 * Additionally flags dangerous invisible/bidi characters in code regions
 * (Trojan Source - CVE-2021-42574) while allowing them in comments.
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";

/** Allowed Unicode ranges beyond ASCII (0-127). */
export const EMOJI_RANGES: [number, number][] = [
  [0x1f300, 0x1f5ff], // Symbols and Pictographs
  [0x1f600, 0x1f64f], // Emoticons
  [0x1f680, 0x1f6ff], // Transport and Map Symbols
  [0x1f780, 0x1f7ff], // Geometric Shapes Extended
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
  [0x2600, 0x26ff], // Miscellaneous Symbols
  [0x2700, 0x27bf], // Dingbats
];

export const EXTRA_ALLOWED_RANGES: [number, number][] = [
  [0x0080, 0x00ff], // Latin-1 Supplement
  [0x2000, 0x206f], // General Punctuation
  [0x2100, 0x214f], // Letterlike Symbols
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical Operators
  [0x2300, 0x23ff], // Miscellaneous Technical
  [0x2500, 0x257f], // Box Drawing
  [0x25a0, 0x25ff], // Geometric Shapes
  [0x2b00, 0x2bff], // Miscellaneous Symbols and Arrows
  [0xfe00, 0xfe0f], // Variation Selectors
];

const ALL_RANGES = [...EMOJI_RANGES, ...EXTRA_ALLOWED_RANGES];

/**
 * Dangerous codepoints that pass the allowed-range check but should be
 * flagged when they appear in code (not comments).  These are within the
 * General Punctuation range (0x2000-0x206F) which is broadly allowed.
 */
export const DANGEROUS_CODEPOINTS: Map<number, string> = new Map([
  // Bidi control characters (Trojan Source - CVE-2021-42574)
  [0x202a, "LEFT-TO-RIGHT EMBEDDING"],
  [0x202b, "RIGHT-TO-LEFT EMBEDDING"],
  [0x202c, "POP DIRECTIONAL FORMATTING"],
  [0x202d, "LEFT-TO-RIGHT OVERRIDE"],
  [0x202e, "RIGHT-TO-LEFT OVERRIDE"],
  [0x2066, "LEFT-TO-RIGHT ISOLATE"],
  [0x2067, "RIGHT-TO-LEFT ISOLATE"],
  [0x2068, "FIRST STRONG ISOLATE"],
  [0x2069, "POP DIRECTIONAL ISOLATE"],
  // Zero-width characters
  [0x200b, "ZERO WIDTH SPACE"],
  [0x200c, "ZERO WIDTH NON-JOINER"],
  [0x200d, "ZERO WIDTH JOINER"],
  [0x200e, "LEFT-TO-RIGHT MARK"],
  [0x200f, "RIGHT-TO-LEFT MARK"],
  [0x2060, "WORD JOINER"],
]);

const PYTHON_SUFFIXES = new Set([".py"]);
const JS_SUFFIXES = new Set([".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"]);

/** Return true if the character is in the allowed set. */
export function isAllowedChar(c: string): boolean {
  const code = c.codePointAt(0)!;
  if (code <= 127) {
    return true;
  }
  for (const [start, end] of ALL_RANGES) {
    if (code >= start && code <= end) {
      return true;
    }
  }
  return false;
}

/** Return true if the character is a dangerous invisible/bidi codepoint. */
export function isDangerousChar(c: string): boolean {
  return DANGEROUS_CODEPOINTS.has(c.codePointAt(0)!);
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
): string[] {
  const problems: string[] = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    const suffix = extname(filePath).toLowerCase();
    const commentMask = computeCommentMask(content, suffix);

    let position = 0;
    let offset = 0;
    for (const char of content) {
      position++;
      const code = char.codePointAt(0)!;

      if (isDangerousChar(char)) {
        if (!commentMask.has(offset)) {
          const name = DANGEROUS_CODEPOINTS.get(code)!;
          const hex = code.toString(16).toUpperCase().padStart(4, "0");
          problems.push(
            `Dangerous character in code at position ${position}: U+${hex} (${name})`,
          );
        }
      } else if (!isAllowedChar(char)) {
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
export function checkPaths(paths: string[]): number {
  let hasError = false;
  for (const path of paths) {
    const problems = checkFile(path);
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
