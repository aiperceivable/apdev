# Custom Charsets Design

## Problem

`check_chars.py` and `check-chars.ts` share identical character range definitions but maintain them separately as hardcoded constants. Users working with Chinese, Japanese, or Korean codebases have no way to allow those characters without modifying the source.

## Design

### Shared Charset Files

Character set definitions live in `shared/charsets/` as JSON files, copied to each language directory at build time.

```
apdev/
├── shared/
│   └── charsets/
│       ├── base.json        # Default (current hardcoded ranges)
│       ├── chinese.json     # CJK Ideographs + Punctuation + Fullwidth
│       ├── japanese.json    # Hiragana + Katakana + CJK Ideographs + Punctuation + Fullwidth
│       └── korean.json      # Hangul + Jamo + CJK Ideographs + Punctuation + Fullwidth
├── Makefile                 # sync-charsets target
├── python/
│   └── src/apdev/charsets/  # Copied from shared/
└── typescript/
    └── src/charsets/        # Copied from shared/
```

### JSON Format

Ranges use object style for clarity:

```json
{
  "name": "base",
  "description": "Default: ASCII + emoji + technical symbols",
  "emoji_ranges": [
    { "start": "0x1F300", "end": "0x1F5FF", "name": "Symbols and Pictographs" }
  ],
  "extra_ranges": [
    { "start": "0x0080", "end": "0x00FF", "name": "Latin-1 Supplement" }
  ],
  "dangerous": [
    { "code": "0x202A", "name": "LEFT-TO-RIGHT EMBEDDING" }
  ]
}
```

Extension charsets only need `extra_ranges`:

```json
{
  "name": "chinese",
  "description": "Chinese characters",
  "extra_ranges": [
    { "start": "0x3000", "end": "0x303F", "name": "CJK Symbols and Punctuation" },
    { "start": "0x4E00", "end": "0x9FFF", "name": "CJK Unified Ideographs" },
    { "start": "0xFF00", "end": "0xFFEF", "name": "Fullwidth Forms" }
  ]
}
```

### User Activation

Three methods, priority from high to low:

```bash
# 1. CLI parameters (highest priority)
apdev check-chars --charset chinese src/**/*.py
apdev check-chars --charset chinese --charset japanese src/**/*.py
apdev check-chars --charset-file ./my-custom.json src/**/*.py

# 2. Environment variable
APDEV_EXTRA_CHARS=chinese apdev check-chars src/**/*.py
APDEV_EXTRA_CHARS=chinese,japanese apdev check-chars src/**/*.py
APDEV_EXTRA_CHARS=chinese,/path/to/custom.json apdev check-chars src/**/*.py

# 3. Default (base.json only)
apdev check-chars src/**/*.py
```

When CLI `--charset` or `--charset-file` is provided, `APDEV_EXTRA_CHARS` is ignored.

### Preset Charsets

| File | Ranges |
|------|--------|
| `base.json` | ASCII (0-127), Latin-1 Supplement, General Punctuation, Letterlike Symbols, Arrows, Math Operators, Misc Technical, Box Drawing, Block Elements, Geometric Shapes, Braille Patterns, Misc Symbols, Dingbats, Misc Symbols & Arrows, Variation Selectors, Emoji ranges. Dangerous codepoints (bidi + zero-width). |
| `chinese.json` | CJK Symbols & Punctuation (0x3000-0x303F), CJK Unified Ideographs (0x4E00-0x9FFF), Fullwidth Forms (0xFF00-0xFFEF) |
| `japanese.json` | Hiragana (0x3040-0x309F), Katakana (0x30A0-0x30FF), CJK Symbols & Punctuation (0x3000-0x303F), CJK Unified Ideographs (0x4E00-0x9FFF), Fullwidth Forms (0xFF00-0xFFEF) |
| `korean.json` | Hangul Jamo (0x1100-0x11FF), Hangul Syllables (0xAC00-0xD7AF), CJK Symbols & Punctuation (0x3000-0x303F), CJK Unified Ideographs (0x4E00-0x9FFF), Fullwidth Forms (0xFF00-0xFFEF) |

### Code Changes

**check_chars.py / check-chars.ts:**
- Remove hardcoded range constants
- Add `load_charset(name: str) -> dict` — loads JSON from bundled `charsets/` directory
- Add `resolve_charsets(cli_charsets, cli_charset_files, env_var) -> (ranges, dangerous)` — merges base + extra charsets
- `check_file()` and `check_paths()` accept resolved ranges

**cli.py / cli.ts:**
- Add `--charset` option (repeatable)
- Add `--charset-file` option (repeatable)
- Read `APDEV_EXTRA_CHARS` environment variable
- CLI parameters override environment variable

### Build Sync

```makefile
# Makefile
sync-charsets:
	cp shared/charsets/*.json python/src/apdev/charsets/
	cp shared/charsets/*.json typescript/src/charsets/
```

Run `make sync-charsets` before release. Charset files in language directories are checked into git so installs work without the monorepo root.
