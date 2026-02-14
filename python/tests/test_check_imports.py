"""Tests for circular import detection tool."""

import textwrap
from pathlib import Path

from apdev.check_imports import (
    ImportAnalyzer,
    build_dependency_graph,
    file_to_module,
    find_cycles,
)


def _write_module(base: Path, dotted_name: str, content: str) -> Path:
    """Helper: create a Python module file under base/src_dir structure."""
    parts = dotted_name.split(".")
    file_path = base.joinpath(*parts[:-1], parts[-1] + ".py")
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(textwrap.dedent(content))
    return file_path


def test_file_to_module_regular(tmp_path: Path) -> None:
    """Regular .py file converts to dotted module name."""
    f = tmp_path / "pkg" / "sub" / "mod.py"
    assert file_to_module(f, tmp_path) == "pkg.sub.mod"


def test_file_to_module_init(tmp_path: Path) -> None:
    """__init__.py converts to package name without __init__."""
    f = tmp_path / "pkg" / "__init__.py"
    assert file_to_module(f, tmp_path) == "pkg"


def test_import_analyzer_import() -> None:
    """ImportAnalyzer collects 'import x' statements."""
    import ast

    source = "import os\nimport pkg.sub"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer()
    analyzer.visit(tree)
    assert "os" in analyzer.imports
    assert "pkg.sub" in analyzer.imports


def test_import_analyzer_from_import() -> None:
    """ImportAnalyzer collects 'from x import y' statements."""
    import ast

    source = "from pkg.sub import something"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer()
    analyzer.visit(tree)
    assert "pkg.sub" in analyzer.imports


def test_build_graph_no_cycles(tmp_path: Path) -> None:
    """Build graph for a package with no circular imports."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("from mypkg.b import something\n")
    (src / "b.py").write_text("import os\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    assert "mypkg.b" in graph.get("mypkg.a", set())
    assert graph.get("mypkg.b", set()) == set()


def test_build_graph_with_cycle(tmp_path: Path) -> None:
    """Build graph for a package with circular imports."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("from mypkg.b import something\n")
    (src / "b.py").write_text("from mypkg.a import something\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    cycles = find_cycles(graph)
    assert len(cycles) == 1
    cycle_modules = set(cycles[0][:-1])
    assert cycle_modules == {"mypkg.a", "mypkg.b"}


def test_find_cycles_no_cycle() -> None:
    """No cycles in a DAG."""
    graph = {"a": {"b"}, "b": {"c"}, "c": set()}
    assert find_cycles(graph) == []


def test_find_cycles_self_loop() -> None:
    """Detect a self-referencing module (edge case)."""
    graph = {"a": {"a"}}
    cycles = find_cycles(graph)
    assert len(cycles) == 1


def test_find_cycles_deduplication() -> None:
    """Cycles are deduplicated regardless of starting node."""
    graph = {"a": {"b"}, "b": {"c"}, "c": {"a"}}
    cycles = find_cycles(graph)
    assert len(cycles) == 1
