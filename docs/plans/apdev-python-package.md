# apdev Python Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform apdev into a multi-language monorepo and ship the Python package (`pip install apdev`) with CLI tools for character validation and circular import detection.

**Architecture:** Monorepo with language-specific subdirectories (`python/`, `ts/`, `go/`). Python package uses `src` layout with a unified `apdev` CLI entry point and subcommands. Tools are configurable via CLI args and `[tool.apdev]` in the consumer's `pyproject.toml`. Pre-commit hook support built-in.

**Tech Stack:** Python 3.10+, argparse (stdlib), ast (stdlib), tomllib/tomli (TOML parsing), pytest (testing)

---

## Task 1: Repository Initialization & Monorepo Structure

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `python/` directory structure

**Step 1: Initialize git repository**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev && git init`
Expected: Initialized empty Git repository

**Step 2: Create root `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.eggs/
*.egg
.venv/
venv/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
.pytest_cache/
.coverage
htmlcov/

# TypeScript (future)
node_modules/

# Go (future)
bin/
```

**Step 3: Create monorepo directory structure**

```bash
mkdir -p python/src/apdev
mkdir -p python/tests
```

Verify layout:
```
apdev/
├── .gitignore
├── README.md
├── python/
│   ├── src/
│   │   └── apdev/
│   └── tests/
├── docs/
│   └── plans/
└── .claude/
```

**Step 4: Commit**

```bash
git add .gitignore README.md python/ docs/
git commit -m "chore: initialize monorepo structure for multi-language apdev"
```

---

## Task 2: Python Package Skeleton

**Files:**
- Create: `python/pyproject.toml`
- Create: `python/src/apdev/__init__.py`
- Create: `python/src/apdev/py.typed`
- Create: `python/tests/__init__.py`

**Step 1: Create `python/pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "apdev"
version = "0.1.0"
description = "Shared development tools for Python projects - character validation, circular import detection, and more"
readme = "README.md"
license = "MIT"
requires-python = ">=3.10"
authors = [
    { name = "aipartnerup" },
]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "Topic :: Software Development :: Quality Assurance",
    "Topic :: Software Development :: Testing",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Programming Language :: Python :: 3.13",
]
dependencies = [
    "tomli>=1.1.0;python_version<'3.11'",
]

[project.scripts]
apdev = "apdev.cli:main"

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "ruff>=0.1.0",
]

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
target-version = "py310"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "W"]
```

**Step 2: Create `python/src/apdev/__init__.py`**

```python
"""apdev - Shared development tools for Python projects."""

__version__ = "0.1.0"
```

**Step 3: Create `python/src/apdev/py.typed`**

Empty file (PEP 561 marker for typed package).

**Step 4: Create `python/tests/__init__.py`**

Empty file.

**Step 5: Verify package installs in dev mode**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pip install -e ".[dev]"`
Expected: Successfully installed apdev-0.1.0

Run: `python -c "import apdev; print(apdev.__version__)"`
Expected: `0.1.0`

**Step 6: Commit**

```bash
git add python/pyproject.toml python/src/ python/tests/
git commit -m "chore: add Python package skeleton with pyproject.toml"
```

---

## Task 3: Configuration Reader

The config reader loads settings from the consumer project's `pyproject.toml` under `[tool.apdev]`. This lets each project (apflow, apcore) declare its settings once.

**Files:**
- Create: `python/tests/test_config.py`
- Create: `python/src/apdev/config.py`

**Step 1: Write the failing tests**

```python
"""Tests for apdev configuration loading."""

import textwrap
from pathlib import Path

from apdev.config import load_config


def test_load_config_from_pyproject(tmp_path: Path) -> None:
    """Load [tool.apdev] section from pyproject.toml."""
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        textwrap.dedent("""\
        [tool.apdev]
        base_package = "myproject"
        src_dir = "src"
        """)
    )
    cfg = load_config(tmp_path)
    assert cfg["base_package"] == "myproject"
    assert cfg["src_dir"] == "src"


def test_load_config_missing_file(tmp_path: Path) -> None:
    """Return empty dict when pyproject.toml does not exist."""
    cfg = load_config(tmp_path)
    assert cfg == {}


def test_load_config_no_apdev_section(tmp_path: Path) -> None:
    """Return empty dict when [tool.apdev] section is absent."""
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        textwrap.dedent("""\
        [project]
        name = "something"
        """)
    )
    cfg = load_config(tmp_path)
    assert cfg == {}


def test_load_config_extra_fields(tmp_path: Path) -> None:
    """Preserve all fields from [tool.apdev]."""
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        textwrap.dedent("""\
        [tool.apdev]
        base_package = "myproject"
        custom_key = "custom_value"
        """)
    )
    cfg = load_config(tmp_path)
    assert cfg["base_package"] == "myproject"
    assert cfg["custom_key"] == "custom_value"
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apdev.config'`

**Step 3: Write minimal implementation**

```python
"""Configuration loading for apdev.

Reads [tool.apdev] from the consumer project's pyproject.toml.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

if sys.version_info >= (3, 11):
    import tomllib
else:
    try:
        import tomllib
    except ModuleNotFoundError:
        import tomli as tomllib  # type: ignore[no-redef]


def load_config(project_dir: Path | None = None) -> dict[str, Any]:
    """Load apdev configuration from pyproject.toml.

    Looks for [tool.apdev] section in the pyproject.toml file
    located at ``project_dir``. Returns an empty dict if the file
    or section does not exist.
    """
    if project_dir is None:
        project_dir = Path.cwd()

    pyproject_path = project_dir / "pyproject.toml"
    if not pyproject_path.is_file():
        return {}

    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)

    return data.get("tool", {}).get("apdev", {})
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_config.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add python/src/apdev/config.py python/tests/test_config.py
git commit -m "feat: add configuration reader for [tool.apdev] in pyproject.toml"
```

---

## Task 4: check-chars Tool

Port `check_allowed_chars.py` to the package with configurable character ranges.

**Files:**
- Create: `python/tests/test_check_chars.py`
- Create: `python/src/apdev/check_chars.py`

**Step 1: Write the failing tests**

```python
"""Tests for character validation tool."""

from pathlib import Path

from apdev.check_chars import is_allowed_char, check_file, check_paths


def test_ascii_chars_allowed() -> None:
    """All standard ASCII characters (0-127) should be allowed."""
    for i in range(128):
        assert is_allowed_char(chr(i)), f"ASCII {i} should be allowed"


def test_common_emoji_allowed() -> None:
    """Common emoji characters should be allowed."""
    emojis = ["\U0001f600", "\U0001f680", "\u2705", "\u2b50"]  # grinning, rocket, check, star
    for emoji in emojis:
        assert is_allowed_char(emoji), f"{emoji!r} should be allowed"


def test_box_drawing_allowed() -> None:
    """Box-drawing characters used in docs should be allowed."""
    chars = ["\u2500", "\u2502", "\u251c", "\u2514"]  # horizontal, vertical, tee, corner
    for ch in chars:
        assert is_allowed_char(ch), f"{ch!r} (U+{ord(ch):04X}) should be allowed"


def test_arrow_chars_allowed() -> None:
    """Arrow characters should be allowed."""
    assert is_allowed_char("\u2192")  # rightwards arrow
    assert is_allowed_char("\u2190")  # leftwards arrow


def test_chinese_chars_rejected() -> None:
    """CJK characters should be rejected by default."""
    assert not is_allowed_char("\u4e2d")  # Chinese character


def test_check_file_clean(tmp_path: Path) -> None:
    """File with only ASCII content should pass."""
    f = tmp_path / "clean.py"
    f.write_text("print('hello world')\n", encoding="utf-8")
    problems = check_file(f)
    assert problems == []


def test_check_file_with_illegal_chars(tmp_path: Path) -> None:
    """File with CJK characters should report problems."""
    f = tmp_path / "bad.py"
    f.write_text("x = '\u4e2d\u6587'\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) > 0
    assert "U+4E2D" in problems[0]


def test_check_file_max_problems(tmp_path: Path) -> None:
    """Should report at most 5 problems per file."""
    f = tmp_path / "many.py"
    # 10 CJK characters
    f.write_text("\u4e00\u4e01\u4e02\u4e03\u4e04\u4e05\u4e06\u4e07\u4e08\u4e09", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 5


def test_check_file_nonexistent(tmp_path: Path) -> None:
    """Non-existent file should report a read error."""
    problems = check_file(tmp_path / "nope.py")
    assert len(problems) == 1
    assert "Failed to read" in problems[0]


def test_check_paths_returns_exit_code(tmp_path: Path) -> None:
    """check_paths returns 0 for clean files, 1 for files with problems."""
    clean = tmp_path / "ok.py"
    clean.write_text("x = 1\n", encoding="utf-8")
    assert check_paths([clean]) == 0

    bad = tmp_path / "bad.py"
    bad.write_text("x = '\u4e2d'\n", encoding="utf-8")
    assert check_paths([bad]) == 1
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_check_chars.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'apdev.check_chars'`

**Step 3: Write minimal implementation**

```python
"""Character validation tool.

Checks that files contain only allowed characters: ASCII, common emoji,
and standard technical symbols (arrows, box-drawing, math operators, etc.).
"""

from __future__ import annotations

from pathlib import Path

# Allowed Unicode ranges beyond ASCII (0-127)
EMOJI_RANGES: list[tuple[int, int]] = [
    (0x1F300, 0x1F5FF),  # Symbols and Pictographs
    (0x1F600, 0x1F64F),  # Emoticons
    (0x1F680, 0x1F6FF),  # Transport and Map Symbols
    (0x1F780, 0x1F7FF),  # Geometric Shapes Extended
    (0x1F900, 0x1F9FF),  # Supplemental Symbols and Pictographs
    (0x2600, 0x26FF),    # Miscellaneous Symbols
    (0x2700, 0x27BF),    # Dingbats
]

EXTRA_ALLOWED_RANGES: list[tuple[int, int]] = [
    (0x0080, 0x00FF),  # Latin-1 Supplement
    (0x2000, 0x206F),  # General Punctuation
    (0x2100, 0x214F),  # Letterlike Symbols
    (0x2190, 0x21FF),  # Arrows
    (0x2200, 0x22FF),  # Mathematical Operators
    (0x2300, 0x23FF),  # Miscellaneous Technical
    (0x2500, 0x257F),  # Box Drawing
    (0x25A0, 0x25FF),  # Geometric Shapes
    (0x2B00, 0x2BFF),  # Miscellaneous Symbols and Arrows
    (0xFE00, 0xFE0F),  # Variation Selectors
]

_ALL_RANGES = EMOJI_RANGES + EXTRA_ALLOWED_RANGES


def is_allowed_char(c: str) -> bool:
    """Return True if the character is in the allowed set."""
    code = ord(c)
    if code <= 127:
        return True
    for start, end in _ALL_RANGES:
        if start <= code <= end:
            return True
    return False


def check_file(path: Path, *, max_problems: int = 5) -> list[str]:
    """Check a single file for illegal characters.

    Returns a list of problem descriptions (empty if the file is clean).
    """
    problems: list[str] = []
    try:
        content = path.read_text(encoding="utf-8")
        for i, char in enumerate(content, 1):
            if not is_allowed_char(char):
                problems.append(
                    f"Illegal character at position {i}: {char!r} (U+{ord(char):04X})"
                )
                if len(problems) >= max_problems:
                    break
    except Exception as e:
        problems.append(f"Failed to read file: {e}")
    return problems


def check_paths(paths: list[Path]) -> int:
    """Check multiple files. Returns 0 if all clean, 1 if any have problems."""
    has_error = False
    for path in paths:
        problems = check_file(path)
        if problems:
            has_error = True
            print(f"\n{path} contains illegal characters:")
            for p in problems:
                print(f"  {p}")
    return 1 if has_error else 0
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_check_chars.py -v`
Expected: 10 passed

**Step 5: Commit**

```bash
git add python/src/apdev/check_chars.py python/tests/test_check_chars.py
git commit -m "feat: add check-chars tool for character validation"
```

---

## Task 5: check-imports Tool

Port `detect_circular_imports.py` with configurable package name and source directory.

**Files:**
- Create: `python/tests/test_check_imports.py`
- Create: `python/src/apdev/check_imports.py`

**Step 1: Write the failing tests**

```python
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
    (src / "a.py").write_text("from mypkg import b\n")
    (src / "b.py").write_text("import os\n")

    graph = build_dependency_graph(tmp_path, base_package="mypkg")
    assert "mypkg.b" in graph.get("mypkg.a", set())
    assert graph.get("mypkg.b", set()) == set()


def test_build_graph_with_cycle(tmp_path: Path) -> None:
    """Build graph for a package with circular imports."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("from mypkg import b\n")
    (src / "b.py").write_text("from mypkg import a\n")

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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_check_imports.py -v`
Expected: FAIL with `ModuleNotFoundError`

**Step 3: Write minimal implementation**

```python
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
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_check_imports.py -v`
Expected: 9 passed

**Step 5: Commit**

```bash
git add python/src/apdev/check_imports.py python/tests/test_check_imports.py
git commit -m "feat: add check-imports tool for circular import detection"
```

---

## Task 6: Unified CLI Entry Point

Wire everything together with `apdev` CLI using argparse subcommands.

**Files:**
- Create: `python/tests/test_cli.py`
- Create: `python/src/apdev/cli.py`
- Create: `python/src/apdev/__main__.py`

**Step 1: Write the failing tests**

```python
"""Tests for the apdev CLI."""

import subprocess
import sys
import textwrap
from pathlib import Path


def run_apdev(*args: str, cwd: str | Path | None = None) -> subprocess.CompletedProcess[str]:
    """Run apdev CLI as a subprocess."""
    return subprocess.run(
        [sys.executable, "-m", "apdev", *args],
        capture_output=True,
        text=True,
        cwd=cwd,
    )


def test_cli_version() -> None:
    """apdev --version prints version."""
    result = run_apdev("--version")
    assert result.returncode == 0
    assert "0.1.0" in result.stdout


def test_cli_help() -> None:
    """apdev --help shows subcommands."""
    result = run_apdev("--help")
    assert result.returncode == 0
    assert "check-chars" in result.stdout
    assert "check-imports" in result.stdout


def test_cli_check_chars_clean(tmp_path: Path) -> None:
    """apdev check-chars returns 0 for clean files."""
    f = tmp_path / "ok.py"
    f.write_text("x = 1\n")
    result = run_apdev("check-chars", str(f))
    assert result.returncode == 0


def test_cli_check_chars_dirty(tmp_path: Path) -> None:
    """apdev check-chars returns 1 for files with illegal chars."""
    f = tmp_path / "bad.py"
    f.write_text("x = '\u4e2d'\n")
    result = run_apdev("check-chars", str(f))
    assert result.returncode == 1
    assert "illegal characters" in result.stdout.lower()


def test_cli_check_imports_with_args(tmp_path: Path) -> None:
    """apdev check-imports --package/--src-dir works."""
    src = tmp_path / "mypkg"
    src.mkdir()
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("import os\n")

    result = run_apdev(
        "check-imports",
        "--package", "mypkg",
        "--src-dir", str(tmp_path),
    )
    assert result.returncode == 0
    assert "No circular imports" in result.stdout


def test_cli_check_imports_reads_config(tmp_path: Path) -> None:
    """apdev check-imports reads [tool.apdev] from pyproject.toml."""
    # Create package
    src = tmp_path / "src" / "mypkg"
    src.mkdir(parents=True)
    (src / "__init__.py").write_text("")
    (src / "a.py").write_text("import os\n")

    # Create config
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        textwrap.dedent("""\
        [tool.apdev]
        base_package = "mypkg"
        src_dir = "src"
        """)
    )

    result = run_apdev("check-imports", cwd=tmp_path)
    assert result.returncode == 0
    assert "No circular imports" in result.stdout
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_cli.py -v`
Expected: FAIL

**Step 3: Write `cli.py`**

```python
"""Command-line interface for apdev."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import apdev
from apdev.check_chars import check_paths
from apdev.check_imports import check_circular_imports
from apdev.config import load_config


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="apdev",
        description="Shared development tools for Python projects",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"apdev {apdev.__version__}",
    )
    subparsers = parser.add_subparsers(dest="command")

    # check-chars
    chars_parser = subparsers.add_parser(
        "check-chars",
        help="Validate files contain only allowed characters",
    )
    chars_parser.add_argument(
        "files",
        nargs="*",
        type=Path,
        help="Files to check",
    )

    # check-imports
    imports_parser = subparsers.add_parser(
        "check-imports",
        help="Detect circular imports in a Python package",
    )
    imports_parser.add_argument(
        "--package",
        dest="base_package",
        help="Base package name (e.g. apflow). Reads from [tool.apdev] if omitted.",
    )
    imports_parser.add_argument(
        "--src-dir",
        dest="src_dir",
        help="Source directory containing the package (default: src)",
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point for the apdev CLI."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "check-chars":
        return check_paths(args.files)

    if args.command == "check-imports":
        config = load_config()
        base_package = args.base_package or config.get("base_package")
        src_dir_str = args.src_dir or config.get("src_dir", "src")
        src_dir = Path(src_dir_str)

        if not base_package:
            print(
                "Error: --package is required (or set base_package in [tool.apdev])",
                file=sys.stderr,
            )
            return 1

        return check_circular_imports(src_dir, base_package=base_package)

    return 0
```

**Step 4: Write `__main__.py`**

```python
"""Allow running apdev as `python -m apdev`."""

import sys

from apdev.cli import main

sys.exit(main())
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest tests/test_cli.py -v`
Expected: 6 passed

**Step 6: Run all tests**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest -v`
Expected: All 25 tests passed

**Step 7: Verify CLI works end-to-end**

Run: `apdev --version`
Expected: `apdev 0.1.0`

Run: `apdev check-chars python/src/apdev/cli.py`
Expected: exit code 0 (no output = clean)

**Step 8: Commit**

```bash
git add python/src/apdev/cli.py python/src/apdev/__main__.py python/tests/test_cli.py
git commit -m "feat: add unified CLI with check-chars and check-imports subcommands"
```

---

## Task 7: Pre-commit Hook Support

Allow projects to use apdev as a pre-commit hook repository.

**Files:**
- Create: `python/.pre-commit-hooks.yaml`
- Modify: `README.md`

**Step 1: Create `.pre-commit-hooks.yaml`**

This file goes in `python/` since pre-commit needs it at the repo subdirectory root.

```yaml
- id: check-chars
  name: apdev check-chars
  description: Validate files contain only allowed characters (ASCII + emoji + technical symbols)
  entry: apdev check-chars
  language: python
  types_or: [text, python]

- id: check-imports
  name: apdev check-imports
  description: Detect circular imports in a Python package
  entry: apdev check-imports
  language: python
  pass_filenames: false
  always_run: true
```

**Step 2: Commit**

```bash
git add python/.pre-commit-hooks.yaml
git commit -m "feat: add pre-commit hook definitions"
```

---

## Task 8: Root README

**Files:**
- Create: `README.md`
- Create: `python/README.md`

**Step 1: Write root `README.md`**

```markdown
# apdev

Shared development tools for the [aipartnerup](https://github.com/aipartnerup) ecosystem.

## Packages

| Language | Package | Status |
| -------- | ------- | ------ |
| Python   | [`apdev`](python/) | Beta |
| TypeScript | `@aipartnerup/apdev` | Planned |
| Go       | `github.com/aipartnerup/apdev/go` | Planned |

## Available Tools

- **check-chars** - Validate files contain only allowed characters (ASCII + emoji + technical symbols)
- **check-imports** - Detect circular imports in a Python package

See language-specific READMEs for installation and usage instructions.
```

**Step 2: Write `python/README.md`**

```markdown
# apdev (Python)

Shared development tools for Python projects.

## Installation

```bash
pip install apdev
```

For development:

```bash
pip install apdev[dev]
```

## Tools

### check-chars

Validate that files contain only allowed characters (ASCII, common emoji, and technical symbols like arrows and box-drawing characters).

```bash
# Check specific files
apdev check-chars src/mypackage/*.py

# Use with pre-commit (see below)
```

### check-imports

Detect circular imports in a Python package.

```bash
# Specify package explicitly
apdev check-imports --package mypackage --src-dir src

# Or configure in pyproject.toml (see below)
apdev check-imports
```

## Configuration

Add to your project's `pyproject.toml`:

```toml
[tool.apdev]
base_package = "mypackage"
src_dir = "src"
```

## Pre-commit Integration

```yaml
repos:
  - repo: https://github.com/aipartnerup/apdev
    rev: python/v0.1.0
    hooks:
      - id: check-chars
      - id: check-imports
```

Or use as a local hook with the pip-installed package:

```yaml
repos:
  - repo: local
    hooks:
      - id: check-chars
        name: apdev check-chars
        entry: apdev check-chars
        language: system
        types_or: [text, python]

      - id: check-imports
        name: apdev check-imports
        entry: apdev check-imports
        language: system
        pass_filenames: false
        always_run: true
```

## Migration from scripts/

If you previously copied apdev scripts into your project's `scripts/` directory:

1. Add `apdev` to your dev dependencies:
   ```toml
   # pyproject.toml
   [project.optional-dependencies]
   dev = ["apdev>=0.1.0", ...]
   ```

2. Add configuration:
   ```toml
   [tool.apdev]
   base_package = "yourpackage"
   src_dir = "src"
   ```

3. Update pre-commit hooks (replace local script paths with `apdev` commands)

4. Update Makefile targets:
   ```makefile
   check-circular:
       apdev check-imports

   check-chars:
       apdev check-chars $(shell find src -name '*.py')
   ```

5. Delete the old scripts from `scripts/`

## License

MIT
```

**Step 3: Commit**

```bash
git add README.md python/README.md
git commit -m "docs: add README with usage, configuration, and migration guide"
```

---

## Task 9: Build Verification & Final Checks

**Step 1: Run full test suite**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && pytest -v --tb=short`
Expected: All 25 tests passed

**Step 2: Run linter**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && ruff check src/ tests/`
Expected: All checks passed

**Step 3: Verify package builds**

Run: `cd /Users/tercel/WorkSpace/aipartnerup/apdev/python && python -m build`
Expected: Successfully built sdist and wheel in `dist/`

**Step 4: Verify CLI entry point from built package**

Run: `pip install dist/apdev-0.1.0-py3-none-any.whl && apdev --version`
Expected: `apdev 0.1.0`

**Step 5: Commit any fixes, then tag**

```bash
git tag -a python/v0.1.0 -m "apdev Python package v0.1.0"
```

---

## Summary

After completing all tasks, the repository structure will be:

```
apdev/
├── .gitignore
├── README.md                          # Monorepo overview
├── docs/plans/
├── python/
│   ├── .pre-commit-hooks.yaml         # Pre-commit hook definitions
│   ├── README.md                      # Python-specific docs
│   ├── pyproject.toml                 # Package metadata & build config
│   ├── src/apdev/
│   │   ├── __init__.py                # Package version
│   │   ├── __main__.py                # python -m apdev support
│   │   ├── cli.py                     # Unified CLI entry point
│   │   ├── config.py                  # pyproject.toml config reader
│   │   ├── check_chars.py            # Character validation tool
│   │   ├── check_imports.py          # Circular import detection
│   │   └── py.typed                   # PEP 561 marker
│   └── tests/
│       ├── __init__.py
│       ├── test_config.py
│       ├── test_check_chars.py
│       ├── test_check_imports.py
│       └── test_cli.py
├── ts/                                 # (future)
└── go/                                 # (future)
```

**Consumer migration** (e.g., apflow):
```diff
# pyproject.toml
[project.optional-dependencies]
-dev = ["pytest>=7.0.0", ...]
+dev = ["pytest>=7.0.0", "apdev>=0.1.0", ...]

+[tool.apdev]
+base_package = "apflow"
+src_dir = "src"
```

```diff
# .pre-commit-config.yaml
- entry: python scripts/check_allowed_chars.py
+ entry: apdev check-chars
```

```diff
# Makefile
-check-circular:
-   @python scripts/detect_circular_imports.py
+check-circular:
+   @apdev check-imports
```

Old `python/` directory with standalone scripts can be removed after the package is published and consumers are migrated.
