"""Circular import detection tool.

Builds a module-level dependency graph within a Python package
and reports any circular import chains.
"""

from __future__ import annotations

import ast
import sys
from collections import defaultdict
from pathlib import Path


class ImportAnalyzer(ast.NodeVisitor):
    """Collect fully-qualified imports from a single Python file."""

    def __init__(self) -> None:
        self.imports: set[str] = set()

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.add(alias.name)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self.imports.add(node.module)


def file_to_module(file_path: Path, src_dir: Path) -> str:
    """Convert a file path to a dotted module name."""
    rel = file_path.relative_to(src_dir)
    parts = list(rel.parts)
    if parts[-1] == "__init__.py":
        parts = parts[:-1]
    else:
        parts[-1] = parts[-1].removesuffix(".py")
    return ".".join(parts)


def _resolve_imports(raw_imports: set[str], base_package: str) -> set[str]:
    """Filter imports to those within the base package."""
    resolved: set[str] = set()
    for imp in raw_imports:
        if imp == base_package or imp.startswith(base_package + "."):
            resolved.add(imp)
    return resolved


def build_dependency_graph(
    src_dir: Path,
    *,
    base_package: str,
) -> dict[str, set[str]]:
    """Build a module-to-module dependency graph for the given package."""
    graph: dict[str, set[str]] = defaultdict(set)

    for py_file in src_dir.rglob("*.py"):
        if "__pycache__" in py_file.parts:
            continue

        module_name = file_to_module(py_file, src_dir)
        if not module_name:
            continue

        try:
            source = py_file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(py_file))
        except Exception as e:
            print(f"Warning: could not parse {py_file}: {e}", file=sys.stderr)
            continue

        analyzer = ImportAnalyzer()
        analyzer.visit(tree)

        deps = _resolve_imports(analyzer.imports, base_package)
        deps.discard(module_name)
        graph[module_name] = deps

    return graph


def find_cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    """Find all elementary cycles in the dependency graph using DFS."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = defaultdict(int)
    path: list[str] = []
    cycles: list[list[str]] = []

    def dfs(node: str) -> None:
        color[node] = GRAY
        path.append(node)
        for neighbor in sorted(graph.get(node, set())):
            if color[neighbor] == GRAY and neighbor in path:
                idx = path.index(neighbor)
                cycle = path[idx:] + [neighbor]
                cycles.append(cycle)
            elif color[neighbor] == WHITE:
                dfs(neighbor)
        path.pop()
        color[node] = BLACK

    for node in sorted(graph):
        if color[node] == WHITE:
            dfs(node)

    # Deduplicate by normalizing cycle rotation
    unique: list[list[str]] = []
    seen: set[tuple[str, ...]] = set()
    for cycle in cycles:
        ring = cycle[:-1]
        min_idx = ring.index(min(ring))
        normalized = tuple(ring[min_idx:] + ring[:min_idx])
        if normalized not in seen:
            seen.add(normalized)
            unique.append(cycle)

    return unique


def check_circular_imports(
    src_dir: Path,
    *,
    base_package: str,
) -> int:
    """Run circular import detection. Returns 0 if clean, 1 if cycles found."""
    if not src_dir.exists():
        print(f"Error: {src_dir}/ directory not found", file=sys.stderr)
        return 1

    graph = build_dependency_graph(src_dir, base_package=base_package)
    print(f"Scanned {len(graph)} modules")

    cycles = find_cycles(graph)
    if cycles:
        print(f"\nFound {len(cycles)} circular import(s):\n")
        for i, cycle in enumerate(cycles, 1):
            print(f"  Cycle {i}: {' -> '.join(cycle)}")
        print()
        return 1

    print("No circular imports detected.")
    return 0
