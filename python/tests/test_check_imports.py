"""Tests for circular import detection tool."""

import ast
from pathlib import Path

from apdev.check_imports import (
    ImportAnalyzer,
    build_dependency_graph,
    check_circular_imports,
    file_to_module,
    find_cycles,
)


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
    source = "import os\nimport pkg.sub"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer()
    analyzer.visit(tree)
    assert "os" in analyzer.imports
    assert "pkg.sub" in analyzer.imports


def test_import_analyzer_from_import() -> None:
    """ImportAnalyzer collects 'from x import y' statements."""
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


# ---------------------------------------------------------------------------
# Relative import tests
# ---------------------------------------------------------------------------


def test_import_analyzer_relative_from_dot_module() -> None:
    """'from .b import x' in mypkg.a resolves to mypkg.b."""
    source = "from .b import something"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer(current_module="mypkg.a", is_package=False)
    analyzer.visit(tree)
    assert "mypkg.b" in analyzer.imports


def test_import_analyzer_relative_from_dot_import() -> None:
    """'from . import b' in mypkg.a resolves to mypkg.b."""
    source = "from . import b"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer(current_module="mypkg.a", is_package=False)
    analyzer.visit(tree)
    assert "mypkg.b" in analyzer.imports


def test_import_analyzer_relative_dotdot() -> None:
    """'from ..c import x' in mypkg.sub.a resolves to mypkg.c."""
    source = "from ..c import something"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer(current_module="mypkg.sub.a", is_package=False)
    analyzer.visit(tree)
    assert "mypkg.c" in analyzer.imports


def test_import_analyzer_relative_in_package() -> None:
    """'from .b import x' in mypkg.__init__ (package) resolves to mypkg.b."""
    source = "from .b import something"
    tree = ast.parse(source)
    analyzer = ImportAnalyzer(current_module="mypkg", is_package=True)
    analyzer.visit(tree)
    assert "mypkg.b" in analyzer.imports


def test_build_graph_relative_import_cycle(tmp_path: Path) -> None:
    """Relative imports should be detected and form cycles."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("from .b import something\n")
    (src / "b.py").write_text("from .a import something\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    assert "mypkg.b" in graph.get("mypkg.a", set())
    assert "mypkg.a" in graph.get("mypkg.b", set())

    cycles = find_cycles(graph)
    assert len(cycles) == 1
    cycle_modules = set(cycles[0][:-1])
    assert cycle_modules == {"mypkg.a", "mypkg.b"}


def test_build_graph_relative_no_cycle(tmp_path: Path) -> None:
    """Relative imports without a cycle should not report cycles."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("from .b import something\n")
    (src / "b.py").write_text("import os\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    assert "mypkg.b" in graph.get("mypkg.a", set())
    cycles = find_cycles(graph)
    assert cycles == []


def test_build_graph_relative_from_subpackage(tmp_path: Path) -> None:
    """Relative imports in a sub-package resolve correctly."""
    pkg = tmp_path / "mypkg"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    sub = pkg / "sub"
    sub.mkdir()
    (sub / "__init__.py").write_text("")
    (sub / "a.py").write_text("from .b import something\n")
    (sub / "b.py").write_text("from .a import something\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    assert "mypkg.sub.b" in graph.get("mypkg.sub.a", set())
    assert "mypkg.sub.a" in graph.get("mypkg.sub.b", set())

    cycles = find_cycles(graph)
    assert len(cycles) == 1


def test_check_reports_missing_src_dir(tmp_path: Path, capsys) -> None:
    """A missing src directory is an error, not a clean result."""
    assert check_circular_imports(tmp_path / "nope", base_package="pkg") == 1
    assert "directory not found" in capsys.readouterr().err


def test_check_reports_missing_package(tmp_path: Path, capsys) -> None:
    """A wrong --package name must fail instead of reporting no cycles."""
    (tmp_path / "other").mkdir()
    (tmp_path / "other" / "__init__.py").write_text("", encoding="utf-8")

    assert check_circular_imports(tmp_path, base_package="nope") == 1
    assert "not found under" in capsys.readouterr().err


def test_check_reports_empty_package_instead_of_passing(tmp_path: Path, capsys) -> None:
    """An empty package directory previously reported a clean scan."""
    package = tmp_path / "pkg"
    package.mkdir()
    (package / "notes.txt").write_text("no python here", encoding="utf-8")

    assert check_circular_imports(tmp_path, base_package="pkg") == 1
    captured = capsys.readouterr()
    assert "nothing was checked" in captured.err


def test_check_passes_for_a_clean_package(tmp_path: Path, capsys) -> None:
    """A package without cycles exits 0 and reports the module count."""
    package = tmp_path / "pkg"
    package.mkdir()
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "mod.py").write_text("from pkg import util\n", encoding="utf-8")
    (package / "util.py").write_text("VALUE = 1\n", encoding="utf-8")

    assert check_circular_imports(tmp_path, base_package="pkg") == 0
    assert "No circular imports detected" in capsys.readouterr().out


def test_check_reports_cycles(tmp_path: Path, capsys) -> None:
    """A real cycle exits 1 and names the modules involved."""
    package = tmp_path / "pkg"
    package.mkdir()
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "a.py").write_text("from pkg import b\n", encoding="utf-8")
    (package / "b.py").write_text("from pkg import a\n", encoding="utf-8")

    assert check_circular_imports(tmp_path, base_package="pkg") == 1
    assert "circular import" in capsys.readouterr().out


def test_analyzer_records_from_package_import_submodule() -> None:
    """``from pkg import sub`` must record pkg.sub, not only pkg."""
    tree = ast.parse("from pkg import sub\n")
    analyzer = ImportAnalyzer(current_module="pkg.mod", is_package=False)
    analyzer.visit(tree)
    assert "pkg" in analyzer.imports
    assert "pkg.sub" in analyzer.imports


def test_analyzer_skips_star_import_submodule() -> None:
    """``from pkg import *`` must not invent a pkg.* dependency."""
    tree = ast.parse("from pkg import *\n")
    analyzer = ImportAnalyzer(current_module="pkg.mod", is_package=False)
    analyzer.visit(tree)
    assert "pkg" in analyzer.imports
    assert "pkg.*" not in analyzer.imports
