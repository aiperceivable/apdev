/**
 * Character validation tool.
 *
 * Checks that files contain only allowed characters: ASCII, common emoji,
 * and standard technical symbols (arrows, box-drawing, math operators, etc.).
 */

import { readFileSync } from "node:fs";

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
    let position = 0;
    for (const char of content) {
      position++;
      if (!isAllowedChar(char)) {
        const code = char.codePointAt(0)!;
        const hex = code.toString(16).toUpperCase().padStart(4, "0");
        problems.push(
          `Illegal character at position ${position}: ${JSON.stringify(char)} (U+${hex})`,
        );
        if (problems.length >= maxProblems) {
          break;
        }
      }
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
