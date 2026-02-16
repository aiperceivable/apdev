# Changelog

## [0.1.0] - 2026-02-16

### Added
- Initial TypeScript port of apdev development tools
- `check-chars` - Validate files contain only allowed characters (ASCII + emoji + technical symbols)
- `check-imports` - Detect circular imports in JS/TS packages using TypeScript compiler API
- `release` - Interactive release automation (build, tag, GitHub release, npm publish)
- Configuration loading from `package.json` `"apdev"` field
- CLI with Commander.js
- Full test suite with Vitest
