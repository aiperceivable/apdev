"""Tests for character validation tool."""

from pathlib import Path

from apdev.check_chars import (
    check_file,
    check_paths,
    is_allowed_char,
    is_dangerous_char,
    load_charset,
    resolve_charsets,
)


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


def test_block_elements_allowed() -> None:
    """Block element characters used in progress bars should be allowed."""
    chars = ["\u2580", "\u2584", "\u2588", "\u2591", "\u2592", "\u2593"]  # ▀ ▄ █ ░ ▒ ▓
    for ch in chars:
        assert is_allowed_char(ch), f"{ch!r} (U+{ord(ch):04X}) should be allowed"


def test_braille_patterns_allowed() -> None:
    """Braille pattern characters used in terminal graphics should be allowed."""
    chars = ["\u2800", "\u2801", "\u28ff", "\u2840"]  # ⠀ ⠁ ⣿ ⡀
    for ch in chars:
        assert is_allowed_char(ch), f"{ch!r} (U+{ord(ch):04X}) should be allowed"


def test_dangerous_chars_not_allowed() -> None:
    """Dangerous codepoints should NOT pass is_allowed_char even though they
    fall within the General Punctuation allowed range."""
    assert not is_allowed_char("\u200b")  # ZERO WIDTH SPACE
    assert not is_allowed_char("\u202e")  # RIGHT-TO-LEFT OVERRIDE
    assert not is_allowed_char("\u2066")  # LEFT-TO-RIGHT ISOLATE
    assert not is_allowed_char("\u2060")  # WORD JOINER


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


# ---------------------------------------------------------------------------
# Dangerous character tests
# ---------------------------------------------------------------------------


def test_is_dangerous_char() -> None:
    """is_dangerous_char identifies all 15 dangerous codepoints."""
    # Bidi controls
    assert is_dangerous_char("\u202a")
    assert is_dangerous_char("\u202e")
    assert is_dangerous_char("\u2066")
    assert is_dangerous_char("\u2069")
    # Zero-width
    assert is_dangerous_char("\u200b")
    assert is_dangerous_char("\u200d")
    assert is_dangerous_char("\u200e")
    assert is_dangerous_char("\u2060")
    # Normal chars should not be dangerous
    assert not is_dangerous_char("a")
    assert not is_dangerous_char("\u2014")  # em dash (General Punctuation, safe)


def test_dangerous_bidi_in_python_code_detected(tmp_path: Path) -> None:
    """Bidi override character in Python code should be flagged."""
    f = tmp_path / "trojan.py"
    # U+202E RIGHT-TO-LEFT OVERRIDE in code
    f.write_text("x = '\u202e'\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Dangerous character in code" in problems[0]
    assert "U+202E" in problems[0]


def test_dangerous_bidi_in_python_comment_allowed(tmp_path: Path) -> None:
    """Bidi character inside a Python # comment should be allowed."""
    f = tmp_path / "safe.py"
    f.write_text("x = 1  # test \u202e bidi\n", encoding="utf-8")
    problems = check_file(f)
    assert problems == []


def test_zero_width_in_python_code_detected(tmp_path: Path) -> None:
    """Zero-width space in Python code should be flagged."""
    f = tmp_path / "zw.py"
    f.write_text("x\u200b= 1\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "ZERO WIDTH SPACE" in problems[0]


def test_dangerous_char_in_python_string_detected(tmp_path: Path) -> None:
    """Dangerous char inside a string literal is still code, not a comment."""
    f = tmp_path / "str.py"
    f.write_text("s = 'hello\u200bworld'\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Dangerous character in code" in problems[0]


def test_dangerous_bidi_in_js_line_comment_allowed(tmp_path: Path) -> None:
    """Bidi char inside a JS // comment should be allowed."""
    f = tmp_path / "safe.js"
    f.write_text("let x = 1; // test \u202e bidi\n", encoding="utf-8")
    problems = check_file(f)
    assert problems == []


def test_dangerous_bidi_in_js_block_comment_allowed(tmp_path: Path) -> None:
    """Bidi char inside a JS /* */ comment should be allowed."""
    f = tmp_path / "safe.ts"
    f.write_text("/* \u202e bidi */\nlet x = 1;\n", encoding="utf-8")
    problems = check_file(f)
    assert problems == []


def test_dangerous_bidi_in_js_code_detected(tmp_path: Path) -> None:
    """Bidi char in JS code should be flagged."""
    f = tmp_path / "trojan.ts"
    f.write_text("let x = '\u202e';\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Dangerous character in code" in problems[0]


def test_cjk_still_rejected_after_dangerous_check(tmp_path: Path) -> None:
    """CJK characters should still be caught as illegal (not dangerous)."""
    f = tmp_path / "cjk.py"
    f.write_text("x = '\u4e2d'\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Illegal character" in problems[0]


def test_hash_in_python_string_not_treated_as_comment(tmp_path: Path) -> None:
    """# inside a string should not start a comment region."""
    f = tmp_path / "hash_str.py"
    # The \u202e is after the string, in code – should be flagged
    f.write_text("s = '# not a comment'\u202e\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Dangerous character in code" in problems[0]


def test_unknown_extension_treats_all_as_code(tmp_path: Path) -> None:
    """For unknown extensions, all chars are treated as code (conservative)."""
    f = tmp_path / "file.txt"
    f.write_text("hello \u202e world\n", encoding="utf-8")
    problems = check_file(f)
    assert len(problems) == 1
    assert "Dangerous character in code" in problems[0]


# ---------------------------------------------------------------------------
# Charset loading tests
# ---------------------------------------------------------------------------


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
    custom.write_text(
        '{"name":"custom","extra_ranges":[{"start":"0x4E00","end":"0x9FFF","name":"CJK"}]}'
    )
    data = load_charset(str(custom))
    assert data["name"] == "custom"


def test_resolve_charsets_default() -> None:
    """No extra charsets returns base ranges only."""
    ranges, dangerous = resolve_charsets([], [])
    assert len(ranges) > 0
    assert len(dangerous) > 0
    # CJK should NOT be in ranges
    assert not any(0x4E00 <= s and e <= 0x9FFF for s, e in ranges)


def test_resolve_charsets_with_chinese() -> None:
    """Adding 'chinese' charset includes CJK Unified Ideographs."""
    ranges, dangerous = resolve_charsets(["chinese"], [])
    assert any(s <= 0x4E00 and 0x9FFF <= e for s, e in ranges)


def test_resolve_charsets_with_custom_file(tmp_path: Path) -> None:
    """Custom charset file ranges are merged."""
    custom = tmp_path / "custom.json"
    custom.write_text(
        '{"name":"custom","extra_ranges":[{"start":"0xABCD","end":"0xABFF","name":"Test"}]}'
    )
    ranges, _ = resolve_charsets([], [str(custom)])
    assert any(s <= 0xABCD and 0xABFF <= e for s, e in ranges)


def test_resolve_charsets_deduplicates() -> None:
    """Duplicate ranges from overlapping charsets are deduplicated."""
    ranges, _ = resolve_charsets(["chinese", "japanese"], [])
    cjk_count = sum(1 for s, e in ranges if s == 0x4E00 and e == 0x9FFF)
    assert cjk_count == 1


# ---------------------------------------------------------------------------
# check_file / check_paths with custom charsets
# ---------------------------------------------------------------------------


def test_check_file_with_chinese_charset(tmp_path: Path) -> None:
    """Chinese characters should pass when chinese charset is active."""
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n", encoding="utf-8")
    ranges, dangerous = resolve_charsets(["chinese"], [])
    problems = check_file(f, extra_ranges=ranges, dangerous=dangerous)
    assert problems == []


def test_check_paths_with_charset(tmp_path: Path) -> None:
    """check_paths passes charsets through to check_file."""
    f = tmp_path / "cn.py"
    f.write_text("x = '\u4e2d\u6587'\n", encoding="utf-8")
    ranges, dangerous = resolve_charsets(["chinese"], [])
    assert check_paths([f], extra_ranges=ranges, dangerous=dangerous) == 0
