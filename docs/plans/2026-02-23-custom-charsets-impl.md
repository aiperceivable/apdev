# Custom Charsets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract hardcoded character ranges into shared JSON files and support user-defined charsets via CLI flags and environment variable.

**Architecture:** Shared JSON charset definitions in `shared/charsets/`, synced to language directories via Makefile. Both Python and TS load `base.json` at startup, merge additional charsets from `--charset`, `--charset-file`, or `APDEV_EXTRA_CHARS`. CLI args override env var.

**Tech Stack:** Python (json, importlib.resources, argparse), TypeScript (node:fs, node:path, commander)

---

### Task 1: Create shared charset JSON files

**Files:**
- Create: `shared/charsets/base.json`
- Create: `shared/charsets/chinese.json`
- Create: `shared/charsets/japanese.json`
- Create: `shared/charsets/korean.json`

**Step 1: Create `shared/charsets/base.json`**

Contains all current hardcoded ranges from `check_chars.py`:

```json
{
  "name": "base",
  "description": "Default: ASCII + emoji + technical symbols",
  "emoji_ranges": [
    { "start": "0x1F300", "end": "0x1F5FF", "name": "Symbols and Pictographs" },
    { "start": "0x1F600", "end": "0x1F64F", "name": "Emoticons" },
    { "start": "0x1F680", "end": "0x1F6FF", "name": "Transport and Map Symbols" },
    { "start": "0x1F780", "end": "0x1F7FF", "name": "Geometric Shapes Extended" },
    { "start": "0x1F900", "end": "0x1F9FF", "name": "Supplemental Symbols and Pictographs" },
    { "start": "0x2600", "end": "0x26FF", "name": "Miscellaneous Symbols" },
    { "start": "0x2700", "end": "0x27BF", "name": "Dingbats" }
  ],
  "extra_ranges": [
    { "start": "0x0080", "end": "0x00FF", "name": "Latin-1 Supplement" },
    { "start": "0x2000", "end": "0x206F", "name": "General Punctuation" },
    { "start": "0x2100", "end": "0x214F", "name": "Letterlike Symbols" },
    { "start": "0x2190", "end": "0x21FF", "name": "Arrows" },
    { "start": "0x2200", "end": "0x22FF", "name": "Mathematical Operators" },
    { "start": "0x2300", "end": "0x23FF", "name": "Miscellaneous Technical" },
    { "start": "0x2500", "end": "0x257F", "name": "Box Drawing" },
    { "start": "0x2580", "end": "0x259F", "name": "Block Elements" },
    { "start": "0x25A0", "end": "0x25FF", "name": "Geometric Shapes" },
    { "start": "0x2800", "end": "0x28FF", "name": "Braille Patterns" },
    { "start": "0x2B00", "end": "0x2BFF", "name": "Miscellaneous Symbols and Arrows" },
    { "start": "0xFE00", "end": "0xFE0F", "name": "Variation Selectors" }
  ],
  "dangerous": [
    { "code": "0x202A", "name": "LEFT-TO-RIGHT EMBEDDING" },
    { "code": "0x202B", "name": "RIGHT-TO-LEFT EMBEDDING" },
    { "code": "0x202C", "name": "POP DIRECTIONAL FORMATTING" },
    { "code": "0x202D", "name": "LEFT-TO-RIGHT OVERRIDE" },
    { "code": "0x202E", "name": "RIGHT-TO-LEFT OVERRIDE" },
    { "code": "0x2066", "name": "LEFT-TO-RIGHT ISOLATE" },
    { "code": "0x2067", "name": "RIGHT-TO-LEFT ISOLATE" },
    { "code": "0x2068", "name": "FIRST STRONG ISOLATE" },
    { "code": "0x2069", "name": "POP DIRECTIONAL ISOLATE" },
    { "code": "0x200B", "name": "ZERO WIDTH SPACE" },
    { "code": "0x200C", "name": "ZERO WIDTH NON-JOINER" },
    { "code": "0x200D", "name": "ZERO WIDTH JOINER" },
    { "code": "0x200E", "name": "LEFT-TO-RIGHT MARK" },
    { "code": "0x200F", "name": "RIGHT-TO-LEFT MARK" },
    { "code": "0x2060", "name": "WORD JOINER" }
  ]
}
```

**Step 2: Create `shared/charsets/chinese.json`**

```json
{
  "name": "chinese",
  "description": "Chinese: CJK Unified Ideographs, CJK Punctuation, Fullwidth Forms",
  "extra_ranges": [
    { "start": "0x3000", "end": "0x303F", "name": "CJK Symbols and Punctuation" },
    { "start": "0x4E00", "end": "0x9FFF", "name": "CJK Unified Ideographs" },
    { "start": "0xFF00", "end": "0xFFEF", "name": "Fullwidth Forms" }
  ]
}
```

**Step 3: Create `shared/charsets/japanese.json`**

```json
{
  "name": "japanese",
  "description": "Japanese: Hiragana, Katakana, CJK Unified Ideographs, CJK Punctuation, Fullwidth Forms",
  "extra_ranges": [
    { "start": "0x3000", "end": "0x303F", "name": "CJK Symbols and Punctuation" },
    { "start": "0x3040", "end": "0x309F", "name": "Hiragana" },
    { "start": "0x30A0", "end": "0x30FF", "name": "Katakana" },
    { "start": "0x4E00", "end": "0x9FFF", "name": "CJK Unified Ideographs" },
    { "start": "0xFF00", "end": "0xFFEF", "name": "Fullwidth Forms" }
  ]
}
```

**Step 4: Create `shared/charsets/korean.json`**

```json
{
  "name": "korean",
  "description": "Korean: Hangul Jamo, Hangul Syllables, CJK Unified Ideographs, CJK Punctuation, Fullwidth Forms",
  "extra_ranges": [
    { "start": "0x1100", "end": "0x11FF", "name": "Hangul Jamo" },
    { "start": "0x3000", "end": "0x303F", "name": "CJK Symbols and Punctuation" },
    { "start": "0x4E00", "end": "0x9FFF", "name": "CJK Unified Ideographs" },
    { "start": "0xAC00", "end": "0xD7AF", "name": "Hangul Syllables" },
    { "start": "0xFF00", "end": "0xFFEF", "name": "Fullwidth Forms" }
  ]
}
```

**Step 5: Commit**

```bash
git add shared/charsets/
git commit -m "feat: add shared charset JSON definitions (base, chinese, japanese, korean)"
```

---

### Task 2: Create Makefile and sync charsets to language directories

**Files:**
- Create: `Makefile`
- Create: `python/src/apdev/charsets/` (directory + copied files)
- Create: `typescript/src/charsets/` (directory + copied files)

**Step 1: Create root `Makefile`**

```makefile
.PHONY: sync-charsets

sync-charsets:
	@mkdir -p python/src/apdev/charsets typescript/src/charsets
	cp shared/charsets/*.json python/src/apdev/charsets/
	cp shared/charsets/*.json typescript/src/charsets/
	@echo "Charsets synced to python/ and typescript/"
```

**Step 2: Run sync**

Run: `make sync-charsets`
Expected: Files copied to both directories.

**Step 3: Verify files exist**

Run: `ls python/src/apdev/charsets/ typescript/src/charsets/`
Expected: `base.json chinese.json japanese.json korean.json` in both.

**Step 4: Update `python/pyproject.toml` to include charset files in package**

In `[tool.setuptools.package-data]`, change:
```toml
apdev = ["release.sh"]
```
to:
```toml
apdev = ["release.sh", "charsets/*.json"]
```

**Step 5: Update `typescript/package.json` to include charset files in published package**

In `"files"` array, add `"src/charsets"`:
```json
"files": [
  "dist",
  "release.sh",
  "src/charsets"
]
```

**Step 6: Commit**

```bash
git add Makefile python/src/apdev/charsets/ typescript/src/charsets/ python/pyproject.toml typescript/package.json
git commit -m "feat: add Makefile sync-charsets and package charset files"
```

---

### Task 3: Python — `load_charset()` and `resolve_charsets()`

**Files:**
- Modify: `python/src/apdev/check_chars.py`
- Test: `python/tests/test_check_chars.py`

**Step 1: Write failing tests for `load_charset`**

Add to `python/tests/test_check_chars.py`:

```python
from apdev.check_chars import load_charset, resolve_charsets


def test_load_charset_base() -> None:
    """load_charset('base') returns ranges and dangerous dicts."""
    data = load_charset("base")
    assert data["name"] == "base"
    assert len(data["emoji_ranges"]) > 0
    assert len(data["extra_ranges"]) > 0
    assert len(data["dangerous"]) > 0


def test_load_charset_chinese() -> None:
    """load_charset('chinese') returns CJK ranges."""
    data = load_charset("chinese")
    assert data["name"] == "chinese"
    assert len(data["extra_ranges"]) > 0


def test_load_charset_unknown_raises() -> None:
    """load_charset with unknown name raises FileNotFoundError."""
    import pytest
    with pytest.raises(FileNotFoundError):
        load_charset("nonexistent")


def test_load_charset_file(tmp_path: Path) -> None:
    """load_charset can load from an absolute file path."""
    custom = tmp_path / "custom.json"
    custom.write_text('{"name":"custom","extra_ranges":[{"start":"0x4E00","end":"0x9FFF","name":"CJK"}]}')
    data = load_charset(str(custom))
    assert data["name"] == "custom"
```

**Step 2: Run tests to verify they fail**

Run: `cd python && python -m pytest tests/test_check_chars.py::test_load_charset_base -v`
Expected: FAIL — `ImportError: cannot import name 'load_charset'`

**Step 3: Write failing tests for `resolve_charsets`**

Add to `python/tests/test_check_chars.py`:

```python
def test_resolve_charsets_default() -> None:
    """No extra charsets returns base ranges only."""
    ranges, dangerous = resolve_charsets([], [])
    # Should have base ranges
    assert len(ranges) > 0
    assert len(dangerous) > 0
    # CJK should NOT be in ranges
    assert not any(0x4E00 <= s and e <= 0x9FFF for s, e in ranges)


def test_resolve_charsets_with_chinese() -> None:
    """Adding 'chinese' charset includes CJK Unified Ideographs."""
    ranges, dangerous = resolve_charsets(["chinese"], [])
    # CJK range should be present
    assert any(s <= 0x4E00 and 0x9FFF <= e for s, e in ranges)


def test_resolve_charsets_with_custom_file(tmp_path: Path) -> None:
    """Custom charset file ranges are merged."""
    custom = tmp_path / "custom.json"
    custom.write_text('{"name":"custom","extra_ranges":[{"start":"0xABCD","end":"0xABFF","name":"Test"}]}')
    ranges, _ = resolve_charsets([], [str(custom)])
    assert any(s <= 0xABCD and 0xABFF <= e for s, e in ranges)


def test_resolve_charsets_deduplicates() -> None:
    """Duplicate ranges from overlapping charsets are deduplicated."""
    ranges, _ = resolve_charsets(["chinese", "japanese"], [])
    # CJK Unified Ideographs appears in both — should not be duplicated
    cjk_count = sum(1 for s, e in ranges if s == 0x4E00 and e == 0x9FFF)
    assert cjk_count == 1
```

**Step 4: Implement `load_charset` and `resolve_charsets`**

Add to `python/src/apdev/check_chars.py` (after imports, before the existing constants):

```python
import importlib.resources
import json
import os


def load_charset(name_or_path: str) -> dict:
    """Load a charset definition by preset name or file path.

    If name_or_path contains a path separator or ends with .json,
    it is treated as a file path. Otherwise it is looked up from
    the bundled charsets/ directory.
    """
    if os.sep in name_or_path or name_or_path.endswith(".json"):
        p = Path(name_or_path)
        if not p.is_file():
            raise FileNotFoundError(f"Charset file not found: {name_or_path}")
        return json.loads(p.read_text(encoding="utf-8"))

    ref = importlib.resources.files("apdev").joinpath("charsets", f"{name_or_path}.json")
    text = ref.read_text(encoding="utf-8")
    return json.loads(text)


def _parse_ranges(entries: list[dict]) -> list[tuple[int, int]]:
    """Convert JSON range entries to (start, end) tuples."""
    return [(int(e["start"], 16), int(e["end"], 16)) for e in entries]


def _parse_dangerous(entries: list[dict]) -> dict[int, str]:
    """Convert JSON dangerous entries to {code: name} dict."""
    return {int(e["code"], 16): e["name"] for e in entries}


def resolve_charsets(
    charset_names: list[str],
    charset_files: list[str],
) -> tuple[list[tuple[int, int]], dict[int, str]]:
    """Load base charset and merge any additional charsets.

    Returns (all_ranges, dangerous_codepoints).
    """
    base = load_charset("base")
    ranges_set: set[tuple[int, int]] = set()
    ranges_set.update(_parse_ranges(base.get("emoji_ranges", [])))
    ranges_set.update(_parse_ranges(base.get("extra_ranges", [])))
    dangerous = _parse_dangerous(base.get("dangerous", []))

    for name in charset_names:
        data = load_charset(name)
        ranges_set.update(_parse_ranges(data.get("emoji_ranges", [])))
        ranges_set.update(_parse_ranges(data.get("extra_ranges", [])))
        dangerous.update(_parse_dangerous(data.get("dangerous", [])))

    for path in charset_files:
        data = load_charset(path)
        ranges_set.update(_parse_ranges(data.get("emoji_ranges", [])))
        ranges_set.update(_parse_ranges(data.get("extra_ranges", [])))
        dangerous.update(_parse_dangerous(data.get("dangerous", [])))

    return sorted(ranges_set), dangerous
```

**Step 5: Run tests to verify they pass**

Run: `cd python && python -m pytest tests/test_check_chars.py -k "load_charset or resolve_charsets" -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add python/src/apdev/check_chars.py python/tests/test_check_chars.py
git commit -m "feat(python): add load_charset and resolve_charsets"
```

---

### Task 4: Python — refactor `check_file` / `check_paths` to use loaded charsets

**Files:**
- Modify: `python/src/apdev/check_chars.py`
- Modify: `python/tests/test_check_chars.py`

**Step 1: Write failing test — CJK allowed with chinese charset**

Add to `python/tests/test_check_chars.py`:

```python
def test_check_file_with_chinese_charset(tmp_path: Path) -> None:
    """Chinese characters should pass when chinese charset is active."""
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n", encoding="utf-8")
    ranges, dangerous = resolve_charsets(["chinese"], [])
    problems = check_file(f, extra_ranges=ranges, dangerous=dangerous)
    assert problems == []


def test_check_paths_with_charset(tmp_path: Path) -> None:
    """check_paths passes charsets through to check_file."""
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n", encoding="utf-8")
    ranges, dangerous = resolve_charsets(["chinese"], [])
    assert check_paths([f], extra_ranges=ranges, dangerous=dangerous) == 0
```

**Step 2: Run test to verify it fails**

Run: `cd python && python -m pytest tests/test_check_chars.py::test_check_file_with_chinese_charset -v`
Expected: FAIL — `TypeError: check_file() got an unexpected keyword argument 'extra_ranges'`

**Step 3: Refactor `check_file` and `check_paths`**

Replace the hardcoded globals approach. Change signatures:

```python
def check_file(
    path: Path,
    *,
    max_problems: int = 5,
    extra_ranges: list[tuple[int, int]] | None = None,
    dangerous: dict[int, str] | None = None,
) -> list[str]:
```

Inside the function, if `extra_ranges` is None, use the default loaded from base.json. Same pattern for `dangerous`. Replace calls to `is_allowed_char` and `is_dangerous_char` with local lookups against the provided ranges/dangerous.

Keep `is_allowed_char()` and `is_dangerous_char()` as public API (they use the hardcoded base defaults for backward compatibility).

Similarly update `check_paths`:

```python
def check_paths(
    paths: list[Path],
    *,
    extra_ranges: list[tuple[int, int]] | None = None,
    dangerous: dict[int, str] | None = None,
) -> int:
```

Add a module-level lazy-loaded default:

```python
_DEFAULT_CHARSETS: tuple[list[tuple[int, int]], dict[int, str]] | None = None


def _get_defaults() -> tuple[list[tuple[int, int]], dict[int, str]]:
    global _DEFAULT_CHARSETS
    if _DEFAULT_CHARSETS is None:
        _DEFAULT_CHARSETS = resolve_charsets([], [])
    return _DEFAULT_CHARSETS
```

In `check_file`, at the top:
```python
if extra_ranges is None or dangerous is None:
    default_ranges, default_dangerous = _get_defaults()
    if extra_ranges is None:
        extra_ranges = default_ranges
    if dangerous is None:
        dangerous = default_dangerous
```

Replace the `is_dangerous_char(char)` call with `ord(char) in dangerous`.
Replace the `is_allowed_char(char)` call with a local check against `extra_ranges`.

**Step 4: Run full test suite**

Run: `cd python && python -m pytest tests/test_check_chars.py -v`
Expected: All PASS (existing tests still work, new tests pass)

**Step 5: Commit**

```bash
git add python/src/apdev/check_chars.py python/tests/test_check_chars.py
git commit -m "feat(python): check_file/check_paths accept custom charsets"
```

---

### Task 5: Python — CLI `--charset` and `--charset-file` + `APDEV_EXTRA_CHARS`

**Files:**
- Modify: `python/src/apdev/cli.py`
- Modify: `python/tests/test_cli.py`

**Step 1: Write failing CLI tests**

Add to `python/tests/test_cli.py`:

```python
def test_cli_check_chars_with_charset(tmp_path: Path) -> None:
    """--charset chinese allows CJK characters."""
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n")
    result = run_apdev("check-chars", "--charset", "chinese", str(f))
    assert result.returncode == 0


def test_cli_check_chars_with_env_var(tmp_path: Path) -> None:
    """APDEV_EXTRA_CHARS=chinese allows CJK characters."""
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n")
    result = subprocess.run(
        [sys.executable, "-m", "apdev", "check-chars", str(f)],
        capture_output=True,
        text=True,
        env={**os.environ, "APDEV_EXTRA_CHARS": "chinese"},
    )
    assert result.returncode == 0


def test_cli_check_chars_cli_overrides_env(tmp_path: Path) -> None:
    """CLI --charset overrides APDEV_EXTRA_CHARS (env says chinese, CLI says nothing extra)."""
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n")
    # env says chinese, but no --charset on CLI -> env applies
    result = subprocess.run(
        [sys.executable, "-m", "apdev", "check-chars", str(f)],
        capture_output=True,
        text=True,
        env={**os.environ, "APDEV_EXTRA_CHARS": "chinese"},
    )
    assert result.returncode == 0


def test_cli_check_chars_charset_file(tmp_path: Path) -> None:
    """--charset-file with custom JSON allows specified ranges."""
    custom = tmp_path / "custom.json"
    custom.write_text('{"name":"custom","extra_ranges":[{"start":"0x4E00","end":"0x9FFF","name":"CJK"}]}')
    f = tmp_path / "cn.py"
    f.write_text("x = '中文'\n")
    result = run_apdev("check-chars", "--charset-file", str(custom), str(f))
    assert result.returncode == 0
```

Add `import os` at top of test file.

**Step 2: Run tests to verify they fail**

Run: `cd python && python -m pytest tests/test_cli.py::test_cli_check_chars_with_charset -v`
Expected: FAIL — unrecognized argument `--charset`

**Step 3: Update `cli.py` check-chars subparser**

In `_build_parser()`, after the existing `chars_parser.add_argument("files", ...)`, add:

```python
chars_parser.add_argument(
    "--charset",
    action="append",
    default=[],
    help="Extra charset preset to enable (repeatable, e.g. --charset chinese)",
)
chars_parser.add_argument(
    "--charset-file",
    action="append",
    default=[],
    dest="charset_files",
    help="Path to custom charset JSON file (repeatable)",
)
```

In `main()`, update the check-chars branch:

```python
if args.command == "check-chars":
    from apdev.check_chars import resolve_charsets

    charset_names = args.charset
    charset_files = args.charset_files

    # Fall back to APDEV_EXTRA_CHARS env var if no CLI args
    if not charset_names and not charset_files:
        env_val = os.environ.get("APDEV_EXTRA_CHARS", "")
        if env_val:
            for item in env_val.split(","):
                item = item.strip()
                if not item:
                    continue
                if os.sep in item or item.endswith(".json"):
                    charset_files.append(item)
                else:
                    charset_names.append(item)

    extra_ranges, dangerous = resolve_charsets(charset_names, charset_files)
    return check_paths(args.files, extra_ranges=extra_ranges, dangerous=dangerous)
```

**Step 4: Run full test suite**

Run: `cd python && python -m pytest tests/ -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python/src/apdev/cli.py python/tests/test_cli.py
git commit -m "feat(python): add --charset, --charset-file, APDEV_EXTRA_CHARS to CLI"
```

---

### Task 6: TypeScript — `loadCharset()` and `resolveCharsets()`

**Files:**
- Modify: `typescript/src/check-chars.ts`
- Modify: `typescript/tests/check-chars.test.ts`

**Step 1: Write failing tests for `loadCharset`**

Add to `typescript/tests/check-chars.test.ts`:

```typescript
import { loadCharset, resolveCharsets } from "../src/check-chars.js";

describe("loadCharset", () => {
  it("loads base charset", () => {
    const data = loadCharset("base");
    expect(data.name).toBe("base");
    expect(data.emoji_ranges.length).toBeGreaterThan(0);
    expect(data.extra_ranges.length).toBeGreaterThan(0);
    expect(data.dangerous.length).toBeGreaterThan(0);
  });

  it("loads chinese charset", () => {
    const data = loadCharset("chinese");
    expect(data.name).toBe("chinese");
    expect(data.extra_ranges.length).toBeGreaterThan(0);
  });

  it("throws for unknown charset", () => {
    expect(() => loadCharset("nonexistent")).toThrow();
  });

  it("loads from absolute file path", () => {
    const dir = makeTmpDir();
    const f = join(dir, "custom.json");
    writeFileSync(f, JSON.stringify({
      name: "custom",
      extra_ranges: [{ start: "0x4E00", end: "0x9FFF", name: "CJK" }],
    }));
    const data = loadCharset(f);
    expect(data.name).toBe("custom");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd typescript && npx vitest run tests/check-chars.test.ts`
Expected: FAIL — `loadCharset is not a function`

**Step 3: Write failing tests for `resolveCharsets`**

```typescript
describe("resolveCharsets", () => {
  it("returns base ranges by default", () => {
    const { ranges, dangerous } = resolveCharsets([], []);
    expect(ranges.length).toBeGreaterThan(0);
    expect(dangerous.size).toBeGreaterThan(0);
  });

  it("includes CJK range with chinese charset", () => {
    const { ranges } = resolveCharsets(["chinese"], []);
    const hasCjk = ranges.some(([s, e]) => s <= 0x4E00 && 0x9FFF <= e);
    expect(hasCjk).toBe(true);
  });

  it("includes custom file ranges", () => {
    const dir = makeTmpDir();
    const f = join(dir, "custom.json");
    writeFileSync(f, JSON.stringify({
      name: "custom",
      extra_ranges: [{ start: "0xABCD", end: "0xABFF", name: "Test" }],
    }));
    const { ranges } = resolveCharsets([], [f]);
    const hasCustom = ranges.some(([s, e]) => s <= 0xABCD && 0xABFF <= e);
    expect(hasCustom).toBe(true);
  });

  it("deduplicates overlapping charset ranges", () => {
    const { ranges } = resolveCharsets(["chinese", "japanese"], []);
    const cjkCount = ranges.filter(([s, e]) => s === 0x4E00 && e === 0x9FFF).length;
    expect(cjkCount).toBe(1);
  });
});
```

**Step 4: Implement `loadCharset` and `resolveCharsets`**

Add to `typescript/src/check-chars.ts`:

```typescript
import { readFileSync, existsSync } from "node:fs";
import { extname, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface RangeEntry {
  start: string;
  end: string;
  name: string;
}

interface DangerousEntry {
  code: string;
  name: string;
}

interface CharsetData {
  name: string;
  description?: string;
  emoji_ranges?: RangeEntry[];
  extra_ranges?: RangeEntry[];
  dangerous?: DangerousEntry[];
}

function getCharsetsDir(): string {
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  return join(thisDir, "..", "src", "charsets");
}

export function loadCharset(nameOrPath: string): CharsetData {
  if (nameOrPath.includes(sep) || nameOrPath.includes("/") || nameOrPath.endsWith(".json")) {
    if (!existsSync(nameOrPath)) {
      throw new Error(`Charset file not found: ${nameOrPath}`);
    }
    return JSON.parse(readFileSync(nameOrPath, "utf-8"));
  }
  const filePath = join(getCharsetsDir(), `${nameOrPath}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Unknown charset: ${nameOrPath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function parseRanges(entries: RangeEntry[]): [number, number][] {
  return entries.map((e) => [parseInt(e.start, 16), parseInt(e.end, 16)]);
}

function parseDangerous(entries: DangerousEntry[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const e of entries) {
    map.set(parseInt(e.code, 16), e.name);
  }
  return map;
}

export function resolveCharsets(
  charsetNames: string[],
  charsetFiles: string[],
): { ranges: [number, number][]; dangerous: Map<number, string> } {
  const base = loadCharset("base");
  const rangesSet = new Map<string, [number, number]>();
  const dangerous = parseDangerous(base.dangerous ?? []);

  function addRanges(entries: RangeEntry[]) {
    for (const [s, e] of parseRanges(entries)) {
      rangesSet.set(`${s}-${e}`, [s, e]);
    }
  }

  addRanges(base.emoji_ranges ?? []);
  addRanges(base.extra_ranges ?? []);

  for (const name of charsetNames) {
    const data = loadCharset(name);
    addRanges(data.emoji_ranges ?? []);
    addRanges(data.extra_ranges ?? []);
    if (data.dangerous) {
      for (const [code, dname] of parseDangerous(data.dangerous)) {
        dangerous.set(code, dname);
      }
    }
  }

  for (const path of charsetFiles) {
    const data = loadCharset(path);
    addRanges(data.emoji_ranges ?? []);
    addRanges(data.extra_ranges ?? []);
    if (data.dangerous) {
      for (const [code, dname] of parseDangerous(data.dangerous)) {
        dangerous.set(code, dname);
      }
    }
  }

  const ranges = [...rangesSet.values()].sort((a, b) => a[0] - b[0]);
  return { ranges, dangerous };
}
```

**Step 5: Run tests to verify they pass**

Run: `cd typescript && npx vitest run tests/check-chars.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add typescript/src/check-chars.ts typescript/tests/check-chars.test.ts
git commit -m "feat(ts): add loadCharset and resolveCharsets"
```

---

### Task 7: TypeScript — refactor `checkFile` / `checkPaths` to use loaded charsets

**Files:**
- Modify: `typescript/src/check-chars.ts`
- Modify: `typescript/tests/check-chars.test.ts`

**Step 1: Write failing test — CJK allowed with chinese charset**

Add to `typescript/tests/check-chars.test.ts`:

```typescript
it("allows CJK with chinese charset", () => {
  const dir = makeTmpDir();
  const f = join(dir, "cn.ts");
  writeFileSync(f, "const x = '\u4E2D\u6587';\n", "utf-8");
  const { ranges, dangerous } = resolveCharsets(["chinese"], []);
  const problems = checkFile(f, 5, ranges, dangerous);
  expect(problems).toEqual([]);
});

it("check_paths passes charsets through", () => {
  const dir = makeTmpDir();
  const f = join(dir, "cn.ts");
  writeFileSync(f, "const x = '\u4E2D';\n", "utf-8");
  const { ranges, dangerous } = resolveCharsets(["chinese"], []);
  expect(checkPaths([f], ranges, dangerous)).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `checkFile` doesn't accept ranges/dangerous args

**Step 3: Update `checkFile` and `checkPaths` signatures**

Add optional parameters:

```typescript
export function checkFile(
  filePath: string,
  maxProblems = 5,
  extraRanges?: [number, number][],
  dangerousMap?: Map<number, string>,
): string[] {
```

At the top of the function body:

```typescript
if (!extraRanges || !dangerousMap) {
  const defaults = resolveCharsets([], []);
  extraRanges ??= defaults.ranges;
  dangerousMap ??= defaults.dangerous;
}
```

Replace `isDangerousChar(char)` with `dangerousMap.has(code)`.
Replace `isAllowedChar(char)` with a local check:
```typescript
function isInRanges(code: number, ranges: [number, number][]): boolean {
  if (code <= 127) return true;
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return true;
  }
  return false;
}
```

Similarly update `checkPaths`:

```typescript
export function checkPaths(
  paths: string[],
  extraRanges?: [number, number][],
  dangerousMap?: Map<number, string>,
): number {
```

Pass them through to `checkFile`.

**Step 4: Run full test suite**

Run: `cd typescript && npx vitest run tests/check-chars.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add typescript/src/check-chars.ts typescript/tests/check-chars.test.ts
git commit -m "feat(ts): checkFile/checkPaths accept custom charsets"
```

---

### Task 8: TypeScript — CLI `--charset` and `--charset-file` + `APDEV_EXTRA_CHARS`

**Files:**
- Modify: `typescript/src/cli.ts`
- Modify: `typescript/tests/cli.test.ts`

**Step 1: Write failing CLI tests**

Add to `typescript/tests/cli.test.ts`:

```typescript
it("check-chars --charset chinese allows CJK", () => {
  const dir = makeTmpDir();
  const f = join(dir, "cn.ts");
  writeFileSync(f, "const x = '\u4E2D\u6587';\n");
  const result = runApdev("check-chars", "--charset", "chinese", f);
  expect(result.status).toBe(0);
});

it("check-chars with APDEV_EXTRA_CHARS=chinese allows CJK", () => {
  const dir = makeTmpDir();
  const f = join(dir, "cn.ts");
  writeFileSync(f, "const x = '\u4E2D\u6587';\n");
  try {
    const stdout = execFileSync("node", [CLI_PATH, "check-chars", f], {
      encoding: "utf-8",
      env: { ...process.env, APDEV_EXTRA_CHARS: "chinese" },
      timeout: 10000,
    });
    // exit 0 means pass
  } catch (e: unknown) {
    const err = e as { status?: number };
    expect(err.status).toBe(0);
  }
});

it("check-chars --charset-file allows custom ranges", () => {
  const dir = makeTmpDir();
  const custom = join(dir, "custom.json");
  writeFileSync(custom, JSON.stringify({
    name: "custom",
    extra_ranges: [{ start: "0x4E00", end: "0x9FFF", name: "CJK" }],
  }));
  const f = join(dir, "cn.ts");
  writeFileSync(f, "const x = '\u4E2D';\n");
  const result = runApdev("check-chars", "--charset-file", custom, f);
  expect(result.status).toBe(0);
});
```

**Step 2: Run tests to verify they fail**

Expected: FAIL — unknown option `--charset`

**Step 3: Update `cli.ts` check-chars command**

```typescript
program
  .command("check-chars")
  .description("Validate files contain only allowed characters")
  .argument("<files...>", "Files to check")
  .option("--charset <name>", "Extra charset preset (repeatable)", collect, [])
  .option("--charset-file <path>", "Custom charset JSON file (repeatable)", collect, [])
  .action((files: string[], opts: { charset: string[]; charsetFile: string[] }) => {
    let charsetNames = opts.charset;
    let charsetFiles = opts.charsetFile;

    // Fall back to APDEV_EXTRA_CHARS env var
    if (charsetNames.length === 0 && charsetFiles.length === 0) {
      const envVal = process.env.APDEV_EXTRA_CHARS ?? "";
      if (envVal) {
        for (const item of envVal.split(",")) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          if (trimmed.includes("/") || trimmed.includes(sep) || trimmed.endsWith(".json")) {
            charsetFiles.push(trimmed);
          } else {
            charsetNames.push(trimmed);
          }
        }
      }
    }

    const { ranges, dangerous } = resolveCharsets(charsetNames, charsetFiles);
    const resolved = files.map((f) => resolve(f));
    const code = checkPaths(resolved, ranges, dangerous);
    process.exit(code);
  });
```

Add the `collect` helper at the top of the file:

```typescript
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
```

Add import for `resolveCharsets`:
```typescript
import { checkPaths, resolveCharsets } from "./check-chars.js";
```

**Step 4: Build and run full test suite**

Run: `cd typescript && npx tsup && npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add typescript/src/cli.ts typescript/tests/cli.test.ts
git commit -m "feat(ts): add --charset, --charset-file, APDEV_EXTRA_CHARS to CLI"
```

---

### Task 9: Update exports and clean up hardcoded constants

**Files:**
- Modify: `typescript/src/index.ts` — export `loadCharset`, `resolveCharsets`
- Modify: `python/src/apdev/check_chars.py` — remove old hardcoded constants that are now redundant (keep `is_allowed_char` and `is_dangerous_char` for backward compat using lazy-loaded defaults)
- Modify: `typescript/src/check-chars.ts` — same cleanup

**Step 1: Update TS exports**

In `typescript/src/index.ts`, add:
```typescript
export { loadCharset, resolveCharsets } from "./check-chars.js";
```

**Step 2: Remove hardcoded `EMOJI_RANGES`, `EXTRA_ALLOWED_RANGES`, `DANGEROUS_CODEPOINTS` from both implementations**

Replace them with lazy-loaded defaults from `base.json`. Keep `is_allowed_char()` / `isAllowedChar()` and `is_dangerous_char()` / `isDangerousChar()` as public API that use the defaults.

**Step 3: Run full test suites in both languages**

Run: `cd python && python -m pytest tests/ -v`
Run: `cd typescript && npx tsup && npx vitest run`
Expected: All PASS in both

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove hardcoded charsets, load from base.json"
```
