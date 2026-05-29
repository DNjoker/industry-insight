"""Chat conversation import API routes (for browser extension)."""

import json
import logging
import os
from fastapi import APIRouter
from backend.models.schemas import (
    ChatPreviewRequest, ChatPreviewResponse,
    ChatSaveRequest, ChatSaveResponse,
    ChatRefineRequest, ChatRefineResponse,
)
from backend.models.prompts import (
    CHAT_TITLE_SYSTEM_PROMPT, CHAT_TITLE_USER_PROMPT,
    CHAT_REFINE_SYSTEM_PROMPT, CHAT_REFINE_USER_PROMPT,
)
from backend.services.obsidian_writer import save_chat_conversation
from backend.services.llm_client import chat
from backend.config import settings, get_vault_path

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


def _validate_config() -> str | None:
    if not settings.deepseek_api_key and not settings.anthropic_api_key and not settings.openai_api_key:
        return "AI 模型 API Key 未配置"
    return None


@router.post("/chat/preview")
async def chat_preview(request: ChatPreviewRequest):
    """AI generates title, tags, and abstract suggestions for a chat conversation."""
    config_error = _validate_config()
    if config_error:
        return ChatPreviewResponse(
            suggested_title="未命名对话",
            suggested_tags=[],
            abstract=config_error,
        )

    # Build a condensed version for the AI (first + last messages, max 3000 chars)
    preview_content = []
    total_len = 0
    max_len = 3000
    for msg in request.messages:
        role = "用户" if msg.role == "user" else "DeepSeek"
        chunk = f"### {role}\n{msg.content[:500]}\n"
        if total_len + len(chunk) > max_len:
            preview_content.append(f"... (共 {len(request.messages)} 条消息，已截断)")
            break
        preview_content.append(chunk)
        total_len += len(chunk)

    content = "\n".join(preview_content)

    try:
        response = await chat([
            {"role": "system", "content": CHAT_TITLE_SYSTEM_PROMPT},
            {"role": "user", "content": CHAT_TITLE_USER_PROMPT.format(
                message_count=len(request.messages),
                content=content,
            )},
        ], temperature=0.3)

        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()
        data = json.loads(cleaned)
        return ChatPreviewResponse(
            suggested_title=data.get("suggested_title", "未命名对话"),
            suggested_tags=data.get("suggested_tags", []),
            abstract=data.get("abstract", ""),
        )
    except Exception as e:
        logger.error(f"Chat preview generation failed: {e}")
        return ChatPreviewResponse(
            suggested_title="未命名对话",
            suggested_tags=[],
            abstract="",
        )


@router.post("/chat/save")
async def chat_save(request: ChatSaveRequest):
    """Save a DeepSeek chat conversation to Obsidian vault."""
    config_error = _validate_config()
    if config_error:
        return ChatSaveResponse(success=False, error=config_error)

    try:
        messages_data = [{"role": m.role, "content": m.content} for m in request.messages]
        path = save_chat_conversation(
            title=request.title,
            messages=messages_data,
            tags=request.tags,
            abstract=request.abstract,
            refined_content=request.refined_content,
            overwrite_path=request.overwrite_path,
        )
        absolute_dir = os.path.normpath(
            os.path.join(get_vault_path(), os.path.dirname(path))
        )
        logger.info(f"Saved chat '{request.title}' to {path}")
        return ChatSaveResponse(success=True, path=path, absolute_dir=absolute_dir)
    except Exception as e:
        logger.error(f"Failed to save chat: {e}", exc_info=True)
        return ChatSaveResponse(success=False, error=str(e))


@router.post("/chat/refine")
async def chat_refine(request: ChatRefineRequest):
    """AI refines a chat conversation into structured knowledge notes."""
    config_error = _validate_config()
    if config_error:
        return ChatRefineResponse(refined_content="", error=config_error)

    # Build content from messages
    parts = []
    total_len = 0
    max_len = 12000
    for msg in request.messages:
        role = "用户" if msg.role == "user" else "DeepSeek"
        chunk = f"### {role}\n{msg.content}\n"
        if total_len + len(chunk) > max_len:
            parts.append("\n... (后续内容已截断)")
            break
        parts.append(chunk)
        total_len += len(chunk)

    content = "\n".join(parts)

    try:
        response = await chat([
            {"role": "system", "content": CHAT_REFINE_SYSTEM_PROMPT},
            {"role": "user", "content": CHAT_REFINE_USER_PROMPT.format(
                title=request.title or "未命名对话",
                content=content,
            )},
        ], temperature=0.3)

        return ChatRefineResponse(refined_content=response.strip())
    except Exception as e:
        logger.error(f"Chat refine failed: {e}")
        return ChatRefineResponse(refined_content="", error=str(e))


@router.get("/chat/files")
async def list_chat_files():
    """List all DeepSeek对话 files with refinement status, grouped by folder."""
    config_error = _validate_config()
    if config_error:
        return {"unrefined": [], "refined": [], "error": config_error}

    vault = get_vault_path()
    chat_dir = os.path.join(vault, "DeepSeek对话")

    def scan_dir(subdir: str, refined: bool) -> list[dict]:
        results = []
        scan_path = os.path.join(chat_dir, subdir)
        if not os.path.isdir(scan_path):
            return results
        for fname in os.listdir(scan_path):
            if not fname.endswith(".md"):
                continue
            full_path = os.path.join(scan_path, fname)
            rel_path = os.path.join("DeepSeek对话", subdir, fname) if subdir else os.path.join("DeepSeek对话", fname)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()

                title = fname.replace(".md", "")
                for line in content.split("\n"):
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break

                results.append({
                    "filename": fname,
                    "title": title,
                    "refined": refined,
                    "path": rel_path,
                })
            except Exception:
                results.append({
                    "filename": fname,
                    "title": fname.replace(".md", ""),
                    "refined": refined,
                    "path": rel_path,
                })
        return results

    unrefined = scan_dir("", False) + scan_dir("待提炼", False)
    refined_list = scan_dir("已提炼", True)

    return {"unrefined": unrefined, "refined": refined_list}
