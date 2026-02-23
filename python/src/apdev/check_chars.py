"""Character validation tool.

Checks that files contain only allowed characters: ASCII, common emoji,
and standard technical symbols (arrows, box-drawing, math operators, etc.).

Additionally flags dangerous invisible/bidi characters in code regions
(Trojan Source - CVE-2021-42574) while allowing them in comments.
"""

from __future__ import annotations

import importlib.resources
import json
import os
from pathlib import Path


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
    try:
        text = ref.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"Unknown charset: {name_or_path}")
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


# Allowed Unicode ranges beyond ASCII (0-127)
EMOJI_RANGES: list[tuple[int, int]] = [
    (0x1F300, 0x1F5FF),  # Symbols and Pictographs
    (0x1F600, 0x1F64F),  # Emoticons
    (0x1F680, 0x1F6FF),  # Transport and Map Symbols
    (0x1F780, 0x1F7FF),  # Geometric Shapes Extended
    (0x1F900, 0x1F9FF),  # Supplemental Symbols and Pictographs
    (0x2600, 0x26FF),    # Miscellaneous Symbols
    (0x2700, 0x27BF),    # Dingbats
]

EXTRA_ALLOWED_RANGES: list[tuple[int, int]] = [
    (0x0080, 0x00FF),  # Latin-1 Supplement
    (0x2000, 0x206F),  # General Punctuation
    (0x2100, 0x214F),  # Letterlike Symbols
    (0x2190, 0x21FF),  # Arrows
    (0x2200, 0x22FF),  # Mathematical Operators
    (0x2300, 0x23FF),  # Miscellaneous Technical
    (0x2500, 0x257F),  # Box Drawing
    (0x2580, 0x259F),  # Block Elements
    (0x25A0, 0x25FF),  # Geometric Shapes
    (0x2800, 0x28FF),  # Braille Patterns
    (0x2B00, 0x2BFF),  # Miscellaneous Symbols and Arrows
    (0xFE00, 0xFE0F),  # Variation Selectors
]

_ALL_RANGES = EMOJI_RANGES + EXTRA_ALLOWED_RANGES

# Dangerous codepoints that pass the allowed-range check but should be
# flagged when they appear in code (not comments).  These are within the
# General Punctuation range (0x2000-0x206F) which is broadly allowed.
DANGEROUS_CODEPOINTS: dict[int, str] = {
    # Bidi control characters (Trojan Source - CVE-2021-42574)
    0x202A: "LEFT-TO-RIGHT EMBEDDING",
    0x202B: "RIGHT-TO-LEFT EMBEDDING",
    0x202C: "POP DIRECTIONAL FORMATTING",
    0x202D: "LEFT-TO-RIGHT OVERRIDE",
    0x202E: "RIGHT-TO-LEFT OVERRIDE",
    0x2066: "LEFT-TO-RIGHT ISOLATE",
    0x2067: "RIGHT-TO-LEFT ISOLATE",
    0x2068: "FIRST STRONG ISOLATE",
    0x2069: "POP DIRECTIONAL ISOLATE",
    # Zero-width characters
    0x200B: "ZERO WIDTH SPACE",
    0x200C: "ZERO WIDTH NON-JOINER",
    0x200D: "ZERO WIDTH JOINER",
    0x200E: "LEFT-TO-RIGHT MARK",
    0x200F: "RIGHT-TO-LEFT MARK",
    0x2060: "WORD JOINER",
}

_PYTHON_SUFFIXES = {".py"}
_JS_SUFFIXES = {".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"}


def is_allowed_char(c: str) -> bool:
    """Return True if the character is in the allowed set."""
    code = ord(c)
    if code <= 127:
        return True
    for start, end in _ALL_RANGES:
        if start <= code <= end:
            return True
    return False


def is_dangerous_char(c: str) -> bool:
    """Return True if the character is a dangerous invisible/bidi codepoint."""
    return ord(c) in DANGEROUS_CODEPOINTS


def _compute_comment_mask(content: str, suffix: str) -> set[int]:
    """Return the set of character indices that are within comments.

    Uses a simple state machine that tracks string literals to avoid
    treating ``#`` / ``//`` inside strings as comment starts.
    """
    if suffix in _PYTHON_SUFFIXES:
        return _compute_comment_mask_python(content)
    if suffix in _JS_SUFFIXES:
        return _compute_comment_mask_js(content)
    return set()


def _compute_comment_mask_python(content: str) -> set[int]:
    mask: set[int] = set()
    i = 0
    n = len(content)

    while i < n:
        # Triple-quoted strings (""" or ''')
        if i + 2 < n and content[i : i + 3] in ('"""', "'''"):
            quote = content[i : i + 3]
            i += 3
            while i < n:
                if content[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if i + 2 < n and content[i : i + 3] == quote:
                    i += 3
                    break
                i += 1
            continue

        # Single / double quoted strings
        if content[i] in ('"', "'"):
            quote_char = content[i]
            i += 1
            while i < n and content[i] != "\n":
                if content[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if content[i] == quote_char:
                    i += 1
                    break
                i += 1
            continue

        # Line comment
        if content[i] == "#":
            while i < n and content[i] != "\n":
                mask.add(i)
                i += 1
            continue

        i += 1

    return mask


def _compute_comment_mask_js(content: str) -> set[int]:
    mask: set[int] = set()
    i = 0
    n = len(content)

    while i < n:
        # Template literal
        if content[i] == "`":
            i += 1
            while i < n:
                if content[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if content[i] == "`":
                    i += 1
                    break
                i += 1
            continue

        # Single / double quoted strings
        if content[i] in ('"', "'"):
            quote_char = content[i]
            i += 1
            while i < n and content[i] != "\n":
                if content[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if content[i] == quote_char:
                    i += 1
                    break
                i += 1
            continue

        # Line comment
        if i + 1 < n and content[i : i + 2] == "//":
            while i < n and content[i] != "\n":
                mask.add(i)
                i += 1
            continue

        # Block comment
        if i + 1 < n and content[i : i + 2] == "/*":
            while i < n:
                if i + 1 < n and content[i : i + 2] == "*/":
                    mask.add(i)
                    mask.add(i + 1)
                    i += 2
                    break
                mask.add(i)
                i += 1
            continue

        i += 1

    return mask


def _is_in_ranges(c: str, ranges: list[tuple[int, int]]) -> bool:
    """Return True if the character is in any of the given ranges or ASCII."""
    code = ord(c)
    if code <= 127:
        return True
    for start, end in ranges:
        if start <= code <= end:
            return True
    return False


def check_file(
    path: Path,
    *,
    max_problems: int = 5,
    extra_ranges: list[tuple[int, int]] | None = None,
    dangerous: dict[int, str] | None = None,
) -> list[str]:
    """Check a single file for illegal characters.

    Returns a list of problem descriptions (empty if the file is clean).
    """
    problems: list[str] = []
    if extra_ranges is None or dangerous is None:
        default_ranges, default_dangerous = resolve_charsets([], [])
        if extra_ranges is None:
            extra_ranges = default_ranges
        if dangerous is None:
            dangerous = default_dangerous
    try:
        content = path.read_text(encoding="utf-8")
        suffix = path.suffix.lower()
        comment_mask = _compute_comment_mask(content, suffix)
        for i, char in enumerate(content):
            if ord(char) in dangerous:
                if i not in comment_mask:
                    code = ord(char)
                    name = dangerous[code]
                    problems.append(
                        f"Dangerous character in code at position {i + 1}: "
                        f"U+{code:04X} ({name})"
                    )
            elif not _is_in_ranges(char, extra_ranges):
                problems.append(
                    f"Illegal character at position {i + 1}: "
                    f"{char!r} (U+{ord(char):04X})"
                )
            if len(problems) >= max_problems:
                break
    except Exception as e:
        problems.append(f"Failed to read file: {e}")
    return problems


def check_paths(
    paths: list[Path],
    *,
    extra_ranges: list[tuple[int, int]] | None = None,
    dangerous: dict[int, str] | None = None,
) -> int:
    """Check multiple files. Returns 0 if all clean, 1 if any have problems."""
    has_error = False
    for path in paths:
        problems = check_file(path, extra_ranges=extra_ranges, dangerous=dangerous)
        if problems:
            has_error = True
            print(f"\n{path} contains illegal characters:")
            for p in problems:
                print(f"  {p}")
    return 1 if has_error else 0
