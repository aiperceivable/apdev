# Changelog

All notable changes to apdev-rs will be documented in this file.

## [Unreleased]

### Added

- `release.sh --account NAME` / `GITHUB_ACCOUNT` /
  `[package.metadata.apdev] github_account` selects the `gh` login that
  publishes the GitHub release; the token is used for that run only and the
  header prints `GitHub user: NAME`.
- An account that is not logged in aborts before any step, instead of letting
  `gh` fail later.

### Changed

- `Cargo.lock` is committed: `apdev-rs` is a binary crate, so the lockfile is
  what makes CI builds reproducible.
- `resolve_charsets` returns a named `Charsets` type, clearing the
  `clippy::type_complexity` warning; `cargo fmt` applied across the crate.

### Fixed

- `owner/repo` is parsed from any remote form, including per-account SSH
  aliases such as `git@github-work:owner/repo.git`; the old parser only stripped
  a `github.com` prefix and handed `gh release create` an unusable value.
- Removed an unused `TAG_URL_ENCODED` variable (shellcheck SC2034).

## [0.2.1] - 2026-03-22

### Changed
- Rebrand: aipartnerup → aiperceivable

## [0.1.0] - 2026-03-13

### Added

- **check-chars**: Character validation for source files
  - ASCII + emoji + technical symbols (arrows, box-drawing, math operators)
  - Dangerous invisible/bidi character detection (Trojan Source - CVE-2021-42574)
  - Comment-aware checking for `.rs`, `.py`, `.js`, `.ts`, `.tsx`, `.jsx` files
  - Built-in charset presets: `chinese`, `japanese`, `korean`
  - Custom charset JSON file support
  - `APDEV_EXTRA_CHARS` environment variable fallback
  - Automatic directory walking with configurable skip lists
  - Default project paths: `src/`, `tests/`, `examples/`, and config files
- **release**: Interactive release automation for crates.io
  - Auto-detect project name from `Cargo.toml` and GitHub repo from git remote
  - Step-by-step menu: version verify, test, build, tag, GitHub release, publish
  - Silent mode (`--yes`) for CI/CD
- Pre-commit hook integration via `language: system`

### Removed

- `check-imports` command (Python-specific, not applicable to Rust projects)
- `config.rs` / `pyproject.toml` config loader (no longer needed)
- `toml` dependency
