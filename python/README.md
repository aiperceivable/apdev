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
# Check default project directories (src/, tests/, examples/) and config files
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

From the project root, `apdev release` uses the project's `.venv` automatically when no virtual environment is active. Install `build`, `pip`, and `twine` in the environment used for release.

```bash
# Run with auto-detected version from pyproject.toml
apdev release

# Or specify version explicitly
apdev release 0.2.0

# Upload to a named .pypirc section (default: [tool.apdev] pypi_repository, or "pypi")
apdev release --repository reachreel
apdev release -r testpypi 0.3.0

# Publish the GitHub release as another account (default: [tool.apdev] github_account, or gh's active account)
apdev release --account work-account
apdev release -a personal-account 0.3.0
```

The command provides an interactive menu with steps:
1. Version verification (checks `pyproject.toml` and `__init__.py` match)
2. Status check (tag, build files, PyPI)
3. Clean build files
4. Build package (`python -m build`)
5. Check package (`twine check`)
6. Create git tag and push
7. Create GitHub release (via `gh` CLI or API)
8. Upload to PyPI (`twine upload -r <repository> dist/*`)

Which `~/.pypirc` section is used, in order of precedence:

1. `--repository NAME` / `-r NAME`
2. `PYPI_REPOSITORY` environment variable
3. `[tool.apdev] pypi_repository` in `pyproject.toml`
4. the default `[pypi]` section

The resolved section is printed in the header before anything is uploaded, so a
second PyPI account is never a guess:

```ini
# ~/.pypirc
[distutils]
index-servers =
    pypi
    reachreel

[pypi]
username = __token__
password = pypi-A...        # account A

[reachreel]
repository = https://upload.pypi.org/legacy/
username = __token__
password = pypi-B...        # account B
```

### Releasing with a second GitHub account

`git push` already follows the remote (for example an SSH alias per account),
but `gh` uses one active login. Log the second account in once — `gh` keeps
several accounts per host — and let the repository choose which one releases:

```bash
gh auth login --git-protocol ssh     # first account
gh auth login --git-protocol ssh     # second account, same host
gh auth status                       # both logins listed, one active
```

```toml
[tool.apdev]
github_account = "work-account"   # the login, not a display name
```

`apdev release` then resolves that account's token with
`gh auth token --user work-account`, exports it as `GH_TOKEN`/`GITHUB_TOKEN` for
the run only, and prints `GitHub user: work-account` in the header. The global
active account is never switched, so other repositories keep their own identity.

Override auto-detection with environment variables:

```bash
PROJECT_NAME=mypackage GITHUB_REPO=owner/repo apdev release
```

## Configuration

Add to your project's `pyproject.toml` so commands can run without CLI arguments:

```toml
[tool.apdev]
base_package = "mypackage"    # Required by check-imports
src_dir = "src"               # Source directory (default: "src")
pypi_repository = "mypackage" # .pypirc section for `apdev release` (default: "pypi")
github_account = "work-account" # gh login for the GitHub release (default: gh's active account)
```

With this config, the commands work out of the box:

```bash
apdev check-chars    # Checks default project directories and config files
apdev check-imports  # Reads base_package / src_dir from pyproject.toml
apdev release        # Reads pypi_repository, so the right PyPI account is used
```

## Pre-commit Integration

```yaml
repos:
  - repo: https://github.com/aiperceivable/apdev
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
