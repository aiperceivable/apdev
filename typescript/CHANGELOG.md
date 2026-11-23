# Changelog

## [Unreleased]

### Added

- `release.sh --account NAME` / `GITHUB_ACCOUNT` / `"apdev".github_account`
  selects the `gh` login that publishes the GitHub release; the token is used
  for that run only and the header prints `GitHub user: NAME`.
- An account that is not logged in aborts before any step, instead of skipping
  the release silently.

### Fixed

- `owner/repo` is parsed from any remote form, including per-account SSH
  aliases such as `git@github-work:owner/repo.git`; the old parser only stripped
  a `github.com` prefix and handed `gh release create` an unusable value.

## [0.2.5] - 2026-11-18

### Changed

- Refresh the development toolchain to `vitest` 5.1.0. No public API changes.

## [0.2.3] - 2026-03-22

### Changed
- Rebrand: aipartnerup → aiperceivable

## [0.2.0] - 2026-02-25

### Added

- Custom charset support via shared JSON definition files (`shared/charsets/`)
- `loadCharset(nameOrPath)` — load a bundled preset (e.g. `chinese`) or custom JSON file
- `resolveCharsets(charsetNames, charsetFiles)` — merge base + extra charsets with deduplication
- Bundled charset presets: `base`, `chinese`, `japanese`, `korean`
- CLI `--charset` flag (repeatable) to enable preset charsets
- CLI `--charset-file` flag (repeatable) to load custom charset JSON files
- `APDEV_EXTRA_CHARS` environment variable — comma-separated charset names or file paths, used as fallback when no CLI args provided
- `check-chars`: Block Elements (U+2580-U+259F) and Braille Patterns (U+2800-U+28FF) to default allowed ranges
- Exported `isDangerousChar` from public API (`index.ts`)
- Exported `RangeEntry`, `DangerousEntry`, `CharsetData` interfaces

### Changed

- Character ranges and dangerous codepoints now loaded from `charsets/base.json` instead of hardcoded constants
- `checkFile()` and `checkPaths()` accept optional `extraRanges` and `dangerousMap` params for custom charset support
- `isAllowedChar()` now excludes dangerous codepoints (Trojan Source vectors) even though they fall within the General Punctuation allowed range
- `typescript` moved from `dependencies` to optional `peerDependencies` — build output reduced from 9.50 MB to 17.88 KB
- Commander.js `--yes` option syntax fixed to `-y, --yes`

### Fixed

- `isAllowedChar()` previously returned `true` for dangerous codepoints (U+200B, U+202E, etc.) because they fall within the General Punctuation range (U+2000-U+206F)
- `checkFile()` now uses lazy-loaded cache instead of re-parsing `base.json` on every call
- Error details now included in file read failure messages

## [0.1.0] - 2026-02-16

### Added
- Initial TypeScript port of apdev development tools
- `check-chars` - Validate files contain only allowed characters (ASCII + emoji + technical symbols)
- `check-imports` - Detect circular imports in JS/TS packages using TypeScript compiler API
- `release` - Interactive release automation (build, tag, GitHub release, npm publish)
- Configuration loading from `package.json` `"apdev"` field
- CLI with Commander.js
- Full test suite with Vitest
