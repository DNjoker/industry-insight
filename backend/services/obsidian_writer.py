import os
import re
import tempfile
from datetime import datetime
from backend.config import settings, get_vault_path


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def atomic_write(filepath: str, content: str):
    """Write file atomically: write to .tmp first, then rename."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        suffix=".tmp", dir=os.path.dirname(filepath)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp_path, filepath)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def note_filename(title: str, max_len: int = 80) -> str:
    """Convert a title to a safe Obsidian note filename."""
    safe = re.sub(r'[\\/:*?"<>|]', "", title)
    safe = safe.strip().replace("\n", " ")
    if len(safe) > max_len:
        safe = safe[:max_len].rsplit(" ", 1)[0]
    return safe + ".md"


def generate_wikilink(note_name: str, display: str | None = None) -> str:
    """Generate an Obsidian wikilink [[note|display]]."""
    name = note_name.replace(".md", "")
    if display:
        return f"[[{name}|{display}]]"
    return f"[[{name}]]"


def build_frontmatter(extra: dict) -> str:
    """Build YAML frontmatter string."""
    lines = ["---"]
    lines.append(f"date: {datetime.now().strftime('%Y-%m-%d')}")
    for key, value in extra.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for v in value:
                lines.append(f"  - {v}")
        elif value is not None:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def save_source_article(industry: str, title: str, url: str, content: str, tags: list[str] | None = None, scan_id: str = "") -> str:
    """Save a source article to the Obsidian vault. Returns the relative path."""
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    if scan_id:
        dir_path = os.path.join(vault, "行业摸底", industry, "sources", scan_id)
    else:
        dir_path = os.path.join(vault, "行业摸底", industry, "sources")
    _ensure_dir(dir_path)

    filename = note_filename(title)
    filepath = os.path.join(dir_path, filename)

    # Check if URL already exists (don't duplicate)
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            if url in f.read():
                return os.path.join("行业摸底", industry, "sources", scan_id, filename) if scan_id else os.path.join("行业摸底", industry, "sources", filename)

    fm = build_frontmatter({
        "source_url": url,
        "industry": industry,
        "tags": tags or ["行业摸底", industry],
    })

    body = f"# {title}\n\n## 来源\n[原文链接]({url})\n\n## 全文\n{content}\n\n---\n*采集时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*"
    atomic_write(filepath, fm + body)
    if scan_id:
        return os.path.join("行业摸底", industry, "sources", scan_id, filename)
    return os.path.join("行业摸底", industry, "sources", filename)


def save_report(industry: str, report_md: str, source_paths: list[str], source_tags: dict[str, str] | None = None) -> str:
    """Save the main analysis report. Returns the relative path.

    source_tags: optional dict mapping source_path -> tag label (e.g. " [英文]").
    """
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    dir_path = os.path.join(vault, "行业摸底", industry)
    _ensure_dir(dir_path)

    timestamp = datetime.now().strftime("%Y-%m-%d %H%M%S")
    filename = f"{industry} 行业分析报告 ({timestamp}).md"
    filepath = os.path.join(dir_path, filename)

    # Source links section
    tags = source_tags or {}
    source_links = "\n".join(
        f"- {generate_wikilink(p)} {tags.get(p, '')}" for p in source_paths
    )

    fm = build_frontmatter({
        "industry": industry,
        "tags": ["行业摸底", industry],
        "sources_count": len(source_paths),
    })

    full_content = fm + report_md + f"\n\n---\n## 参考来源\n{source_links}\n"
    atomic_write(filepath, full_content)
    return os.path.join("行业摸底", industry, filename)


def update_index(industry: str, report_path: str):
    """Update the master index with the new report entry."""
    vault = get_vault_path()
    if not vault:
        return

    index_dir = os.path.join(vault, "行业摸底")
    _ensure_dir(index_dir)
    index_path = os.path.join(index_dir, "行业摸底索引.md")

    entry = f"- {datetime.now().strftime('%Y-%m-%d')} {generate_wikilink(report_path)}"

    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            existing = f.read()
        if entry in existing:
            return
        content = existing + "\n" + entry
    else:
        content = f"# 行业摸底索引\n\n{entry}\n"

    atomic_write(index_path, content)
