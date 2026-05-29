"""Strategy Dialog API — SSE streaming chat with knowledge + web search."""

import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException
from backend.config import settings
from backend.models.schemas import StrategyChatRequest, StrategySaveRequest, StrategySaveSourcesRequest
from backend.models.prompts import (
    STRATEGY_DIALOG_SYSTEM_PROMPT, STRATEGY_DIALOG_USER_PROMPT,
    STRATEGY_CONVERSATION_PROMPT, STRATEGY_CONVERSATION_USER_PROMPT,
    CASUAL_CHAT_PROMPT, CASUAL_CHAT_USER_PROMPT,
)
from backend.services.llm_client import chat_stream, chat
from backend.services.web_search import search as web_search
from backend.services.embedding_service import search as knowledge_search
from backend.services.obsidian_writer import save_chat_conversation, save_search_source
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/strategy", tags=["strategy"])


def _event(event_type: str, data: dict) -> dict:
    return {"event": event_type, "data": json.dumps(data, ensure_ascii=False)}


async def _extract_search_keywords(message: str, history: list[dict]) -> str:
    """Use LLM to extract focused search keywords from user message.

    Raw chat messages often contain noise words that dilute embedding
    search quality (e.g. "知识库里有海尔相关的内容吗" → "海尔 经销商 电商").
    """
    try:
        context = ""
        if history:
            recent = history[-6:]
            context = "\n".join(
                f"{m['role']}: {m['content'][:300]}" for m in recent
            )

        prompt = (
            "用户正在一个电商策略知识库中搜索信息。请分析用户消息的真实意图，提取用于语义搜索的关键词。\n"
            "规则：\n"
            "1. 将品牌/产品名扩展为相关业务术语（如\"海尔\"→\"海尔 家电 经销商 电商\"）\n"
            "2. 去除\"知识库\"\"有没有\"\"能不能\"等与搜索意图无关的词\n"
            "3. 只输出3-5个关键词，空格分隔，不要其他内容\n\n"
            f"最近对话：\n{context}\n\n"
            f"用户消息：{message}\n\n关键词："
        )

        keywords = await asyncio.wait_for(
            chat([{"role": "user", "content": prompt}], temperature=0.1),
            timeout=10,
        )
        keywords = keywords.strip()
        if keywords and len(keywords) >= 2:
            logger.info(f"Search keywords extracted: {keywords}")
            return keywords
    except Exception as e:
        logger.warning(f"Keyword extraction failed, using raw message: {e}")

    return message


def validate_config() -> str | None:
    if not settings.deepseek_api_key and not settings.anthropic_api_key and not settings.openai_api_key:
        return "AI 模型 API Key 未配置，请在设置页填入对应模型的 Key"
    return None


@router.post("/chat")
async def strategy_chat(request: StrategyChatRequest):
    """SSE streaming endpoint for strategy dialog."""

    async def event_generator():
        config_error = validate_config()
        if config_error:
            yield _event("error", {"message": config_error})
            return

        user_message = request.message.strip()
        if not user_message:
            yield _event("error", {"message": "请输入问题"})
            return

        # ── Step 1: Knowledge base search ─────────────────
        knowledge_text = "（未启用知识库搜索）"
        if request.enable_knowledge_search:
            yield _event("status", {"step": "knowledge", "message": "正在检索知识库..."})
            try:
                search_query = await _extract_search_keywords(
                    user_message, request.conversation_history
                )
                kb_results = await asyncio.wait_for(
                    asyncio.to_thread(knowledge_search, search_query, 5, request.collection_name),
                    timeout=60,
                )
                if kb_results and kb_results.get("documents") and kb_results["documents"]:
                    docs = kb_results["documents"][0]
                    metadatas = kb_results.get("metadatas", [[]])[0]
                    distances = kb_results.get("distances", [[]])[0]

                    # Check if any top result is relevant to the search topic
                    _generic_words = {"行业", "分析", "报告", "市场", "研究", "现状", "发展", "趋势", "品牌", "平台", "运营", "策略"}
                    query_terms = set(search_query.replace("  ", " ").split()) - _generic_words
                    has_relevant = False
                    for i, m in enumerate(metadatas[:3]):
                        if i >= len(metadatas):
                            break
                        title = (m.get("title", "") or "") + " " + (m.get("source", "") or "")
                        if any(term in title for term in query_terms if len(term) >= 2):
                            has_relevant = True
                            break

                    if not has_relevant:
                        yield _event("suggest_scan", {
                            "step": "suggest_scan",
                            "topic": search_query,
                            "message": f"知识库中暂无「{search_query}」相关报告，可以前往行业摸底生成一份分析报告",
                        })

                    parts = []
                    for i, doc in enumerate(docs):
                        source = metadatas[i].get("source", "未知来源") if i < len(metadatas) else "未知来源"
                        score = 1 - distances[i] if i < len(distances) else 0
                        parts.append(f"### 知识片段 {i + 1}（来源: {source}，相关度: {score:.0%}）\n{doc}")
                    knowledge_text = "\n\n".join(parts)
                else:
                    knowledge_text = "（知识库中未找到相关内容）"
                    yield _event("suggest_scan", {
                        "step": "suggest_scan",
                        "topic": search_query,
                        "message": f"知识库中暂无「{search_query}」相关报告，可以前往行业摸底生成一份分析报告",
                    })
            except asyncio.TimeoutError:
                logger.warning("Knowledge search timed out (60s)")
                knowledge_text = "（知识库检索超时，模型可能正在首次下载，请稍后重试）"
            except Exception as e:
                logger.error(f"Knowledge search failed: {e}")
                knowledge_text = f"（知识库检索失败: {e}）"

        # ── Step 2: Web search ────────────────────────────
        web_text = "（未启用联网搜索）"
        web_sources: list[dict] = []  # Stored for later save
        if request.enable_web_search:
            yield _event("status", {"step": "web", "message": "正在联网搜索..."})
            try:
                web_results = await web_search(user_message, max_results=5)
                if web_results:
                    parts = []
                    for i, r in enumerate(web_results):
                        parts.append(f"### 搜索结果 {i + 1}\n**标题**: {r.title}\n**链接**: {r.url}\n**摘要**: {r.snippet}")
                        web_sources.append({"title": r.title, "url": r.url, "snippet": r.snippet})
                    web_text = "\n\n".join(parts)
                else:
                    web_text = "（未搜索到相关内容）"
            except Exception as e:
                logger.error(f"Web search failed: {e}")
                web_text = f"（联网搜索失败: {e}）"

        has_knowledge = knowledge_text and "未找到相关内容" not in knowledge_text and "未启用" not in knowledge_text
        yield _event("context", {
            "knowledge": knowledge_text,
            "web": web_text,
            "web_sources": web_sources,
            "has_knowledge": has_knowledge,
        })

        # ── Step 3: Build prompt ──────────────────────────
        history_str = "（新对话，无历史记录）"
        if request.conversation_history:
            lines = []
            for msg in request.conversation_history[-20:]:
                role_label = "用户" if msg.get("role") == "user" else "AI"
                content = str(msg.get("content", ""))[:2000]
                lines.append(f"**{role_label}**: {content}")
            history_str = "\n\n".join(lines)

        # Pick prompt based on mode
        if request.mode == "casual":
            system_prompt = CASUAL_CHAT_PROMPT
            user_prompt = CASUAL_CHAT_USER_PROMPT.format(
                user_message=user_message,
                conversation_history=history_str,
            )
        elif request.mode == "chat":
            system_prompt = STRATEGY_CONVERSATION_PROMPT
            user_prompt = STRATEGY_CONVERSATION_USER_PROMPT.format(
                user_message=user_message,
                knowledge_context=knowledge_text,
                web_context=web_text,
                conversation_history=history_str,
            )
        else:
            system_prompt = STRATEGY_DIALOG_SYSTEM_PROMPT
            user_prompt = STRATEGY_DIALOG_USER_PROMPT.format(
                user_message=user_message,
                knowledge_context=knowledge_text,
                web_context=web_text,
                conversation_history=history_str,
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # ── Step 4: LLM streaming ─────────────────────────
        yield _event("status", {"step": "llm", "message": "AI 正在分析..."})
        try:
            async for chunk in chat_stream(messages, temperature=0.7):
                yield _event("chunk", {"content": chunk})
        except Exception as e:
            logger.error(f"LLM streaming failed: {e}")
            yield _event("error", {"message": f"AI 分析失败: {e}"})
            return

        yield _event("done", {})

    return EventSourceResponse(event_generator())


@router.post("/save")
async def save_strategy_conversation(request: StrategySaveRequest):
    """Save the current conversation to Obsidian DeepSeek对话/ folder."""
    config_error = validate_config()
    if config_error:
        raise HTTPException(status_code=400, detail=config_error)

    try:
        path = save_chat_conversation(
            title=request.title,
            messages=request.messages,
            tags=request.tags + ["策略对谈"],
            abstract=request.abstract,
        )
        return {"success": True, "path": path}
    except Exception as e:
        logger.error(f"Save conversation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-sources")
async def save_strategy_sources(request: StrategySaveSourcesRequest):
    """Save web search sources to Obsidian 行业摸底/搜索来源/ folder."""
    config_error = validate_config()
    if config_error:
        raise HTTPException(status_code=400, detail=config_error)

    paths = []
    try:
        for src in request.sources:
            path = save_search_source(
                title=src.get("title", "未命名来源"),
                url=src.get("url", ""),
                snippet=src.get("snippet", ""),
            )
            paths.append(path)
        return {"success": True, "paths": paths, "saved_count": len(paths)}
    except Exception as e:
        logger.error(f"Save sources failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
