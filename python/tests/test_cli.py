"""Tests for the apdev CLI."""

import os
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


def test_cli_help() -> None:
    """apdev --help shows subcommands."""
    result = run_apdev("--help")
    assert result.returncode == 0
    assert "check-chars" in result.stdout
    assert "check-imports" in result.stdout
    assert "release" in result.stdout


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
        "--package",
        "mypkg",
        "--src-dir",
        str(tmp_path),
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


def test_cli_check_chars_with_charset(tmp_path: Path) -> None:
    """--charset chinese allows CJK characters."""
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n")
    result = run_apdev("check-chars", "--charset", "chinese", str(f))
    assert result.returncode == 0


def test_cli_check_chars_with_env_var(tmp_path: Path) -> None:
    """APDEV_EXTRA_CHARS=chinese allows CJK characters."""
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n")
    result = subprocess.run(
        [sys.executable, "-m", "apdev", "check-chars", str(f)],
        capture_output=True,
        text=True,
        env={**os.environ, "APDEV_EXTRA_CHARS": "chinese"},
    )
    assert result.returncode == 0


def test_cli_check_chars_charset_file(tmp_path: Path) -> None:
    """--charset-file with custom JSON allows specified ranges."""
    custom = tmp_path / "custom.json"
    custom.write_text('{"name":"custom","extra_ranges":[{"start":"0x4E00","end":"0x9FFF","name":"CJK"}]}')
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n")
    result = run_apdev("check-chars", "--charset-file", str(custom), str(f))
    assert result.returncode == 0
