# Changelog

## [0.1.1] - 2026-02-16

### Added

- `check-chars`: Dangerous character blacklist (bidi controls + zero-width chars, CVE-2021-42574) with comment-aware detection — flags in code, allows in comments
- `check-chars`: `isDangerousChar()` function, `DANGEROUS_CODEPOINTS` map, and `computeCommentMask()` exports
- `check-chars`: Comment region detection state machine for Python (`#`) and JS/TS (`//`, `/* */`) with string literal tracking
- `check-imports`: Relative import support — `import { x } from './foo'` and `../foo` now resolve correctly for cycle detection

### Fixed

- `check-imports`: `resolveImports` now handles `./` and `../` paths by resolving against `currentModule` with correct package vs module distinction

## [0.1.0] - 2026-02-16

### Added
- Initial TypeScript port of apdev development tools
- `check-chars` - Validate files contain only allowed characters (ASCII + emoji + technical symbols)
- `check-imports` - Detect circular imports in JS/TS packages using TypeScript compiler API
- `release` - Interactive release automation (build, tag, GitHub release, npm publish)
- Configuration loading from `package.json` `"apdev"` field
- CLI with Commander.js
- Full test suite with Vitest
