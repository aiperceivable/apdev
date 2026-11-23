# apdev

General-purpose development tools for TypeScript/JavaScript projects - character validation, circular import detection, and more.

## Installation

```bash
pnpm add -D apdev-js
# or
npm install --save-dev apdev-js
```

## Available Tools

### check-chars

Validate files contain only allowed characters (ASCII + emoji + technical symbols).

```bash
npx apdev check-chars src/**/*.ts
```

### check-imports

Detect circular imports in a JS/TS package.

```bash
npx apdev check-imports --package mylib --src-dir src
```

### release

Interactive release automation (build, tag, GitHub release, npm publish).

```bash
npx apdev release
npx apdev release 1.0.0
```

## Configuration

Add an `"apdev"` field to your `package.json`:

```json
{
  "apdev": {
    "base_package": "mylib",
    "src_dir": "src",
    "github_account": "work-account"
  }
}
```

With configuration, you can run `check-imports` without flags:

```bash
npx apdev check-imports
```

`github_account` is the `gh` login that publishes the GitHub release. Leave it
out to use whichever account `gh` has active. See [Releasing as a second GitHub
account](#releasing-as-a-second-github-account).

## Integration with lint-staged / Husky

Add character checking as a pre-commit hook:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["apdev check-chars"]
  }
}
```

## Programmatic API

```typescript
import {
  isAllowedChar,
  checkFile,
  checkPaths,
  checkCircularImports,
  loadConfig,
} from "apdev-js";

// Check a single character
isAllowedChar("A"); // true
isAllowedChar("\u4E2D"); // false (CJK)

// Check a file
const problems = checkFile("src/index.ts");

// Detect circular imports
const exitCode = checkCircularImports("src", "mylib");
```

## Development

Prerequisites: Node.js >= 18, pnpm.

```bash
cd typescript
pnpm install              # Install dependencies
pnpm build                # Build (ESM + CJS + types)
pnpm test                 # Run tests
pnpm lint                 # Lint
pnpm format               # Format
```

### Release

Requires npm authentication (`~/.npmrc`) and GitHub CLI (`gh`).

```bash
./release.sh              # Use version from package.json
./release.sh 0.2.0        # Specify version
./release.sh --yes        # Silent mode (CI/CD)
./release.sh --account work-account   # Publish the GitHub release as that gh login
```

The script will: verify version → clean → build → pack check → git tag → GitHub release → npm publish.

### Releasing as a second GitHub account

`git push` follows the remote (for example a per-account SSH alias), but `gh`
has a single active login. `--account NAME` / `GITHUB_ACCOUNT` /
`"apdev".github_account` in `package.json` select the login that creates the
release:

```bash
gh auth login --git-protocol ssh     # once per account, gh keeps both
gh auth status                       # both listed, one active
```

The token is resolved with `gh auth token --user NAME` and exported for that run
only, so the machine-wide active account is never switched. An account that is
not logged in aborts before any step runs, and the header prints
`GitHub user: NAME` next to the repository.

## License

Apache-2.0
