# Changelog

All notable changes to the Python package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).


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
