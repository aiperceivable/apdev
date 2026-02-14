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
