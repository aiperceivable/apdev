"""Tests for the apdev CLI."""

import os
import subprocess
import sys
import textwrap
from pathlib import Path
from unittest.mock import Mock

import pytest

from apdev import cli


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


@pytest.mark.parametrize(
    ("local_venv", "active_venv"), [(True, False), (True, True), (False, False)]
)
def test_cli_release_selects_project_virtualenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, local_venv: bool, active_venv: bool
) -> None:
    monkeypatch.chdir(tmp_path)
    project_venv = Path.cwd() / ".venv"
    if local_venv:
        (project_venv / "bin").mkdir(parents=True)
        (project_venv / "pyvenv.cfg").touch()
        python = project_venv / "bin" / "python"
        python.touch()
        python.chmod(0o755)
    original_path = os.defpath
    if active_venv:
        active_path = str(tmp_path / "active")
        monkeypatch.setenv("VIRTUAL_ENV", active_path)
        original_path = os.pathsep.join((str(Path(active_path) / "bin"), original_path))
    else:
        monkeypatch.delenv("VIRTUAL_ENV", raising=False)
    monkeypatch.setenv("PATH", original_path)
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--yes", "0.1.0"]) == 0

    run.assert_called_once()
    args = run.call_args.args[0]
    assert args[0] == "bash"
    assert args[2:] == ["--yes", "0.1.0"]
    env = run.call_args.kwargs["env"]
    if local_venv and not active_venv:
        assert env["PATH"] == os.pathsep.join((str(project_venv / "bin"), original_path))
        assert env["VIRTUAL_ENV"] == str(project_venv)
        assert "VIRTUAL_ENV" not in os.environ
    else:
        assert env["PATH"] == original_path
        assert env.get("VIRTUAL_ENV") == os.environ.get("VIRTUAL_ENV")


def test_cli_release_forwards_repository_flag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """--repository is passed through to release.sh before the version."""
    monkeypatch.chdir(tmp_path)
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--repository", "myproject", "0.1.0"]) == 0

    args = run.call_args.args[0]
    assert args[0] == "bash"
    assert args[2:] == ["--repository", "myproject", "0.1.0"]


def test_cli_release_reads_repository_from_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """[tool.apdev] pypi_repository selects the section without a flag."""
    monkeypatch.chdir(tmp_path)
    Path("pyproject.toml").write_text(
        textwrap.dedent(
            """
            [project]
            name = "demo"
            version = "0.1.0"

            [tool.apdev]
            pypi_repository = "myproject"
            """
        ),
        encoding="utf-8",
    )
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--yes"]) == 0

    args = run.call_args.args[0]
    assert args[2:] == ["--yes", "--repository", "myproject"]


def test_cli_release_flag_beats_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """An explicit --repository wins over [tool.apdev]."""
    monkeypatch.chdir(tmp_path)
    Path("pyproject.toml").write_text(
        textwrap.dedent(
            """
            [project]
            name = "demo"
            version = "0.1.0"

            [tool.apdev]
            pypi_repository = "myproject"
            """
        ),
        encoding="utf-8",
    )
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--repository", "testpypi"]) == 0

    args = run.call_args.args[0]
    assert args[2:] == ["--repository", "testpypi"]


def test_cli_release_forwards_account_from_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """[tool.apdev] github_account selects the gh login for the release."""
    monkeypatch.chdir(tmp_path)
    Path("pyproject.toml").write_text(
        textwrap.dedent(
            """
            [project]
            name = "demo"
            version = "0.1.0"

            [tool.apdev]
            github_account = "work-account"
            """
        ),
        encoding="utf-8",
    )
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--yes"]) == 0

    args = run.call_args.args[0]
    assert args[2:] == ["--yes", "--account", "work-account"]


def test_cli_release_account_flag_beats_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """--account wins over [tool.apdev], and both flags are forwarded."""
    monkeypatch.chdir(tmp_path)
    Path("pyproject.toml").write_text(
        textwrap.dedent(
            """
            [project]
            name = "demo"
            version = "0.1.0"

            [tool.apdev]
            github_account = "work-account"
            pypi_repository = "myproject"
            """
        ),
        encoding="utf-8",
    )
    run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0))
    monkeypatch.setattr(cli.subprocess, "run", run)

    assert cli.main(["release", "--account", "personal-account", "0.2.0"]) == 0

    args = run.call_args.args[0]
    assert args[2:] == [
        "--repository",
        "myproject",
        "--account",
        "personal-account",
        "0.2.0",
    ]


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


def test_cli_check_chars_cli_overrides_env(tmp_path: Path) -> None:
    """CLI --charset overrides APDEV_EXTRA_CHARS (env ignored when CLI args present)."""
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n")
    # Env says chinese, but CLI provides a charset that doesn't include CJK
    custom = tmp_path / "empty.json"
    custom.write_text('{"name":"empty","extra_ranges":[]}')
    result = subprocess.run(
        [sys.executable, "-m", "apdev", "check-chars", "--charset-file", str(custom), str(f)],
        capture_output=True,
        text=True,
        env={**os.environ, "APDEV_EXTRA_CHARS": "chinese"},
    )
    # CLI args present → env var ignored → CJK rejected
    assert result.returncode == 1


def test_cli_check_chars_no_args_scans_defaults(tmp_path: Path) -> None:
    """apdev check-chars with no files scans src/, tests/, and root config files."""
    src = tmp_path / "src" / "pkg"
    src.mkdir(parents=True)
    (src / "a.py").write_text("x = 1\n")
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_a.py").write_text("y = 2\n")
    (tmp_path / "README.md").write_text("hello\n")

    result = run_apdev("check-chars", cwd=tmp_path)
    assert result.returncode == 0


def test_cli_check_chars_no_args_detects_bad(tmp_path: Path) -> None:
    """apdev check-chars with no files catches illegal chars in default dirs."""
    src = tmp_path / "src"
    src.mkdir()
    (src / "bad.py").write_text("x = '\u4e2d'\n")

    result = run_apdev("check-chars", cwd=tmp_path)
    assert result.returncode == 1
    assert "illegal characters" in result.stdout.lower()


def test_cli_check_chars_no_args_empty_project(tmp_path: Path) -> None:
    """apdev check-chars with no files and no default dirs returns 0."""
    result = run_apdev("check-chars", cwd=tmp_path)
    assert result.returncode == 0
    assert "No files to check" in result.stdout


def test_cli_check_chars_directory(tmp_path: Path) -> None:
    """apdev check-chars with a directory recursively checks files."""
    sub = tmp_path / "pkg"
    sub.mkdir()
    (sub / "a.py").write_text("x = 1\n")
    (sub / "b.py").write_text("x = '\u4e2d'\n")  # illegal char

    result = run_apdev("check-chars", str(sub))
    assert result.returncode == 1
    assert "illegal characters" in result.stdout.lower()


def test_cli_check_chars_directory_clean(tmp_path: Path) -> None:
    """apdev check-chars with a clean directory returns 0."""
    sub = tmp_path / "pkg"
    sub.mkdir()
    (sub / "a.py").write_text("x = 1\n")

    result = run_apdev("check-chars", str(sub))
    assert result.returncode == 0


def test_cli_check_chars_skips_binary_files(tmp_path: Path) -> None:
    """apdev check-chars skips binary files like .pyc when scanning a directory."""
    sub = tmp_path / "pkg"
    sub.mkdir()
    (sub / "ok.py").write_text("x = 1\n")
    (sub / "bad.pyc").write_bytes(b"\xcb\x00\x00\x00")

    result = run_apdev("check-chars", str(sub))
    assert result.returncode == 0
    assert "bad.pyc" not in result.stdout


def test_cli_check_chars_skips_hidden_dirs(tmp_path: Path) -> None:
    """apdev check-chars skips hidden directories when scanning."""
    sub = tmp_path / "pkg"
    sub.mkdir()
    (sub / "ok.py").write_text("x = 1\n")
    hidden = sub / ".hidden"
    hidden.mkdir()
    (hidden / "bad.py").write_text("x = '\u4e2d'\n")

    result = run_apdev("check-chars", str(sub))
    assert result.returncode == 0
    assert ".hidden" not in result.stdout


def test_cli_check_chars_charset_file(tmp_path: Path) -> None:
    """--charset-file with custom JSON allows specified ranges."""
    custom = tmp_path / "custom.json"
    custom.write_text(
        '{"name":"custom","extra_ranges":[{"start":"0x4E00","end":"0x9FFF","name":"CJK"}]}'
    )
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n")
    result = run_apdev("check-chars", "--charset-file", str(custom), str(f))
    assert result.returncode == 0


def test_cli_check_chars_unknown_charset(tmp_path: Path) -> None:
    """An unknown --charset is a clean error, not a traceback."""
    f = tmp_path / "ok.py"
    f.write_text("x = 1\n", encoding="utf-8")

    result = run_apdev("check-chars", "--charset", "nope", str(f))

    assert result.returncode == 1
    assert "Unknown charset: nope" in result.stderr
    assert "Traceback" not in result.stderr


def test_cli_check_chars_missing_charset_file(tmp_path: Path) -> None:
    """A missing --charset-file is a clean error as well."""
    f = tmp_path / "ok.py"
    f.write_text("x = 1\n", encoding="utf-8")
    missing = tmp_path / "nope.json"

    result = run_apdev("check-chars", "--charset-file", str(missing), str(f))

    assert result.returncode == 1
    assert "Charset file not found" in result.stderr
    assert "Traceback" not in result.stderr


def test_cli_check_chars_missing_input_file(tmp_path: Path) -> None:
    """A path that does not exist is an invocation error, not a finding."""
    missing = tmp_path / "nope.py"

    result = run_apdev("check-chars", str(missing))

    assert result.returncode == 1
    assert "file not found" in result.stderr
    assert "illegal characters" not in result.stdout


def test_cli_check_imports_missing_package(tmp_path: Path) -> None:
    """A wrong package name exits 1 instead of reporting a clean scan."""
    (tmp_path / "src" / "pkg").mkdir(parents=True)
    (tmp_path / "src" / "pkg" / "__init__.py").write_text("", encoding="utf-8")

    result = run_apdev("check-imports", "--package", "nope", cwd=tmp_path)

    assert result.returncode == 1
    assert "not found under" in result.stderr
