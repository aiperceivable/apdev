# Changelog

All notable changes to the Python package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).


## [Unreleased]

## [0.2.7] - 2026-11-22

### Added

- `apdev release --account NAME` / `-a NAME`, and `[tool.apdev]
  github_account`, so the GitHub release is published as a chosen `gh` login
  instead of whichever account happens to be active. The token is resolved
  with `gh auth token --user NAME` and exported for that run only, so the
  active account is never switched; `GITHUB_ACCOUNT` works as an environment
  override, and an account that is not logged in aborts before any step runs.
- The release header prints `GitHub user: <login>` next to the PyPI section.
- `get_github_token` honours `GH_TOKEN` when step 6.5 clears `GITHUB_TOKEN`, so
  the API fallback uses the same account as the CLI.

### Changed

- The README documents `github_account` and the two-login `gh` setup.

### Changed

- `build` moved out of the runtime dependencies into `apdev[release]` and
  `apdev[dev]`: only `apdev release` needs a build frontend, so plain installs
  no longer pull `build`, `packaging` and `pyproject-hooks`. `release.sh` now
  says which extra to install when the frontend is missing.
- `uv.lock` regenerated (it still pinned apdev 0.2.5).

### Fixed

- The test modules now start with `from __future__ import annotations`, so the
  `str | Path` signatures do not fail at import time on Python 3.10, the lowest
  version the package claims to support.
- `release.sh` no longer uses `local x=$(...)`, which masked exit statuses and
  tripped shellcheck's SC2155.

### Added

- `make lint-python`, `format-python`, `test-python`, `build-python` and
  `check-python` (root Makefile), so the Python workflow no longer has to be
  reconstructed from memory.
- CI for the Python package: ruff check and format, pytest with coverage on a
  3.10-3.13 matrix, `bash -n` and shellcheck for `release.sh`, `python -m build`
  plus `twine check`, and `uv lock --check`.

### Tooling

- ruff now also checks `B`, `UP`, `SIM`, `RUF` and `PTH`; the ten findings it
  surfaced are fixed, including three assertions in the charset tests that had
  been written the wrong way round.
- pytest runs with `-ra --strict-markers --strict-config`, and coverage is
  enforced at 80% (branch coverage, 83% locally) by `pytest --cov`.
- The package declares `Typing :: Typed`, which matches the `py.typed` it ships.

### Packaging

- Add `LICENSE` and `NOTICE` (Apache-2.0) to the repository and ship them in
  the wheel and sdist; switch to the PEP 639 metadata (`license = "Apache-2.0"`
  plus `license-files`), which needs `setuptools>=77`. The licence classifier is
  dropped because a licence expression is now present.

### Fixed

- `owner/repo` is parsed from any remote form, including per-account SSH
  aliases such as `git@github-work:owner/repo.git`. Previously only a
  `github.com` prefix was stripped, so step 6.5 passed a URL to
  `gh release create --repo` and failed.

## [0.2.6] - 2026-11-22

### Added

- `apdev release --repository NAME` / `-r NAME`, and `[tool.apdev]
  pypi_repository` in the consumer project, so `twine upload` targets a named
  `~/.pypirc` section instead of always using `[pypi]`. Resolution order is
  flag, `PYPI_REPOSITORY` environment variable, `[tool.apdev]`, then `pypi`.
- The release header prints the resolved section, so it is obvious which PyPI
  account a release will use before anything is uploaded.
- `[tool.apdev]` keys are documented in the README Configuration section,
  including `pypi_repository`.

### Changed

- `release.sh` parses its arguments with a while loop, and reads
  `pypi_repository` with awk instead of `tomllib`, so the script still works on
  machines whose `python3` predates 3.11.

## [0.2.5] - 2026-11-18

### Changed

- Refresh `uv.lock` (`pytest` 9.2.0, `coverage` 7.16.2, and other patch
  updates). No public API changes.

### Fixed

- `apdev release` uses the project's `.venv` when invoked without an active
  virtual environment, so it can find the project's Python and release tools.
- `apdev.__version__` now matches the package version; it had drifted to
  `0.2.3`.

## [0.2.4] - 2026-03-22

### Changed
- Rebrand: aipartnerup → aiperceivable

## [0.2.1] - 2026-03-06

### Fixed

- Release script version check now supports dynamic versions via `importlib.metadata` (not just static `__version__ = "x.x.x"`)
- Added hint message suggesting `pip install -e .` when version mismatch is detected

## [0.2.0] - 2026-02-25

### Added

- Custom charset support via shared JSON definition files (`shared/charsets/`)
- `load_charset(name_or_path)` — load a bundled preset (e.g. `chinese`) or custom JSON file
- `resolve_charsets(charset_names, charset_files)` — merge base + extra charsets with deduplication
- Bundled charset presets: `base`, `chinese`, `japanese`, `korean`
- CLI `--charset` flag (repeatable) to enable preset charsets
- CLI `--charset-file` flag (repeatable) to load custom charset JSON files
- `APDEV_EXTRA_CHARS` environment variable — comma-separated charset names or file paths, used as fallback when no CLI args provided
- `check-chars`: Block Elements (U+2580-U+259F) and Braille Patterns (U+2800-U+28FF) to default allowed ranges

### Changed

- Character ranges and dangerous codepoints now loaded from `charsets/base.json` instead of hardcoded constants
- `check_file()` and `check_paths()` accept optional `extra_ranges` and `dangerous` kwargs for custom charset support
- `is_allowed_char()` now excludes dangerous codepoints (Trojan Source vectors) even though they fall within the General Punctuation allowed range

### Fixed

- `is_allowed_char()` previously returned `True` for dangerous codepoints (U+200B, U+202E, etc.) because they fall within the General Punctuation range (U+2000-U+206F)
- `load_charset()` now catches all exceptions from `importlib.resources` (not just `FileNotFoundError`)
- `check_file()` now uses lazy-loaded cache instead of re-parsing `base.json` on every call

## [0.1.6] - 2026-02-16

### Added

- `check-chars`: Dangerous character blacklist (bidi controls + zero-width chars, CVE-2021-42574) with comment-aware detection — flags in code, allows in comments
- `check-chars`: `is_dangerous_char()` public function and `DANGEROUS_CODEPOINTS` constant
- `check-chars`: Comment region detection state machine for Python (`#`) and JS/TS (`//`, `/* */`) with string literal tracking
- `check-imports`: Relative import support — `from .foo import x` and `from . import foo` now resolve correctly for cycle detection

### Fixed

- `check-imports`: `ImportAnalyzer` now handles `node.level > 0` (relative imports) by resolving against `current_module` with correct package vs module distinction

## [0.1.5] - 2026-02-16

### Changed

- Use language-prefixed git tags (`python/v0.1.5`) to support monorepo with independent package versions
- URL-encode tag in GitHub API calls to handle `/` in tag names

## [0.1.4] - 2026-02-15

### Fixed

- Fix release script version check to use `PACKAGE_NAME` when reading __init__.py

## [0.1.3] - 2026-02-15

### Fixed

- Add `PACKAGE_NAME` default (project name with hyphens converted to underscores) for release script


## [0.1.2] - 2026-02-14

### Fixed

- Fix PyPI version check false positives: use exact match instead of `grep -w` to prevent partial version matching (e.g. `0.2.0` matching `0.2.0.1`)
- Fix `sed` RE error on macOS when detecting GitHub repo from git remote (BSD sed doesn't support non-greedy `.+?`)


## [0.1.1] - 2026-02-14

### Added

- Add `build>=1.0` as a project dependency for package building support


## [0.1.0] - 2026-02-14

### Added

- `check-chars` - Validate files contain only allowed characters (ASCII, emoji, technical symbols)
- `check-imports` - Detect circular imports in a Python package with configurable `--package` and `--src-dir`
- Unified CLI entry point: `apdev <command>`
- Configuration support via `[tool.apdev]` in consumer's `pyproject.toml`
- Pre-commit hook definitions for `check-chars` and `check-imports`
- `apdev release` - Interactive release automation (auto-detects project name and GitHub repo)
- `python -m apdev` support
