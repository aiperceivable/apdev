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
    except Exception as exc:
        raise FileNotFoundError(f"Unknown charset: {name_or_path}") from exc
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


def _is_in_ranges(c: str, ranges: list[tuple[int, int]]) -> bool:
    """Return True if the character is in any of the given ranges or ASCII."""
    code = ord(c)
    if code <= 127:
        return True
    for start, end in ranges:
        if start <= code <= end:
            return True
    return False


# Lazy-loaded base charset defaults for backward-compatible public API
_BASE_RANGES: list[tuple[int, int]] | None = None
_BASE_DANGEROUS: dict[int, str] | None = None


def _get_base_defaults() -> tuple[list[tuple[int, int]], dict[int, str]]:
    global _BASE_RANGES, _BASE_DANGEROUS
    if _BASE_RANGES is None or _BASE_DANGEROUS is None:
        _BASE_RANGES, _BASE_DANGEROUS = resolve_charsets([], [])
    return _BASE_RANGES, _BASE_DANGEROUS


def is_allowed_char(c: str) -> bool:
    """Return True if the character is in the base allowed set.

    Dangerous codepoints (Trojan Source vectors) are excluded even though
    they fall within allowed Unicode ranges.
    """
    ranges, dangerous = _get_base_defaults()
    if ord(c) in dangerous:
        return False
    return _is_in_ranges(c, ranges)


def is_dangerous_char(c: str) -> bool:
    """Return True if the character is a dangerous invisible/bidi codepoint."""
    _, dangerous = _get_base_defaults()
    return ord(c) in dangerous


_PYTHON_SUFFIXES = {".py"}
_JS_SUFFIXES = {".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs"}


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
        default_ranges, default_dangerous = _get_base_defaults()
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
                    f"Illegal character at position {i + 1}: " f"{char!r} (U+{ord(char):04X})"
                )
            if len(problems) >= max_problems:
                break
    except Exception as e:
        problems.append(f"Failed to read file: {e}")
    return problems


_DEFAULT_DIRS = ("src", "tests", "examples")
_DEFAULT_GLOBS = ("*.md", "*.yml", "*.yaml", "*.json", ".gitignore")


def _resolve_paths(paths: list[Path]) -> list[Path]:
    """Expand directories to files and deduplicate.

    If *paths* is empty, scan default directories (src, tests, examples)
    and common config files in the current working directory.
    Directories are expanded recursively (hidden files/dirs and binary
    files are skipped).
    """
    if not paths:
        return _default_project_files()

    result: list[Path] = []
    for p in paths:
        if p.is_dir():
            result.extend(_walk_dir(p))
        else:
            result.append(p)
    return result


def _default_project_files() -> list[Path]:
    """Collect files from default project directories and root config files."""
    cwd = Path.cwd()
    files: list[Path] = []

    for dirname in _DEFAULT_DIRS:
        d = cwd / dirname
        if d.is_dir():
            files.extend(_walk_dir(d))

    for pattern in _DEFAULT_GLOBS:
        files.extend(sorted(cwd.glob(pattern)))

    return files


_SKIP_SUFFIXES = frozenset({
    # Python bytecode
    ".pyc", ".pyo",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    # Fonts
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
    # Archives
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z",
    # Compiled / binary
    ".so", ".dylib", ".dll", ".exe", ".o", ".a", ".whl", ".egg",
    # Media
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".flac", ".ogg",
    # Documents
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    # Data
    ".db", ".sqlite", ".sqlite3", ".pickle", ".pkl",
})

_SKIP_DIRS = frozenset({
    "__pycache__", "node_modules", ".git", ".venv", "venv",
    ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "dist", "build",
})


def _walk_dir(directory: Path) -> list[Path]:
    """Recursively yield non-hidden, non-binary files under *directory*."""
    files: list[Path] = []
    for entry in sorted(directory.iterdir()):
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            if entry.name in _SKIP_DIRS or entry.name.endswith(".egg-info"):
                continue
            files.extend(_walk_dir(entry))
        elif entry.is_file():
            if entry.suffix.lower() in _SKIP_SUFFIXES:
                continue
            files.append(entry)
    return files


def check_paths(
    paths: list[Path],
    *,
    extra_ranges: list[tuple[int, int]] | None = None,
    dangerous: dict[int, str] | None = None,
) -> int:
    """Check multiple files. Returns 0 if all clean, 1 if any have problems."""
    resolved = _resolve_paths(paths)
    if not resolved:
        print("No files to check.")
        return 0

    has_error = False
    checked = 0
    for path in resolved:
        problems = check_file(path, extra_ranges=extra_ranges, dangerous=dangerous)
        checked += 1
        if problems:
            has_error = True
            print(f"\n{path} contains illegal characters:")
            for p in problems:
                print(f"  {p}")
    if not has_error:
        print(f"All {checked} files passed.")
    return 1 if has_error else 0
