"""Tests for character validation tool."""

from pathlib import Path

from apdev.check_chars import check_file, check_paths, is_allowed_char


def test_ascii_chars_allowed() -> None:
    """All standard ASCII characters (0-127) should be allowed."""
    for i in range(128):
        assert is_allowed_char(chr(i)), f"ASCII {i} should be allowed"


def test_common_emoji_allowed() -> None:
    """Common emoji characters should be allowed."""
    emojis = ["\U0001f600", "\U0001f680", "\u2705", "\u2b50"]  # grinning, rocket, check, star
    for emoji in emojis:
        assert is_allowed_char(emoji), f"{emoji!r} should be allowed"


def test_box_drawing_allowed() -> None:
    """Box-drawing characters used in docs should be allowed."""
    chars = ["\u2500", "\u2502", "\u251c", "\u2514"]  # horizontal, vertical, tee, corner
    for ch in chars:
        assert is_allowed_char(ch), f"{ch!r} (U+{ord(ch):04X}) should be allowed"


def test_arrow_chars_allowed() -> None:
    """Arrow characters should be allowed."""
    assert is_allowed_char("\u2192")  # rightwards arrow
    assert is_allowed_char("\u2190")  # leftwards arrow


def test_chinese_chars_rejected() -> None:
    """CJK characters should be rejected by default."""
    assert not is_allowed_char("\u4e2d")  # Chinese character


def test_check_file_clean(tmp_path: Path) -> None:
    """File with only ASCII content should pass."""
    f = tmp_path / "clean.py"
    f.write_text("print('hello world')\n", encoding="utf-8")
    problems = check_file(f)
    assert problems == []


def test_check_file_with_illegal_chars(tmp_path: Path) -> None:
    """File with CJK characters should report problems."""
    f = tmp_path / "bad.py"
    f.write_text("x = '\u4e2d\u6587'\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) > 0
    assert "U+4E2D" in problems[0]


def test_check_file_max_problems(tmp_path: Path) -> None:
    """Should report at most 5 problems per file."""
    f = tmp_path / "many.py"
    # 10 CJK characters
    f.write_text("\u4e00\u4e01\u4e02\u4e03\u4e04\u4e05\u4e06\u4e07\u4e08\u4e09", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 5


def test_check_file_nonexistent(tmp_path: Path) -> None:
    """Non-existent file should report a read error."""
    problems = check_file(tmp_path / "nope.py")
    assert len(problems) == 1
    assert "Failed to read" in problems[0]


def test_check_paths_returns_exit_code(tmp_path: Path) -> None:
    """check_paths returns 0 for clean files, 1 for files with problems."""
    clean = tmp_path / "ok.py"
    clean.write_text("x = 1\n", encoding="utf-8")
    assert check_paths([clean]) == 0

    bad = tmp_path / "bad.py"
    bad.write_text("x = '\u4e2d'\n", encoding="utf-8")
    assert check_paths([bad]) == 1
