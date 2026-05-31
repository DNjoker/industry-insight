import json
import asyncio
import logging
from fastapi import APIRouter
from backend.models.schemas import ScanRequest
from backend.services.web_search import search_all, search
from backend.services.content_extractor import extract_all
from backend.services.ai_analyzer import analyze_industry_streaming
from backend.services.obsidian_writer import save_source_article, save_report, update_index
from backend.services.embedding_service import index_articles
from backend.config import settings
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["scan"])


def _event(step: str, progress: int, message: str, **extra) -> dict:
    return {"event": "progress", "data": json.dumps(
        {"step": step, "progress": progress, "message": message, **extra},
        ensure_ascii=False
    )}


def validate_config() -> str | None:
    """Check required config. Returns error message or None if OK."""
    engine = getattr(settings, "search_engine", "tavily") or "tavily"
    if engine == "tavily" and not settings.tavily_api_key:
        return "Tavily API Key 未配置，请在设置页填入 Tavily API Key"
    if engine == "bing" and not settings.bing_api_key:
        return "Bing API Key 未配置，请在设置页填入 Bing API Key"
    if not settings.deepseek_api_key and not settings.anthropic_api_key and not settings.openai_api_key:
        return "AI 模型 API Key 未配置，请在设置页填入对应模型的 Key"
    return None


@router.post("/scan/stream")
async def scan_industry_stream(request: ScanRequest):
    async def event_generator():
        queue = []

        async def progress_callback(step: str, progress: int, message: str, **extra):
            queue.append(_event(step, progress, message, **extra))

        industry = request.industry

        # === Pre-scan validation ===
        config_error = validate_config()
        if config_error:
            yield _event("error", 0, config_error)
            return

        # === Step 1: Search ===
        yield _event("search", 5, f"开始搜索「{industry}」相关信息...")
        await asyncio.sleep(0.1)

        try:
            search_results = await search_all(industry, time_range=request.time_range)
        except Exception as e:
            logger.error(f"Search failed: {e}")
            yield _event("error", 5, f"搜索失败: {e}")
            return

        if not search_results:
            # Try a broader single search
            yield _event("search", 15, f"精细搜索无结果，尝试广泛搜索...")
            try:
                search_results = await search(f"{industry} 行业 市场 趋势 分析", max_results=10)
            except Exception as e:
                logger.error(f"Broad search also failed: {e}")
                yield _event("error", 15, f"搜索失败: {e}")
                return

        if not search_results:
            msg = (
                f"未找到 [{industry}] 的相关文章.\n\n"
                "建议尝试:\n"
                "1. 使用更具体或更宽泛的行业名称 (如'宠物零食'而非'宠物食品')\n"
                "2. 更换时间范围 (选择'不限'可获得更多结果)\n"
                "3. 切换搜索引擎 (Tavily 覆盖海外内容, Bing 覆盖国内内容)"
            )
            yield _event("error", 20, msg)
            return

        yield _event("search", 30, f"已找到 {len(search_results)} 篇相关文章")

        # === Step 2: Extract content ===
        yield _event("extract", 35, "正在提取文章全文...")

        urls = [r.url for r in search_results]
        content_map = await extract_all(urls)

        for r in search_results:
            r.content = content_map.get(r.url)

        extracted_count = len(content_map)
        yield _event("extract", 55, f"已提取 {extracted_count} 篇全文")

        # === Step 3: AI Analysis ===
        yield _event("analyze", 60, "开始 AI 分析...")

        report_content = ""
        try:
            report_content = await analyze_industry_streaming(
                industry, search_results, progress_callback, role=request.role
            )
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            yield _event("error", 60, f"AI 分析失败: {e}")
            return

        # Drain queued progress
        while queue:
            yield queue.pop(0)

        yield _event("analyze", 90, "报告生成完成")

        # === Step 4: Save to Obsidian ===
        yield _event("save", 92, "正在保存到 Obsidian...")

        source_paths = []
        articles_for_index = []
        try:
            for r in search_results:
                if r.content:
                    source_path = save_source_article(
                        industry=industry,
                        title=r.title,
                        url=r.url,
                        content=r.content,
                    )
                    source_paths.append(source_path)
                    articles_for_index.append({
                        "id": r.url,
                        "text": f"{r.title}\n{r.snippet}",
                        "path": source_path,
                    })

            report_path = save_report(industry, report_content, source_paths)
            update_index(industry, report_path)
        except Exception as e:
            logger.error(f"Save failed: {e}")
            yield _event("error", 90, f"保存 Obsidian 失败: {e}")
            return

        # === Step 5: Index ===
        try:
            if articles_for_index:
                index_articles(
                    ids=[a["id"] for a in articles_for_index],
                    texts=[a["text"] for a in articles_for_index],
                    metadatas=[{"source": a["path"], "industry": industry} for a in articles_for_index],
                )
            # Also index the report itself so strategy dialog can find it
            if report_content and report_path:
                index_articles(
                    ids=[f"report:{industry}"],
                    texts=[f"# {industry} 行业分析报告\n\n{report_content[:8000]}"],
                    metadatas=[{"source": report_path, "industry": industry, "title": f"{industry} 行业分析报告"}],
                )
        except Exception as e:
            logger.warning(f"Indexing failed (non-critical): {e}")

        yield _event("done", 100, "报告已保存到 Obsidian",
            report_path=report_path, source_count=len(source_paths))

    return EventSourceResponse(event_generator())
