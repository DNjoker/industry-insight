"""Chinese text cleaning utilities."""

import re


def clean_text(text: str) -> str:
    """Clean and normalize Chinese text."""
    # Unify newlines
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Remove zero-width spaces and other invisible chars
    text = re.sub(r"[​‌‍﻿]", "", text)
    # Normalize fullwidth/halfwidth
    return text.strip()


def truncate_by_chars(text: str, max_chars: int) -> str:
    """Truncate text to approximately max_chars characters."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n... [已截断]"


def extract_keywords(text: str, max_keywords: int = 5) -> list[str]:
    """Extract simple keywords from Chinese text (placeholder)."""
    # This will be enhanced with proper NLP later
    return []
