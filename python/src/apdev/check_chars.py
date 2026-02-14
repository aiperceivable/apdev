"""Character validation tool.

Checks that files contain only allowed characters: ASCII, common emoji,
and standard technical symbols (arrows, box-drawing, math operators, etc.).
"""

from __future__ import annotations

from pathlib import Path

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
    (0x25A0, 0x25FF),  # Geometric Shapes
    (0x2B00, 0x2BFF),  # Miscellaneous Symbols and Arrows
    (0xFE00, 0xFE0F),  # Variation Selectors
]

_ALL_RANGES = EMOJI_RANGES + EXTRA_ALLOWED_RANGES


def is_allowed_char(c: str) -> bool:
    """Return True if the character is in the allowed set."""
    code = ord(c)
    if code <= 127:
        return True
    for start, end in _ALL_RANGES:
        if start <= code <= end:
            return True
    return False


def check_file(path: Path, *, max_problems: int = 5) -> list[str]:
    """Check a single file for illegal characters.

    Returns a list of problem descriptions (empty if the file is clean).
    """
    problems: list[str] = []
    try:
        content = path.read_text(encoding="utf-8")
        for i, char in enumerate(content, 1):
            if not is_allowed_char(char):
                problems.append(
                    f"Illegal character at position {i}: {char!r} (U+{ord(char):04X})"
                )
                if len(problems) >= max_problems:
                    break
    except Exception as e:
        problems.append(f"Failed to read file: {e}")
    return problems


def check_paths(paths: list[Path]) -> int:
    """Check multiple files. Returns 0 if all clean, 1 if any have problems."""
    has_error = False
    for path in paths:
        problems = check_file(path)
        if problems:
            has_error = True
            print(f"\n{path} contains illegal characters:")
            for p in problems:
                print(f"  {p}")
    return 1 if has_error else 0
