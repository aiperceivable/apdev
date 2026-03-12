//! Circular import detection tool.
//!
//! Builds a module-level dependency graph within a Python package
//! and reports any circular import chains.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Convert a file path to a dotted module name relative to src_dir.
///
/// Returns `None` if the path is not under src_dir or has no meaningful name.
/// Mirrors Python's `file_to_module(file_path, src_dir)`.
pub fn file_to_module(file_path: &Path, src_dir: &Path) -> Option<String> {
    let rel = file_path.strip_prefix(src_dir).ok()?;

    let mut parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();

    if parts.is_empty() {
        return None;
    }

    if parts.last().map(|s| s.as_str()) == Some("__init__.py") {
        parts.pop();
    } else if let Some(last) = parts.last_mut() {
        if let Some(stem) = last.strip_suffix(".py") {
            *last = stem.to_string();
        }
    }

    if parts.is_empty() {
        return None;
    }

    Some(parts.join("."))
}

/// Count non-overlapping occurrences of `pattern` in `s`.
fn count_non_overlapping(s: &str, pattern: &str) -> usize {
    let mut count = 0;
    let mut start = 0;
    while let Some(pos) = s[start..].find(pattern) {
        count += 1;
        start += pos + pattern.len();
    }
    count
}

/// Strip an inline Python comment (everything from `#` onward),
/// respecting simple single and double quoted strings.
fn strip_line_comment(line: &str) -> &str {
    let mut in_single = false;
    let mut in_double = false;

    for (byte_pos, ch) in line.char_indices() {
        match ch {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            '#' if !in_single && !in_double => return &line[..byte_pos],
            _ => {}
        }
    }
    line
}

/// Parse a (possibly multi-line, already joined) import statement and add
/// the resolved module names to `imports`.
///
/// Mirrors Python's `ImportAnalyzer.visit_Import` and `visit_ImportFrom`.
fn parse_import_stmt(
    stmt: &str,
    current_module: &str,
    is_package: bool,
    imports: &mut HashSet<String>,
) {
    // Normalize: remove parens (from multi-line / parenthesized imports)
    let stmt_clean: String = stmt.chars().filter(|&c| c != '(' && c != ')').collect();
    let stmt = stmt_clean.trim();

    if let Some(rest) = stmt.strip_prefix("import ") {
        // `import foo, bar.baz as b, qux`
        for part in rest.split(',') {
            let part = part.trim();
            let module = if let Some(as_pos) = part.find(" as ") {
                part[..as_pos].trim()
            } else {
                part.split_whitespace().next().unwrap_or("").trim()
            };
            if !module.is_empty() {
                imports.insert(module.to_string());
            }
        }
    } else if let Some(rest) = stmt.strip_prefix("from ") {
        // `from foo import bar` / `from . import foo, bar` / `from ..foo import baz`
        if let Some(import_pos) = rest.find(" import ") {
            let from_part = rest[..import_pos].trim();
            let names_part = &rest[import_pos + " import ".len()..];

            // Count leading dots (relative import level)
            let level = from_part.chars().take_while(|&c| c == '.').count();
            let module_part = from_part[level..].trim();

            if level > 0 {
                // Relative import – resolve against current_module
                let parts: Vec<&str> = current_module.split('.').collect();
                // For a package (__init__.py) the package is the module itself;
                // for a regular module the package is the parent.
                let levels_to_strip = if is_package {
                    level.saturating_sub(1)
                } else {
                    level
                };

                let base_parts: Vec<String> = if levels_to_strip == 0 {
                    parts.iter().map(|s| s.to_string()).collect()
                } else if levels_to_strip < parts.len() {
                    parts[..parts.len() - levels_to_strip]
                        .iter()
                        .map(|s| s.to_string())
                        .collect()
                } else {
                    vec![]
                };

                if !module_part.is_empty() {
                    // `from .foo import bar` → base_parts + ["foo"]
                    let mut resolved = base_parts;
                    for p in module_part.split('.') {
                        if !p.is_empty() {
                            resolved.push(p.to_string());
                        }
                    }
                    imports.insert(resolved.join("."));
                } else {
                    // `from . import foo, bar` → base_parts + [each name]
                    for name_part in names_part.split(',') {
                        let name = if let Some(as_pos) = name_part.find(" as ") {
                            name_part[..as_pos].trim()
                        } else {
                            name_part.trim().split_whitespace().next().unwrap_or("").trim()
                        };
                        if !name.is_empty() && name != "*" {
                            let mut resolved = base_parts.clone();
                            resolved.push(name.to_string());
                            imports.insert(resolved.join("."));
                        }
                    }
                }
            } else if !module_part.is_empty() {
                // Absolute: `from foo.bar import baz`
                imports.insert(module_part.to_string());
            }
        }
    }
}

/// State machine for parsing imports from a Python source file.
///
/// Accumulates multi-line import statements across calls to `process_line`,
/// handling both backslash continuation and parenthesised imports.
struct ImportParser<'a> {
    current_module: &'a str,
    is_package: bool,
    buffer: String,
    paren_depth: i32,
}

impl<'a> ImportParser<'a> {
    fn new(current_module: &'a str, is_package: bool) -> Self {
        Self {
            current_module,
            is_package,
            buffer: String::new(),
            paren_depth: 0,
        }
    }

    /// Process one code line (already stripped of comments and triple-string content).
    fn process_line(&mut self, line: &str, imports: &mut HashSet<String>) {
        if line.is_empty() {
            return;
        }

        if !self.buffer.is_empty() || self.paren_depth > 0 {
            // Continuing a multi-line import
            let prev = self.buffer.trim_end_matches('\\').to_string();
            self.buffer = format!("{} {}", prev, line.trim_end_matches('\\'));

            for c in line.chars() {
                match c {
                    '(' => self.paren_depth += 1,
                    ')' => self.paren_depth -= 1,
                    _ => {}
                }
            }

            if self.paren_depth <= 0 && !self.buffer.ends_with('\\') {
                let stmt = std::mem::take(&mut self.buffer);
                self.paren_depth = 0;
                parse_import_stmt(&stmt, self.current_module, self.is_package, imports);
            }
            return;
        }

        // Check for new import statement
        if line.starts_with("import ") || line.starts_with("from ") {
            for c in line.chars() {
                match c {
                    '(' => self.paren_depth += 1,
                    ')' => self.paren_depth -= 1,
                    _ => {}
                }
            }

            let stmt = line.trim_end_matches('\\');
            if self.paren_depth > 0 || line.ends_with('\\') {
                self.buffer = stmt.to_string();
            } else {
                self.paren_depth = 0;
                parse_import_stmt(stmt, self.current_module, self.is_package, imports);
            }
        }
    }

    /// Flush any incomplete buffered statement at end of file.
    fn flush(&mut self, imports: &mut HashSet<String>) {
        if !self.buffer.is_empty() {
            let stmt = std::mem::take(&mut self.buffer);
            parse_import_stmt(&stmt, self.current_module, self.is_package, imports);
        }
    }
}

/// Extract all import module names from Python source content.
///
/// Uses a line-by-line state machine that tracks triple-quoted strings
/// and delegates multi-line import assembly to `ImportParser`.
fn extract_imports(content: &str, current_module: &str, is_package: bool) -> HashSet<String> {
    let mut imports = HashSet::new();
    let mut in_triple_double = false;
    let mut in_triple_single = false;
    let mut parser = ImportParser::new(current_module, is_package);

    for line in content.lines() {
        // Handle ongoing triple-string state
        if in_triple_double {
            if line.contains("\"\"\"") {
                in_triple_double = false;
            }
            continue;
        }
        if in_triple_single {
            if line.contains("'''") {
                in_triple_single = false;
            }
            continue;
        }

        let code_part = strip_line_comment(line);

        // Check if this line opens a triple-quoted string (odd count = unclosed)
        let td_count = count_non_overlapping(code_part, "\"\"\"");
        let ts_count = count_non_overlapping(code_part, "'''");

        if td_count % 2 == 1 {
            let before = code_part.find("\"\"\"").map_or(code_part, |p| &code_part[..p]);
            in_triple_double = true;
            parser.process_line(before.trim(), &mut imports);
            continue;
        }

        if ts_count % 2 == 1 {
            let before = code_part.find("'''").map_or(code_part, |p| &code_part[..p]);
            in_triple_single = true;
            parser.process_line(before.trim(), &mut imports);
            continue;
        }

        parser.process_line(code_part.trim(), &mut imports);
    }

    parser.flush(&mut imports);
    imports
}

/// Filter imports to those within the base package.
fn resolve_imports(raw_imports: &HashSet<String>, base_package: &str) -> HashSet<String> {
    let prefix = format!("{}.", base_package);
    raw_imports
        .iter()
        .filter(|imp| *imp == base_package || imp.starts_with(&prefix))
        .cloned()
        .collect()
}

/// Recursively find all .py files under `dir`, skipping __pycache__.
fn find_py_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();

    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(r) => r.filter_map(|e| e.ok()).collect(),
        Err(_) => return files,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str == "__pycache__" {
            continue;
        }

        if path.is_dir() {
            files.extend(find_py_files(&path));
        } else if path.is_file() && name_str.ends_with(".py") {
            files.push(path);
        }
    }

    files
}

/// Build a module-to-module dependency graph for the given Python package.
pub fn build_dependency_graph(
    src_dir: &Path,
    base_package: &str,
) -> HashMap<String, HashSet<String>> {
    let mut graph: HashMap<String, HashSet<String>> = HashMap::new();

    for py_file in find_py_files(src_dir) {
        let module_name = match file_to_module(&py_file, src_dir) {
            Some(m) => m,
            None => continue,
        };

        let source = match std::fs::read_to_string(&py_file) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Warning: could not parse {}: {}", py_file.display(), e);
                continue;
            }
        };

        let is_package = py_file.file_name().and_then(|n| n.to_str()) == Some("__init__.py");

        let raw_imports = extract_imports(&source, &module_name, is_package);
        let mut deps = resolve_imports(&raw_imports, base_package);
        deps.remove(&module_name);
        graph.insert(module_name, deps);
    }

    graph
}

/// DFS helper for cycle detection.
fn dfs(
    node: &str,
    graph: &HashMap<String, HashSet<String>>,
    color: &mut HashMap<String, u8>,
    path: &mut Vec<String>,
    cycles: &mut Vec<Vec<String>>,
) {
    const GRAY: u8 = 1;
    const BLACK: u8 = 2;

    color.insert(node.to_string(), GRAY);
    path.push(node.to_string());

    // Collect and sort neighbors for deterministic output
    let mut neighbors: Vec<String> = graph
        .get(node)
        .map(|s| s.iter().cloned().collect())
        .unwrap_or_default();
    neighbors.sort();

    for neighbor in &neighbors {
        let neighbor_color = *color.get(neighbor.as_str()).unwrap_or(&0);
        if neighbor_color == GRAY && path.contains(neighbor) {
            let idx = path.iter().position(|n| n == neighbor).unwrap();
            let mut cycle = path[idx..].to_vec();
            cycle.push(neighbor.clone());
            cycles.push(cycle);
        } else if neighbor_color == 0 {
            dfs(neighbor, graph, color, path, cycles);
        }
    }

    path.pop();
    color.insert(node.to_string(), BLACK);
}

/// Find all elementary cycles in the dependency graph using DFS.
/// Deduplicates by normalizing cycle rotation (matches Python impl).
pub fn find_cycles(graph: &HashMap<String, HashSet<String>>) -> Vec<Vec<String>> {
    let mut color: HashMap<String, u8> = HashMap::new();
    let mut path: Vec<String> = Vec::new();
    let mut cycles: Vec<Vec<String>> = Vec::new();

    let mut nodes: Vec<String> = graph.keys().cloned().collect();
    nodes.sort();

    for node in &nodes {
        if *color.get(node.as_str()).unwrap_or(&0) == 0 {
            dfs(node, graph, &mut color, &mut path, &mut cycles);
        }
    }

    // Deduplicate by normalizing cycle rotation
    let mut unique: Vec<Vec<String>> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for cycle in cycles {
        let ring = &cycle[..cycle.len() - 1];
        let min_idx = ring
            .iter()
            .enumerate()
            .min_by_key(|(_, s)| s.as_str())
            .map(|(i, _)| i)
            .unwrap_or(0);
        let normalized: Vec<&str> = ring[min_idx..]
            .iter()
            .chain(ring[..min_idx].iter())
            .map(|s| s.as_str())
            .collect();
        let key = normalized.join(",");
        if !seen.contains(&key) {
            seen.insert(key);
            unique.push(cycle);
        }
    }

    unique
}

/// Run circular import detection. Returns 0 if clean, 1 if cycles found or error.
pub fn check_circular_imports(src_dir: PathBuf, base_package: &str) -> i32 {
    if !src_dir.exists() {
        eprintln!("Error: {}/ directory not found", src_dir.display());
        return 1;
    }

    let graph = build_dependency_graph(&src_dir, base_package);
    println!("Scanned {} modules", graph.len());

    let cycles = find_cycles(&graph);
    if !cycles.is_empty() {
        println!("\nFound {} circular import(s):\n", cycles.len());
        for (i, cycle) in cycles.iter().enumerate() {
            println!("  Cycle {}: {}", i + 1, cycle.join(" -> "));
        }
        println!();
        return 1;
    }

    println!("No circular imports detected.");
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;
    use tempfile::TempDir;

    // ── file_to_module ────────────────────────────────────────────────────────

    #[test]
    fn test_file_to_module_regular() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path();
        let file = src.join("mypackage").join("utils.py");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "").unwrap();
        assert_eq!(file_to_module(&file, src), Some("mypackage.utils".to_string()));
    }

    #[test]
    fn test_file_to_module_init() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path();
        let file = src.join("mypackage").join("__init__.py");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "").unwrap();
        assert_eq!(file_to_module(&file, src), Some("mypackage".to_string()));
    }

    #[test]
    fn test_file_to_module_nested() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path();
        let file = src.join("pkg").join("sub").join("mod.py");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "").unwrap();
        assert_eq!(file_to_module(&file, src), Some("pkg.sub.mod".to_string()));
    }

    #[test]
    fn test_file_to_module_outside_src_returns_none() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let outside = tmp.path().join("other").join("mod.py");
        fs::create_dir_all(outside.parent().unwrap()).unwrap();
        fs::write(&outside, "").unwrap();
        assert_eq!(file_to_module(&outside, &src), None);
    }

    // ── build_dependency_graph ────────────────────────────────────────────────

    fn make_pkg(tmp: &TempDir, files: &[(&str, &str)]) -> PathBuf {
        let src = tmp.path().to_path_buf();
        for (rel, content) in files {
            let full = src.join(rel);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(&full, content).unwrap();
        }
        src
    }

    #[test]
    fn test_no_circular_imports() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                ("pkg/a.py", "from pkg import b\n"),
                ("pkg/b.py", ""),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let cycles = find_cycles(&graph);
        assert!(cycles.is_empty());
    }

    #[test]
    fn test_direct_circular_import() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                // Use dotted absolute imports so the submodule is tracked
                ("pkg/a.py", "from pkg.b import something\n"),
                ("pkg/b.py", "from pkg.a import something\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let cycles = find_cycles(&graph);
        assert_eq!(cycles.len(), 1);
        let cycle = &cycles[0];
        assert!(cycle.contains(&"pkg.a".to_string()));
        assert!(cycle.contains(&"pkg.b".to_string()));
    }

    #[test]
    fn test_relative_import_resolution() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                ("pkg/a.py", "from .b import something\n"),
                ("pkg/b.py", "from .a import something\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let cycles = find_cycles(&graph);
        assert_eq!(cycles.len(), 1);
    }

    #[test]
    fn test_external_imports_ignored() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                ("pkg/a.py", "import os\nimport sys\nfrom pathlib import Path\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let deps = graph.get("pkg.a").unwrap();
        assert!(deps.is_empty());
    }

    #[test]
    fn test_multiline_import_paren() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                (
                    "pkg/a.py",
                    "from pkg import (\n    b,\n    c\n)\nfrom pkg.b import x\nfrom pkg.c import y\n",
                ),
                ("pkg/b.py", ""),
                ("pkg/c.py", "from pkg.a import something\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let a_deps = graph.get("pkg.a").unwrap();
        assert!(a_deps.contains("pkg.b"), "a should depend on pkg.b");
        assert!(a_deps.contains("pkg.c"), "a should depend on pkg.c");
    }

    #[test]
    fn test_cycle_deduplication() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                ("pkg/a.py", "from pkg.b import something\n"),
                ("pkg/b.py", "from pkg.a import something\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let cycles = find_cycles(&graph);
        // Should report exactly 1 cycle (not 2 rotations of the same cycle)
        assert_eq!(cycles.len(), 1);
    }

    #[test]
    fn test_find_cycles_empty_graph() {
        let graph: HashMap<String, HashSet<String>> = HashMap::new();
        let cycles = find_cycles(&graph);
        assert!(cycles.is_empty());
    }

    #[test]
    fn test_imports_in_triple_string_ignored() {
        let tmp = TempDir::new().unwrap();
        let src = make_pkg(
            &tmp,
            &[
                ("pkg/__init__.py", ""),
                (
                    "pkg/a.py",
                    r#"
"""
import pkg.b  # inside docstring, should be ignored
"""
x = 1
"#,
                ),
                ("pkg/b.py", "from pkg.a import something\n"),
            ],
        );
        let graph = build_dependency_graph(&src, "pkg");
        let a_deps = graph.get("pkg.a").unwrap();
        assert!(
            !a_deps.contains("pkg.b"),
            "import inside docstring should be ignored"
        );
    }
}
