# apdev (Python)

General-purpose development tools for Python projects.

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
# Check all git-tracked files (no arguments)
apdev check-chars

# Check a directory recursively
apdev check-chars src/

# Check specific files
apdev check-chars src/mypackage/*.py

# Enable extra charset (e.g. Chinese characters)
apdev check-chars --charset chinese src/
```

Options:

- `--charset <name>` — Enable a built-in charset preset (repeatable, e.g. `chinese`)
- `--charset-file <path>` — Load a custom charset JSON file (repeatable)
- Environment variable `APDEV_EXTRA_CHARS` — Comma-separated list of charset names or file paths, used when no `--charset`/`--charset-file` is given

### check-imports

Detect circular imports in a Python package.

```bash
# Specify package explicitly
apdev check-imports --package mypackage --src-dir src

# Or configure in pyproject.toml (see Configuration below)
apdev check-imports
```

### release

Interactive release automation for publishing Python packages to PyPI and GitHub. Auto-detects project name from `pyproject.toml` and GitHub repo from git remote.

```bash
# Run with auto-detected version from pyproject.toml
apdev release

# Or specify version explicitly
apdev release 0.2.0
```

The command provides an interactive menu with steps:
1. Version verification (checks `pyproject.toml` and `__init__.py` match)
2. Status check (tag, build files, PyPI)
3. Clean build files
4. Build package (`python -m build`)
5. Check package (`twine check`)
6. Create git tag and push
7. Create GitHub release (via `gh` CLI or API)
8. Upload to PyPI (`twine upload`)

Override auto-detection with environment variables:

```bash
PROJECT_NAME=mypackage GITHUB_REPO=owner/repo apdev release
```

## Configuration

Add to your project's `pyproject.toml` so commands can run without CLI arguments:

```toml
[tool.apdev]
base_package = "mypackage"   # Required by check-imports
src_dir = "src"              # Source directory (default: "src")
```

With this config, both commands work out of the box:

```bash
apdev check-chars    # Checks all git-tracked files
apdev check-imports  # Reads base_package / src_dir from pyproject.toml
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

## License

Apache-2.0
