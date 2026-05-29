"""Knowledge extraction service: parse input, classify, fetch content, generate cards."""

import re
import json
import logging
import asyncio
from backend.models.schemas import ParsedItem, KnowledgeCard
from backend.services.content_extractor import extract
from backend.services.llm_client import chat
from backend.models.prompts import (
    KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
    KNOWLEDGE_EXTRACTION_USER_PROMPT,
)

logger = logging.getLogger(__name__)

URL_PATTERN = re.compile(r"https?://[^\s]+")
MAX_CONTENT_CHARS = 8000
BATCH_SIZE = 3


def parse_input(text: str) -> list[ParsedItem]:
    """Split batch input by newlines, classify each line. Supports 'URL | note' syntax.

    If the input contains NO URLs at all, treat the entire text as a single item
    (it's a long-form article or AI note, not a batch of links).
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if not lines:
        return []

    # Check if any line contains a URL
    has_any_url = any(URL_PATTERN.search(line) for line in lines)

    if not has_any_url:
        # Pure text — treat entire input as ONE item
        return [ParsedItem(
            index=0,
            raw=text.strip(),
            item_type="text",
        )]

    items = []
    for i, line in enumerate(lines):
        # Check for pipe-delimited user note
        user_note = None
        raw = line
        if "|" in line:
            parts = line.split("|", 1)
            raw = parts[0].strip()
            user_note = parts[1].strip() if len(parts) > 1 else None

        url_match = URL_PATTERN.search(raw)
        if url_match:
            items.append(ParsedItem(
                index=i,
                raw=raw,
                item_type="web_url",
                note=user_note,
            ))
        else:
            items.append(ParsedItem(
                index=i,
                raw=raw if not user_note else raw + " | " + user_note,
                item_type="text",
                note=user_note,
            ))
    return items


async def extract_content_for_item(item: ParsedItem) -> tuple[int, str | None, str | None]:
    """Fetch content for a single ParsedItem. Returns (index, content_text, source_title)."""
    if item.item_type == "text":
        return item.index, item.raw, None

    # web_url
    url_match = URL_PATTERN.search(item.raw)
    if not url_match:
        return item.index, item.raw, None

    url = url_match.group(0)
    content = await extract(url, max_chars=MAX_CONTENT_CHARS)
    if content and item.note:
        content = "用户备注: " + item.note + "\n\n---\n\n" + content
    return item.index, content, None


async def generate_cards_for_batch(
    items: list[ParsedItem],
    contents: dict[int, str],
    titles: dict[int, str | None],
    batch_indices: list[int],
) -> list[KnowledgeCard]:
    """Send one batch to AI and parse the resulting cards.

    Two paths:
    - Pure text items (no URLs): force long_form, only ask AI for metadata.
      Original text is used as body directly — AI never gets a chance to split.
    - Mixed / URL items: full AI extraction with content_type decision.
    """
    sections = []
    has_urls = False
    for idx in batch_indices:
        if idx not in contents or not contents[idx]:
            continue
        item = next((it for it in items if it.index == idx), None)
        if not item:
            continue
        url_match = URL_PATTERN.search(item.raw)
        url = url_match.group(0) if url_match else ""
        if url:
            has_urls = True
        title = titles.get(idx) or item.raw[:80]
        sections.append(
            "--- 来源 #" + str(idx + 1) + " ---\n"
            "标题: " + title + "\n"
            "链接: " + url + "\n\n" + contents[idx]
        )

    if not sections:
        return []

    combined = "\n\n".join(sections)
    logger.info(f"[generate_cards] sending {len(combined)} chars to LLM, has_urls={has_urls}")

    # === PATH A: Pure text, no URLs → metadata only, force long_form ===
    if not has_urls:
        return await _generate_metadata_only(items, contents, titles, batch_indices, combined)

    # === PATH B: Has URLs → full AI extraction ===
    return await _generate_full_extraction(items, contents, titles, batch_indices, combined)


async def _generate_metadata_only(
    items: list[ParsedItem],
    contents: dict[int, str],
    titles: dict[int, str | None],
    batch_indices: list[int],
    combined: str,
) -> list[KnowledgeCard]:
    """For pure text input: AI only generates metadata, body = original text."""
    prompt = f"""你是一个知识整理专家。请为以下文本生成元数据，不要改写正文。

对每段文本，输出：
- title: 精炼标题（≤25字）
- source_type: "实操卡片" 或 "阅读笔记"
- tags: 2-6个领域标签（推广类型、适用类目、平台、技巧类型、适用阶段等，不要泛标签如"电商"）
- abstract: 1-2句话摘要（≤80字）

输出严格的 JSON 数组（不是对象），每个元素对应一段文本：
[
  {{
    "title": "...",
    "source_type": "阅读笔记",
    "tags": ["人群推广", "精准投放", "溢价策略", "淘宝", "万相台"],
    "abstract": "系统讲解电商广告投放中的人群分类方法与溢价实操技巧，适合淘宝推广新手到进阶"
  }}
]

只输出 JSON 数组，不要其他文字。

{combined}"""

    try:
        response = await chat([
            {"role": "system", "content": "你是知识整理专家，输出严格的 JSON 数组。"},
            {"role": "user", "content": prompt},
        ], temperature=0.3)
    except Exception as e:
        logger.error(f"Metadata generation failed: {e}")
        return []

    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            logger.warning(f"Metadata AI returned non-array: {type(parsed)}")
            return []
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse metadata JSON: {e}")
        return []

    logger.info(f"[metadata-only] AI returned {len(parsed)} metadata entries")

    cards = []
    for i, meta in enumerate(parsed):
        if not isinstance(meta, dict):
            continue
        idx = batch_indices[i] if i < len(batch_indices) else batch_indices[0]
        source_item = items[idx] if idx < len(items) else None

        cards.append(KnowledgeCard(
            index=idx,
            source_type=meta.get("source_type", "阅读笔记"),
            content_type="long_form",
            title=meta.get("title", "未命名卡片"),
            tags=meta.get("tags", []),
            abstract=meta.get("abstract", ""),
            body=contents.get(idx, ""),  # original text as body
            source_url=None,
            source_title=titles.get(idx),
            user_note=source_item.note if source_item else None,
            raw_content=contents.get(idx),
        ))

    return cards


async def _generate_full_extraction(
    items: list[ParsedItem],
    contents: dict[int, str],
    titles: dict[int, str | None],
    batch_indices: list[int],
    combined: str,
) -> list[KnowledgeCard]:
    """For URL content: full AI extraction with content_type decision."""
    messages = [
        {"role": "system", "content": KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": KNOWLEDGE_EXTRACTION_USER_PROMPT.format(
            source_title="批量内容",
            source_url="(多来源)",
            content=combined,
        )},
    ]

    try:
        response = await chat(messages, temperature=0.5)
    except Exception as e:
        logger.error(f"AI card generation failed: {e}")
        return []

    # Parse JSON, stripping markdown code fences
    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            raw_cards = parsed
            content_type = "mixed"
        elif isinstance(parsed, dict):
            raw_cards = parsed.get("cards", [])
            content_type = parsed.get("content_type", "mixed")
        else:
            return []
        if not isinstance(raw_cards, list):
            return []
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse AI card JSON: {e}")
        return []

    logger.info(f"[generate_cards] content_type={content_type}, cards={len(raw_cards)}")

    cards = []
    for rc in raw_cards:
        if not isinstance(rc, dict):
            continue
        source_idx = batch_indices[0] if batch_indices else 0
        source_item = items[source_idx] if source_idx < len(items) else None
        source_url = None
        if source_item:
            url_match = URL_PATTERN.search(source_item.raw)
            if url_match:
                source_url = url_match.group(0)

        body = rc.get("body", "") or rc.get("summary", "")
        abstract = rc.get("abstract", "")

        cards.append(KnowledgeCard(
            index=source_idx,
            source_type=rc.get("source_type", "阅读笔记"),
            content_type=content_type,
            title=rc.get("title", "未命名卡片"),
            tags=rc.get("tags", []),
            abstract=abstract,
            body=body,
            source_url=source_url,
            source_title=titles.get(source_idx),
            user_note=source_item.note if source_item else None,
            raw_content=contents.get(source_idx),
        ))

    return cards


async def extract_and_generate(
    items: list[ParsedItem],
    progress_callback=None,
) -> list[KnowledgeCard]:
    """Full pipeline: extract content for all items, then generate cards in batches."""

    if progress_callback:
        await progress_callback("parse", 10, "已解析 " + str(len(items)) + " 条输入")

    tasks = [extract_content_for_item(item) for item in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    contents = {}
    titles = {}
    failed = 0
    for r in results:
        if isinstance(r, Exception):
            failed += 1
            logger.warning(f"Extract failed: {r}")
            continue
        idx, content, title = r
        if content:
            contents[idx] = content
        if title:
            titles[idx] = title
        else:
            titles[idx] = None

    extracted_count = len(contents)
    msg = "已提取 " + str(extracted_count) + " 条内容"
    if failed > 0:
        msg += "，" + str(failed) + " 条失败"
    if progress_callback:
        await progress_callback("extract", 30, msg)

    indices_with_content = sorted(contents.keys())
    batches = [
        indices_with_content[i:i + BATCH_SIZE]
        for i in range(0, len(indices_with_content), BATCH_SIZE)
    ]

    all_cards = []
    for batch_num, batch_indices in enumerate(batches):
        pct = 30 + int((batch_num / max(len(batches), 1)) * 60)
        if progress_callback:
            await progress_callback(
                "analyze", pct,
                "正在生成卡片... (" + str(batch_num + 1) + "/" + str(len(batches)) + ")"
            )

        cards = await generate_cards_for_batch(items, contents, titles, batch_indices)
        all_cards.extend(cards)

    if progress_callback:
        await progress_callback("analyze", 90, "已生成 " + str(len(all_cards)) + " 张知识卡片")

    return all_cards
