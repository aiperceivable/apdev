"""Command-line interface for apdev."""

from __future__ import annotations

import argparse
import importlib.resources
import os
import subprocess
import sys
from pathlib import Path

import apdev
from apdev.check_chars import check_paths
from apdev.check_imports import check_circular_imports
from apdev.config import load_config


def _get_release_script() -> Path:
    """Locate the bundled release.sh script."""
    ref = importlib.resources.files("apdev").joinpath("release.sh")
    return Path(str(ref))


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

    # release
    release_parser = subparsers.add_parser(
        "release",
        help="Interactive release automation (build, tag, GitHub release, PyPI upload)",
    )
    release_parser.add_argument(
        "version",
        nargs="?",
        help="Version to release (auto-detected from pyproject.toml if omitted)",
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

    if args.command == "release":
        script = _get_release_script()
        if not script.is_file():
            print("Error: release.sh not found in package", file=sys.stderr)
            return 1
        cmd = ["bash", str(script)]
        if args.version:
            cmd.append(args.version)
        result = subprocess.run(cmd, env={**os.environ})
        return result.returncode

    return 0
