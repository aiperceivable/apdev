//! Character validation tool.
//!
//! Checks that files contain only allowed characters: ASCII, common emoji,
//! and standard technical symbols (arrows, box-drawing, math operators, etc.).
//!
//! Additionally flags dangerous invisible/bidi characters in code regions
//! (Trojan Source - CVE-2021-42574) while allowing them in comments.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

// Bundled charset JSON files embedded at compile time
const CHARSET_BASE: &str = include_str!("charsets/base.json");
const CHARSET_CHINESE: &str = include_str!("charsets/chinese.json");
const CHARSET_JAPANESE: &str = include_str!("charsets/japanese.json");
const CHARSET_KOREAN: &str = include_str!("charsets/korean.json");

#[derive(Deserialize)]
struct RangeEntry {
    start: String,
    end: String,
}

#[derive(Deserialize)]
struct DangerousEntry {
    code: String,
    name: String,
}

#[derive(Deserialize)]
struct CharsetData {
    #[serde(default)]
    emoji_ranges: Vec<RangeEntry>,
    #[serde(default)]
    extra_ranges: Vec<RangeEntry>,
    #[serde(default)]
    dangerous: Vec<DangerousEntry>,
}

/// Parse a `0x…` hex string, returning an error on malformed input.
fn parse_hex(s: &str) -> Result<u32, String> {
    let s = s.trim_start_matches("0x").trim_start_matches("0X");
    u32::from_str_radix(s, 16)
        .map_err(|_| format!("Invalid hex codepoint in charset: '{}'", s))
}

fn parse_charset_data(json: &str) -> Result<CharsetData, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn load_builtin_charset(name: &str) -> Option<&'static str> {
    match name {
        "base" => Some(CHARSET_BASE),
        "chinese" => Some(CHARSET_CHINESE),
        "japanese" => Some(CHARSET_JAPANESE),
        "korean" => Some(CHARSET_KOREAN),
        _ => None,
    }
}

/// Load a charset definition by preset name or file path.
///
/// If name_or_path contains a path separator or ends with .json,
/// it is treated as a file path. Otherwise it is looked up from
/// the bundled charsets.
fn load_charset(name_or_path: &str) -> Result<CharsetData, String> {
    if name_or_path.contains(std::path::MAIN_SEPARATOR) || name_or_path.ends_with(".json") {
        let content = std::fs::read_to_string(name_or_path)
            .map_err(|_| format!("Charset file not found: {}", name_or_path))?;
        return parse_charset_data(&content);
    }

    match load_builtin_charset(name_or_path) {
        Some(json) => parse_charset_data(json),
        None => Err(format!("Unknown charset: {}", name_or_path)),
    }
}

/// Parse range entries, propagating hex parse errors.
fn parse_ranges(entries: &[RangeEntry]) -> Result<Vec<(u32, u32)>, String> {
    entries
        .iter()
        .map(|e| Ok((parse_hex(&e.start)?, parse_hex(&e.end)?)))
        .collect()
}

/// Parse dangerous entries, propagating hex parse errors.
fn parse_dangerous(entries: &[DangerousEntry]) -> Result<HashMap<u32, String>, String> {
    entries
        .iter()
        .map(|e| Ok((parse_hex(&e.code)?, e.name.clone())))
        .collect()
}

/// Load base charset and merge any additional charsets.
/// Returns (all_ranges, dangerous_codepoints).
pub fn resolve_charsets(
    charset_names: &[String],
    charset_files: &[String],
) -> Result<(Vec<(u32, u32)>, HashMap<u32, String>), String> {
    let base = load_charset("base")?;
    let mut ranges_set: std::collections::HashSet<(u32, u32)> = std::collections::HashSet::new();
    ranges_set.extend(parse_ranges(&base.emoji_ranges)?);
    ranges_set.extend(parse_ranges(&base.extra_ranges)?);
    let mut dangerous = parse_dangerous(&base.dangerous)?;

    for name in charset_names {
        let data = load_charset(name)?;
        ranges_set.extend(parse_ranges(&data.emoji_ranges)?);
        ranges_set.extend(parse_ranges(&data.extra_ranges)?);
        dangerous.extend(parse_dangerous(&data.dangerous)?);
    }

    for path in charset_files {
        let data = load_charset(path)?;
        ranges_set.extend(parse_ranges(&data.emoji_ranges)?);
        ranges_set.extend(parse_ranges(&data.extra_ranges)?);
        dangerous.extend(parse_dangerous(&data.dangerous)?);
    }

    let mut ranges: Vec<(u32, u32)> = ranges_set.into_iter().collect();
    ranges.sort();

    Ok((ranges, dangerous))
}

/// Return `true` if `c` is ASCII (≤127) or falls within any of the sorted ranges.
///
/// Uses binary search since `ranges` is always sorted by start codepoint.
fn is_in_ranges(c: char, ranges: &[(u32, u32)]) -> bool {
    let code = c as u32;
    if code <= 127 {
        return true;
    }
    // Find the last range whose start ≤ code; if code ≤ that range's end, it's a hit.
    let idx = ranges.partition_point(|&(start, _)| start <= code);
    if idx == 0 {
        return false;
    }
    code <= ranges[idx - 1].1
}

/// Returns a boolean mask of length `chars.len()` where `true` means the
/// character at that index is inside a Python comment region.
///
/// Uses `Vec<bool>` (one byte per char) instead of `HashSet<usize>` to avoid
/// hash overhead and keep memory proportional to file size rather than comment size.
///
/// Matches Python's enumerate(content) semantics (codepoint indices, not byte offsets).
fn compute_comment_mask_python(chars: &[char]) -> Vec<bool> {
    let n = chars.len();
    let mut mask = vec![false; n];
    let mut i = 0;

    while i < n {
        // Triple-quoted strings: """ or '''
        if i + 2 < n {
            let is_triple_double =
                chars[i] == '"' && chars[i + 1] == '"' && chars[i + 2] == '"';
            let is_triple_single =
                chars[i] == '\'' && chars[i + 1] == '\'' && chars[i + 2] == '\'';
            if is_triple_double || is_triple_single {
                let q = chars[i];
                i += 3;
                while i < n {
                    if chars[i] == '\\' && i + 1 < n {
                        i += 2;
                        continue;
                    }
                    if i + 2 < n && chars[i] == q && chars[i + 1] == q && chars[i + 2] == q {
                        i += 3;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        }

        // Single / double quoted strings
        if chars[i] == '"' || chars[i] == '\'' {
            let q = chars[i];
            i += 1;
            while i < n && chars[i] != '\n' {
                if chars[i] == '\\' && i + 1 < n {
                    i += 2;
                    continue;
                }
                if chars[i] == q {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        // Line comment
        if chars[i] == '#' {
            while i < n && chars[i] != '\n' {
                mask[i] = true;
                i += 1;
            }
            continue;
        }

        i += 1;
    }

    mask
}

/// Returns a boolean mask for JS/TS comment regions (line `//` and block `/* */`).
fn compute_comment_mask_js(chars: &[char]) -> Vec<bool> {
    let n = chars.len();
    let mut mask = vec![false; n];
    let mut i = 0;

    while i < n {
        // Template literal
        if chars[i] == '`' {
            i += 1;
            while i < n {
                if chars[i] == '\\' && i + 1 < n {
                    i += 2;
                    continue;
                }
                if chars[i] == '`' {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        // Single / double quoted strings
        if chars[i] == '"' || chars[i] == '\'' {
            let q = chars[i];
            i += 1;
            while i < n && chars[i] != '\n' {
                if chars[i] == '\\' && i + 1 < n {
                    i += 2;
                    continue;
                }
                if chars[i] == q {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        // Line comment //
        if i + 1 < n && chars[i] == '/' && chars[i + 1] == '/' {
            while i < n && chars[i] != '\n' {
                mask[i] = true;
                i += 1;
            }
            continue;
        }

        // Block comment /* ... */
        if i + 1 < n && chars[i] == '/' && chars[i + 1] == '*' {
            while i < n {
                if i + 1 < n && chars[i] == '*' && chars[i + 1] == '/' {
                    mask[i] = true;
                    mask[i + 1] = true;
                    i += 2;
                    break;
                }
                mask[i] = true;
                i += 1;
            }
            continue;
        }

        i += 1;
    }

    mask
}

/// Check a single file for illegal characters.
/// Returns a list of problem descriptions (empty if the file is clean).
pub fn check_file(
    path: &Path,
    extra_ranges: &[(u32, u32)],
    dangerous: &HashMap<u32, String>,
) -> Vec<String> {
    let mut problems = Vec::new();

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            problems.push(format!("Failed to read file: {}", e));
            return problems;
        }
    };

    let chars: Vec<char> = content.chars().collect();
    let suffix = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let comment_mask: Vec<bool> = match suffix.as_str() {
        "py" => compute_comment_mask_python(&chars),
        "js" | "ts" | "tsx" | "jsx" | "mjs" | "cjs" | "rs" => compute_comment_mask_js(&chars),
        _ => vec![false; chars.len()],
    };

    for (i, &c) in chars.iter().enumerate() {
        let code = c as u32;
        if let Some(name) = dangerous.get(&code) {
            if !comment_mask[i] {
                problems.push(format!(
                    "Dangerous character in code at position {}: U+{:04X} ({})",
                    i + 1,
                    code,
                    name
                ));
            }
        } else if !is_in_ranges(c, extra_ranges) {
            problems.push(format!(
                "Illegal character at position {}: {:?} (U+{:04X})",
                i + 1,
                c,
                code
            ));
        }

        if problems.len() >= 5 {
            break;
        }
    }

    problems
}

const DEFAULT_DIRS: &[&str] = &["src", "tests", "examples"];
const DEFAULT_GLOBS: &[&str] = &["*.md", "*.yml", "*.yaml", "*.json", ".gitignore"];

const SKIP_SUFFIXES: &[&str] = &[
    // Python bytecode
    "pyc", "pyo",
    // Images
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp",
    // Fonts
    "ttf", "otf", "woff", "woff2", "eot",
    // Archives
    "zip", "tar", "gz", "bz2", "xz", "7z",
    // Compiled / binary
    "so", "dylib", "dll", "exe", "o", "a", "whl", "egg",
    // Media
    "mp3", "mp4", "wav", "avi", "mov", "flac", "ogg",
    // Documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    // Data
    "db", "sqlite", "sqlite3", "pickle", "pkl",
];

const SKIP_DIRS: &[&str] = &[
    "__pycache__",
    "node_modules",
    ".git",
    ".venv",
    "venv",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "dist",
    "build",
    "target",
];

fn should_skip_suffix(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        SKIP_SUFFIXES.contains(&ext_lower.as_str())
    } else {
        false
    }
}

fn walk_dir(directory: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();

    let mut entries: Vec<_> = match std::fs::read_dir(directory) {
        Ok(r) => r.filter_map(|e| e.ok()).collect(),
        Err(_) => return files,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            if SKIP_DIRS.contains(&name_str.as_ref()) || name_str.ends_with(".egg-info") {
                continue;
            }
            files.extend(walk_dir(&path));
        } else if path.is_file() && !should_skip_suffix(&path) {
            files.push(path);
        }
    }

    files
}

fn matches_simple_glob(path: &Path, pattern: &str) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if let Some(ext) = pattern.strip_prefix("*.") {
        name.ends_with(&format!(".{}", ext))
    } else {
        name == pattern
    }
}

fn default_project_files() -> Vec<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_default();
    let mut files = Vec::new();

    for &dirname in DEFAULT_DIRS {
        let d = cwd.join(dirname);
        if d.is_dir() {
            files.extend(walk_dir(&d));
        }
    }

    for &pattern in DEFAULT_GLOBS {
        if let Ok(entries) = std::fs::read_dir(&cwd) {
            let mut matched: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_file() && matches_simple_glob(p, pattern))
                .collect();
            matched.sort();
            files.extend(matched);
        }
    }

    files
}

fn resolve_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    if paths.is_empty() {
        return default_project_files();
    }

    let mut result = Vec::new();
    for p in paths {
        if p.is_dir() {
            result.extend(walk_dir(&p));
        } else {
            result.push(p);
        }
    }
    result
}

/// Check multiple files. Returns 0 if all clean, 1 if any have problems.
pub fn check_paths(
    paths: Vec<PathBuf>,
    extra_ranges: &[(u32, u32)],
    dangerous: &HashMap<u32, String>,
) -> i32 {
    let resolved = resolve_paths(paths);

    if resolved.is_empty() {
        println!("No files to check.");
        return 0;
    }

    let mut has_error = false;
    let checked = resolved.len();

    for path in &resolved {
        let problems = check_file(path, extra_ranges, dangerous);
        if !problems.is_empty() {
            has_error = true;
            println!("\n{} contains illegal characters:", path.display());
            for p in &problems {
                println!("  {}", p);
            }
        }
    }

    if !has_error {
        println!("All {} files passed.", checked);
    }

    if has_error { 1 } else { 0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn base_charsets() -> (Vec<(u32, u32)>, HashMap<u32, String>) {
        resolve_charsets(&[], &[]).unwrap()
    }

    fn check_content(content: &str, suffix: &str) -> Vec<String> {
        let mut f = NamedTempFile::with_suffix(suffix).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        let (ranges, dangerous) = base_charsets();
        check_file(f.path(), &ranges, &dangerous)
    }

    #[test]
    fn test_ascii_passes() {
        let problems = check_content("hello world\n", ".py");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_emoji_passes() {
        let problems = check_content("x = '😀'\n", ".py");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_illegal_char_flagged() {
        // U+4F60 (你) — not in base charset
        let problems = check_content("x = '你'\n", ".py");
        assert!(!problems.is_empty());
        assert!(problems[0].contains("U+4F60"));
    }

    #[test]
    fn test_chinese_charset_allows_cjk() {
        let (ranges, dangerous) = resolve_charsets(&["chinese".to_string()], &[]).unwrap();
        let mut f = NamedTempFile::with_suffix(".py").unwrap();
        f.write_all("x = '你好'\n".as_bytes()).unwrap();
        let problems = check_file(f.path(), &ranges, &dangerous);
        assert!(problems.is_empty());
    }

    #[test]
    fn test_dangerous_char_in_code_flagged() {
        // U+202E RIGHT-TO-LEFT OVERRIDE in code
        let content = "x = 1\ny\u{202E} = 2\n";
        let problems = check_content(content, ".py");
        assert!(!problems.is_empty());
        assert!(problems[0].contains("Dangerous character in code"));
        assert!(problems[0].contains("U+202E"));
    }

    #[test]
    fn test_dangerous_char_in_comment_allowed() {
        // U+202E in a Python comment — should be allowed
        let content = "x = 1\n# \u{202E} bidi in comment\n";
        let problems = check_content(content, ".py");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_dangerous_char_in_js_line_comment_allowed() {
        let content = "const x = 1;\n// \u{202E} bidi\n";
        let problems = check_content(content, ".js");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_dangerous_char_in_rust_line_comment_allowed() {
        let content = "let x = 1;\n// \u{202E} bidi\n";
        let problems = check_content(content, ".rs");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_dangerous_char_in_rust_block_comment_allowed() {
        let content = "/* \u{202E} bidi */ let x = 1;\n";
        let problems = check_content(content, ".rs");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_dangerous_char_in_js_block_comment_allowed() {
        let content = "/* \u{202E} bidi */ const x = 1;\n";
        let problems = check_content(content, ".js");
        assert!(problems.is_empty());
    }

    #[test]
    fn test_max_5_problems_reported() {
        // 6 illegal chars — only 5 should be reported
        let content = "你好世界再见哦";
        let problems = check_content(content, ".txt");
        assert_eq!(problems.len(), 5);
    }

    #[test]
    fn test_resolve_charsets_unknown_name() {
        let result = resolve_charsets(&["nonexistent".to_string()], &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown charset"));
    }

    #[test]
    fn test_resolve_charsets_deduplication() {
        // Loading "chinese" twice shouldn't duplicate ranges
        let (r1, _) = resolve_charsets(&["chinese".to_string()], &[]).unwrap();
        let (r2, _) =
            resolve_charsets(&["chinese".to_string(), "chinese".to_string()], &[]).unwrap();
        assert_eq!(r1.len(), r2.len());
    }

    #[test]
    fn test_non_utf8_file_returns_error() {
        use std::fs;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.py");
        // Write invalid UTF-8 bytes
        fs::write(&path, b"\xFF\xFE invalid utf8").unwrap();
        let (ranges, dangerous) = base_charsets();
        let problems = check_file(&path, &ranges, &dangerous);
        assert!(!problems.is_empty());
        assert!(problems[0].contains("Failed to read file"));
    }

    #[test]
    fn test_is_in_ranges_binary_search_boundary() {
        // Verify binary search gives same answer as linear scan for boundary values
        let (ranges, _) = base_charsets();
        // Latin-1 Supplement: 0x0080–0x00FF
        assert!(is_in_ranges('\u{0080}', &ranges)); // first in range
        assert!(is_in_ranges('\u{00FF}', &ranges)); // last in range
        assert!(!is_in_ranges('\u{0100}', &ranges)); // just after (not in base charset)
    }

    #[test]
    fn test_parse_hex_invalid_propagates_error() {
        // Malformed charset JSON should return Err, not silently use 0
        let bad_json = r#"{"extra_ranges": [{"start": "0xZZZZ", "end": "0x00FF"}]}"#;
        let result: Result<CharsetData, _> = serde_json::from_str(bad_json);
        // The JSON parses fine; parse_hex error propagates through parse_ranges
        let data: CharsetData = result.unwrap();
        let range_result = parse_ranges(&data.extra_ranges);
        assert!(range_result.is_err());
        assert!(range_result.unwrap_err().contains("Invalid hex codepoint"));
    }
}
