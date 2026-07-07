"""Clause-boundary titles: a note's name reads like a phrase, never a mid-word cut."""

from datetime import datetime

from voice_notes.ingest import _first_line_title

CAPTURED = datetime(2026, 7, 7, 9, 30)


def test_short_lines_pass_through_untouched() -> None:
    assert _first_line_title("Remember the deposit", CAPTURED) == "Remember the deposit"


def test_title_ends_at_the_first_sentence() -> None:
    text = "Call the bank about the mortgage rate. Also pick up milk and eggs on the way home."
    assert _first_line_title(text, CAPTURED) == "Call the bank about the mortgage rate"


def test_a_tiny_opening_sentence_does_not_hijack_the_title() -> None:
    text = "Ok. So the plan for the kitchen is to start with the plumbing"
    assert _first_line_title(text, CAPTURED) == text


def test_long_speech_cuts_at_a_clause_boundary_with_ellipsis() -> None:
    text = (
        "I was thinking about the garden fence this morning, we should probably replace "
        "the whole thing before winter because the posts are rotten"
    )
    assert (
        _first_line_title(text, CAPTURED) == "I was thinking about the garden fence this morning…"
    )


def test_unpunctuated_speech_cuts_at_a_word_boundary() -> None:
    words = " ".join(["word"] * 30)
    title = _first_line_title(words, CAPTURED)
    assert title.endswith("word…")
    assert set(title.removesuffix("…").split()) == {"word"}


def test_decimals_do_not_end_the_title() -> None:
    text = "Set the thermostat to 21.5 degrees before the guests arrive tonight"
    assert _first_line_title(text, CAPTURED) == text


def test_blank_transcript_falls_back_to_the_capture_stamp() -> None:
    assert _first_line_title("", CAPTURED) == "2026-07-07 09:30"
