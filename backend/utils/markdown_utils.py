"""Markdown and wikilink utilities."""

import re


def extract_wikilinks(text: str) -> list[str]:
    """Extract all [[wikilink]] targets from text."""
    return re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", text)


def resolve_wikilink_to_path(wikilink: str, vault_base: str, current_dir: str) -> str | None:
    """Resolve a wikilink to a full file path. Returns None if not found."""
    import os
    # Try exact match
    path = os.path.join(vault_base, wikilink + ".md")
    if os.path.exists(path):
        return path
    # Try relative to current dir
    path = os.path.join(vault_base, current_dir, wikilink + ".md")
    if os.path.exists(path):
        return path
    return None


def sanitize_filename(name: str) -> str:
    """Remove characters illegal in filenames."""
    return re.sub(r'[\\/:*?"<>|]', "", name).strip()
