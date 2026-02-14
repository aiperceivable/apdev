# Changelog

All notable changes to the Python package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).


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
