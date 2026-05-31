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


def save_knowledge_card(card) -> str:
    """Save a KnowledgeCard to {vault}/知识卡片/. Returns relative path."""
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    dir_path = os.path.join(vault, "知识卡片")
    _ensure_dir(dir_path)

    filename = note_filename(card.title)
    filepath = os.path.join(dir_path, filename)

    fm = build_frontmatter({
        "type": card.source_type,
        "source_url": card.source_url,
        "source_title": card.source_title,
        "tags": list(card.tags) + ["知识卡片"],
        "date": datetime.now().strftime("%Y-%m-%d"),
        "user_note": getattr(card, "user_note", None),
    })

    body_text = f"# {card.title}\n\n"
    abstract = getattr(card, "abstract", None)
    if abstract:
        body_text += f"> **摘要**: {abstract}\n\n"
    if card.source_url:
        body_text += f"> 来源: [{card.source_title or card.source_url}]({card.source_url})\n\n"
    user_note = getattr(card, "user_note", None)
    if user_note:
        body_text += f"> 备注: {user_note}\n\n"
    card_body = getattr(card, "body", "") or getattr(card, "summary", "")
    body_text += card_body
    raw = getattr(card, "raw_content", None)
    if raw:
        body_text += f"\n\n---\n## 原始提取信息\n\n{raw}"
    body_text += f"\n\n---\n*提取时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*"

    atomic_write(filepath, fm + body_text)
    return os.path.join("知识卡片", filename)


def save_chat_conversation(
    title: str,
    messages: list[dict],
    tags: list[str] | None = None,
    abstract: str = "",
    refined_content: str = "",
    overwrite_path: str | None = None,
) -> str:
    """Save a DeepSeek chat conversation to Obsidian vault.

    If refined_content is provided, saves to DeepSeek对话/已提炼/.
    Otherwise saves to DeepSeek对话/.
    If overwrite_path is given, deletes the old file after saving (for moving between folders).
    """
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    subdir = "已提炼" if refined_content else ""
    dir_path = os.path.join(vault, "DeepSeek对话", subdir)
    _ensure_dir(dir_path)

    filename = note_filename(title)
    filepath = os.path.join(dir_path, filename)

    # If overwriting with same filename, ensure we don't collide
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            existing = f.read()
        # Same title but different conversation — skip or rename? For now just overwrite
        pass

    fm = build_frontmatter({
        "tags": (tags or []) + ["deepseek", "AI对话"],
        "source": "DeepSeek Chat",
        "abstract": abstract,
        "message_count": len(messages),
        "refined": bool(refined_content),
    })

    body_lines = [f"# {title}\n"]
    if abstract:
        body_lines.append(f"> **摘要**: {abstract}\n")

    if refined_content:
        body_lines.append("## AI 提炼\n")
        body_lines.append(refined_content)
        body_lines.append("")

    body_lines.append("## 对话记录\n")

    for msg in messages:
        role_label = "**用户**" if msg.get("role") == "user" else "**DeepSeek**"
        body_lines.append(f"### {role_label}\n\n{msg.get('content', '')}\n")

    body_lines.append(f"---\n*导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")

    atomic_write(filepath, fm + "\n".join(body_lines))

    # Delete old file if moving between folders
    if overwrite_path:
        old_path = os.path.join(vault, overwrite_path)
        if os.path.exists(old_path) and os.path.normpath(old_path) != os.path.normpath(filepath):
            os.unlink(old_path)

    return os.path.join("DeepSeek对话", subdir, filename)


def save_search_source(title: str, url: str, snippet: str) -> str:
    """Save a web search source to {vault}/行业摸底/搜索来源/. Returns relative path."""
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    dir_path = os.path.join(vault, "行业摸底", "搜索来源")
    _ensure_dir(dir_path)

    filename = note_filename(title)
    filepath = os.path.join(dir_path, filename)

    # Skip if URL already saved
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            if url in f.read():
                return os.path.join("行业摸底", "搜索来源", filename)

    fm = build_frontmatter({
        "source_url": url,
        "tags": ["搜索来源", "联网搜索"],
        "date": datetime.now().strftime("%Y-%m-%d"),
    })

    body = f"# {title}\n\n## 来源\n[原文链接]({url})\n\n## 摘要\n{snippet}\n\n---\n*保存时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*"
    atomic_write(filepath, fm + body)
    return os.path.join("行业摸底", "搜索来源", filename)


def save_selling_point(
    product_name: str,
    data: dict,
    platforms: list[str],
    category: str = "",
    save_raw: bool = True,
) -> dict:
    """Save selling point generation results to Obsidian vault under 卖点整理/.

    Args:
        save_raw: If True, also saves a raw AI version for version tracking.
    Returns: {"success": True, "path": "...", "raw_path": "..."}
    """
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")

    dir_path = os.path.join(vault, "卖点整理")
    _ensure_dir(dir_path)

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    result = {}

    # ── Save main (editable) version ──────────────────────
    main_filename = note_filename(f"{product_name} 卖点整理")
    main_filepath = os.path.join(dir_path, main_filename)

    tags = ["卖点整理", "电商文案"] + ([] if not category else [category])
    fm = build_frontmatter({
        "tags": tags,
        "product": product_name,
        "platforms": platforms,
        "version": "edited",
        "generated_at": generated_at,
    })

    body_lines = _build_selling_point_body(product_name, category, data, platforms)
    body_lines.append("---")
    body_lines.append(f"*生成时间: {generated_at}*")
    body_lines.append("> 此文件为可编辑版本，AI初稿保存在同名「AI初稿」文件中")

    atomic_write(main_filepath, fm + "\n".join(body_lines))
    result["success"] = True
    result["path"] = os.path.join("卖点整理", main_filename)

    # ── Save raw AI version for tracking ──────────────────
    if save_raw:
        raw_filename = note_filename(f"{product_name} 卖点整理（AI初稿）")
        raw_filepath = os.path.join(dir_path, raw_filename)

        # Strip quality_review from raw data — raw is what AI generated
        raw_data = {k: v for k, v in data.items() if k != "quality_review"}

        raw_fm = build_frontmatter({
            "tags": tags + ["AI初稿"],
            "product": product_name,
            "platforms": platforms,
            "version": "raw-v1",
            "generated_at": generated_at,
        })

        raw_body = _build_selling_point_body(product_name, category, raw_data, platforms)

        # Append quality review if available
        qr = data.get("quality_review")
        if qr:
            raw_body.append("\n---\n## AI 质量自检报告\n")
            score = qr.get("overall_score", "N/A")
            summary = qr.get("summary", "")
            raw_body.append(f"**综合评分**: {score}/100")
            raw_body.append(f"**总结**: {summary}\n")
            issues = qr.get("issues", [])
            if issues:
                raw_body.append("### 问题清单\n")
                for iss in issues:
                    sev = {"error": "🔴", "warning": "🟡", "info": "🔵"}.get(iss.get("severity", ""), "⚪")
                    raw_body.append(f"- {sev} **{iss.get('section', '')}**: {iss.get('problem', '')}")
                    sug = iss.get("suggestion", "")
                    if sug:
                        raw_body.append(f"  → {sug}")
                raw_body.append("")
            strengths = qr.get("strengths", [])
            if strengths:
                raw_body.append("### 亮点\n")
                for s in strengths:
                    raw_body.append(f"- {s}")
                raw_body.append("")
            checks = qr.get("need_human_check", [])
            if checks:
                raw_body.append("### 人工需确认\n")
                for c in checks:
                    raw_body.append(f"- [ ] {c}")
                raw_body.append("")

        raw_body.append("---")
        raw_body.append(f"*生成时间: {generated_at}*")
        raw_body.append("> 此文件为AI初稿，仅供参考对比。修改请在主文件中进行。")

        atomic_write(raw_filepath, raw_fm + "\n".join(raw_body))
        result["raw_path"] = os.path.join("卖点整理", raw_filename)

    return result


def _build_selling_point_body(product_name: str, category: str, data: dict, platforms: list[str]) -> list[str]:
    """Build the markdown body for a selling point file. Shared by main and raw versions."""
    body_lines: list[str] = [f"# {product_name} 卖点整理\n"]
    if category:
        body_lines.append(f"**所属类目**: {category}\n")

    # Keywords
    keywords = data.get("keywords", [])
    if keywords:
        body_lines.append("## 投放关键词\n")
        body_lines.append(" ".join(f"`{kw}`" for kw in keywords))
        body_lines.append("")

    # Cross-platform FAB notes
    fab_notes = data.get("fab_platform_notes", "")
    if fab_notes:
        body_lines.append("## 跨平台FAB差异说明\n")
        body_lines.append(fab_notes)
        body_lines.append("")

    # Per-platform breakdown
    platforms_data = data.get("platforms", {})
    for pname in platforms:
        pdata = platforms_data.get(pname)
        if not pdata:
            continue
        body_lines.append(f"## {pname}\n")

        main_images = pdata.get("main_images", [])
        if main_images:
            body_lines.append("### 主图文案\n")
            for i, text in enumerate(main_images, 1):
                body_lines.append(f"{i}. {text}")
            body_lines.append("")

        selling_points = pdata.get("selling_points", [])
        if selling_points:
            body_lines.append("### FAB 卖点拆解\n")
            for sp in selling_points:
                body_lines.append(f"- **F（特点）**: {sp.get('feature', '')}")
                body_lines.append(f"  **A（优势）**: {sp.get('advantage', '')}")
                benefit = sp.get("benefit", "")
                if isinstance(benefit, dict):
                    func = benefit.get("functional", "")
                    emo = benefit.get("emotional", "")
                    if func:
                        body_lines.append(f"  **B（功能利益）**: {func}")
                    if emo:
                        body_lines.append(f"  **B（情绪利益）**: {emo}")
                else:
                    body_lines.append(f"  **B（利益）**: {benefit}")
                adapt = sp.get("platform_adaptation", "")
                if adapt:
                    body_lines.append(f"  *平台适配*: {adapt}")
                body_lines.append("")
            body_lines.append("")

        detail_page = pdata.get("detail_page", [])
        if detail_page:
            body_lines.append("### 详情页排版与文案\n")
            for i, screen in enumerate(detail_page, 1):
                body_lines.append(f"**第{i}屏：{screen.get('title', '')}**")
                body_lines.append(f"- 排版：{screen.get('layout', '—')}")
                subtitle = screen.get("subtitle") or screen.get("copy") or screen.get("content", "")
                if subtitle:
                    body_lines.append(f"- 文案：{subtitle}")
                visual = screen.get("visual") or screen.get("visual_description", "")
                if visual:
                    body_lines.append(f"- 视觉：{visual}")
                tips = screen.get("tips", "")
                if tips:
                    body_lines.append(f"- 建议：{tips}")
                body_lines.append("")
            body_lines.append("")

        db = pdata.get("design_brief")
        if db:
            body_lines.append("### 主图设计简报\n")
            for key, label in [
                ("layout_style", "构图类型"), ("colors", "配色方案"),
                ("font_style", "字体建议"), ("image_direction", "画面方向"),
                ("text_placement", "文案排布"), ("notes", "平台提醒"),
            ]:
                val = db.get(key, "")
                if val:
                    body_lines.append(f"- **{label}**：{val}")
            body_lines.append("")

        addl = pdata.get("additional_images", [])
        if addl:
            body_lines.append("### 附图设计\n")
            for img in addl:
                body_lines.append(f"- **{img.get('position', '')}** — {img.get('purpose', '')}")
                for key, label in [
                    ("layout_style", "构图"), ("colors", "配色"),
                    ("image_direction", "画面方向"), ("text_overlay", "文案叠加"),
                    ("notes", "提醒"),
                ]:
                    val = img.get(key, "")
                    if val:
                        body_lines.append(f"  {label}：{val}")
                body_lines.append("")

    return body_lines
