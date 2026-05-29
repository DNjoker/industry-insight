"""Knowledge extraction API routes with SSE streaming."""

import json
import logging
import os
from fastapi import APIRouter
from backend.models.schemas import (
    ExtractParseRequest, ExtractParseResponse,
    ExtractStreamRequest, SaveCardsRequest, SaveCardsResponse,
)
from backend.services.knowledge_extractor import parse_input, extract_and_generate
from backend.services.obsidian_writer import save_knowledge_card
from backend.config import settings, get_vault_path
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["extract"])


def _event(step: str, progress: int, message: str, **extra) -> dict:
    return {"event": "progress", "data": json.dumps(
        {"step": step, "progress": progress, "message": message, **extra},
        ensure_ascii=False
    )}


def validate_config() -> str | None:
    if not settings.deepseek_api_key and not settings.anthropic_api_key and not settings.openai_api_key:
        return "AI 模型 API Key 未配置，请在设置页填入对应模型的 Key"
    return None


@router.post("/extract/parse")
async def parse_batch_input(request: ExtractParseRequest):
    """Parse batch input text and classify each line."""
    items = parse_input(request.text)
    return ExtractParseResponse(items=items)


@router.post("/extract/stream")
async def extract_knowledge_stream(request: ExtractStreamRequest):
    """SSE streaming endpoint for the full extraction pipeline."""

    async def event_generator():
        config_error = validate_config()
        if config_error:
            yield _event("error", 0, config_error)
            return

        items = request.items if request.items else parse_input(request.text)
        if not items:
            yield _event("error", 0, "未解析到有效输入")
            return

        yield _event("parse", 5, f"已识别 {len(items)} 条输入")

        queue = []

        async def progress_callback(step: str, progress: int, message: str, **extra):
            queue.append(_event(step, progress, message, **extra))

        try:
            cards = await extract_and_generate(items, progress_callback)
        except Exception as e:
            logger.error(f"Extraction failed: {e}")
            yield _event("error", 50, f"提取失败: {e}")
            return

        while queue:
            yield queue.pop(0)

        cards_data = [c.model_dump() for c in cards]
        yield _event("done", 100, f"已生成 {len(cards)} 张知识卡片", cards=cards_data)

    return EventSourceResponse(event_generator())


@router.post("/extract/save")
async def save_cards(request: SaveCardsRequest):
    """Save confirmed knowledge cards to Obsidian vault."""
    config_error = validate_config()
    if config_error:
        logger.warning(f"Save blocked: {config_error}")
        return SaveCardsResponse(saved_count=0, paths=[], error=config_error)

    saved_dir = None
    paths = []
    for card in request.cards:
        try:
            path = save_knowledge_card(card)
            paths.append(path)
            if not saved_dir:
                saved_dir = os.path.dirname(path)
        except Exception as e:
            logger.error(f"Failed to save card '{card.title}': {e}", exc_info=True)

    logger.info(f"Saved {len(paths)}/{len(request.cards)} cards to Obsidian")

    # Convert vault-relative dir to absolute path for the frontend
    if saved_dir:
        absolute_dir = os.path.normpath(os.path.join(get_vault_path(), saved_dir))
    else:
        absolute_dir = None

    return SaveCardsResponse(saved_count=len(paths), paths=paths, saved_dir=absolute_dir)
