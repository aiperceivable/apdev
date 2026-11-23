# apdev-rs (Rust)

General-purpose development tools for Rust projects - character validation, release automation, and more.

## Installation

```bash
cargo install apdev-rs
```

Or install from local source:

```bash
cd rust
cargo install --path .
```

## Tools

### check-chars

Validate that files contain only allowed characters (ASCII, common emoji, and technical symbols like arrows and box-drawing characters). Flags dangerous invisible/bidirectional characters in code (Trojan Source - CVE-2021-42574) while allowing them in comments.

Supports comment-aware checking for `.rs`, `.py`, `.js`, `.ts`, `.tsx`, `.jsx` files.

```bash
# Check default project directories (src/, tests/, examples/) and config files
apdev-rs check-chars

# Check a directory recursively
apdev-rs check-chars src/

# Check specific files
apdev-rs check-chars src/lib.rs src/main.rs

# Enable extra charset (e.g. Chinese characters)
apdev-rs check-chars --charset chinese src/

# Use a custom charset JSON file
apdev-rs check-chars --charset-file custom.json src/
```

Options:

- `--charset <name>` — Enable a built-in charset preset (repeatable). Available: `chinese`, `japanese`, `korean`
- `--charset-file <path>` — Load a custom charset JSON file (repeatable)
- Environment variable `APDEV_EXTRA_CHARS` — Comma-separated list of charset names or file paths, used when no `--charset`/`--charset-file` is given

### release

Interactive release automation for publishing Rust crates to crates.io and GitHub. Auto-detects project name from `Cargo.toml` and GitHub repo from git remote.

```bash
# Run with auto-detected version from Cargo.toml
apdev-rs release

# Specify version explicitly
apdev-rs release 0.1.0

# Silent mode (auto-accept all defaults, for CI/CD)
apdev-rs release --yes
apdev-rs release --yes 0.1.0
```

The command provides an interactive menu with steps:

1. Version verification (checks `Cargo.toml`)
2. Status check (git tag, crates.io)
3. Run tests (`cargo test`)
4. Build release (`cargo build --release`)
5. Create git tag and push
6. Create GitHub release (via `gh` CLI)
7. Publish to crates.io (`cargo publish`)

Override auto-detection with environment variables:

```bash
PROJECT_NAME=mycrate GITHUB_REPO=owner/repo apdev-rs release
```

## Pre-commit Integration

Requires `apdev-rs` installed on the system (`cargo install apdev-rs`):

```yaml
repos:
  - repo: local
    hooks:
      - id: check-chars
        name: apdev-rs check-chars
        entry: apdev-rs check-chars
        language: system
        types_or: [text, rust]
```

## Releasing

`./release.sh` verifies the version, builds, tags, creates the GitHub release
and publishes to crates.io.

```bash
./release.sh                          # Use the version from Cargo.toml
./release.sh 0.2.2                    # Specify version
./release.sh --account work-account   # Publish the GitHub release as that gh login
```

### Releasing as a second GitHub account

`git push` follows the remote (for example a per-account SSH alias), but `gh`
has a single active login. `--account NAME` / `GITHUB_ACCOUNT` /
`[package.metadata.apdev] github_account` in `Cargo.toml` select the login that
creates the release:

```toml
[package.metadata.apdev]
github_account = "work-account"   # the login, not a display name
```

```bash
gh auth login --git-protocol ssh     # once per account, gh keeps both
gh auth status                       # both listed, one active
```

The token is resolved with `gh auth token --user NAME` and exported for that run
only, so the machine-wide active account is never switched. An account that is
not logged in aborts before any step runs, and the header prints
`GitHub user: NAME` next to the repository.

## Development

Prerequisites: Rust >= 1.70.

```bash
cd rust
cargo build               # Build
cargo test                 # Run tests
cargo build --release      # Build release binary
```

## License

Apache-2.0
