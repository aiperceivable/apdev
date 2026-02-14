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
