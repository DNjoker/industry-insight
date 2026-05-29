"""Multi-engine web search with time range support."""

import logging
import re
from datetime import datetime, timedelta
from urllib.parse import quote
import httpx
from bs4 import BeautifulSoup
from backend.config import settings
from backend.models.schemas import SearchResult

logger = logging.getLogger(__name__)

SEARCH_QUERIES = {
    "value_chain": "{industry} 产业链 价值链 上下游",
    "competition": "{industry} 竞争格局 市场份额 头部企业",
    "players": "{industry} 主要玩家 平台 公司",
    "consumers": "{industry} 消费者行为 用户画像 目标人群",
    "tactics": "{industry} 运营策略 经营打法 商业模式",
    "brands": "{industry} 新锐品牌 头部品牌 品牌矩阵 产品线 主推品",
    "channels": "{industry} 推广渠道 营销玩法 抖音 小红书 短视频 直播 投放策略",
    "trending_products": "{industry} 爆品 热销产品 趋势品类 新品 卖点 销量数据",
    "competitor_ops": "{industry} 竞品拆解 短视频内容 直播话术 详情页 投放关键词 运营细节",
    "creative_pricing": "{industry} 视觉素材 文案方向 定价策略 促销机制 价格带 卖点提炼",
}

TIME_SUFFIX = {
    "week": " 2025 2026 最新",
    "month": " 2025 2026",
    "half_year": " 2024 2025 2026",
    "all": "",
}


def build_queries(industry: str, time_range: str = "month") -> dict[str, str]:
    suffix = TIME_SUFFIX.get(time_range, "")
    return {key: tmpl.format(industry=industry) + suffix for key, tmpl in SEARCH_QUERIES.items()}


# ============================================================
# Search engine backends
# ============================================================

class SearchEngine:
    """Base class for search engines."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        raise NotImplementedError


class TavilyEngine(SearchEngine):
    """Tavily Search API (needs VPN in China)."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        api_key = settings.tavily_api_key
        if not api_key:
            raise ValueError("Tavily API key not configured")

        body = {
            "api_key": api_key,
            "query": query,
            "max_results": max_results,
            "search_depth": "advanced",
            "include_answer": False,
        }
        if time_range == "week":
            body["days"] = 7
        elif time_range == "month":
            body["days"] = 30
        elif time_range == "half_year":
            body["days"] = 180

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post("https://api.tavily.com/search", json=body)
            response.raise_for_status()
            data = response.json()
            return [
                SearchResult(title=r.get("title", ""), url=r.get("url", ""), snippet=r.get("content", ""))
                for r in data.get("results", [])
            ]


class BingEngine(SearchEngine):
    """Bing Web Search API (works in China without VPN, needs Azure key)."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        api_key = settings.bing_api_key
        if not api_key:
            raise ValueError("Bing API key not configured")

        freshness_map = {
            "week": "Week",
            "month": "Month",
            "half_year": "Month",  # Bing doesn't have 6-month, use Month
        }

        params = {
            "q": query,
            "count": min(max_results, 10),
            "mkt": "zh-CN",
            "textFormat": "Raw",
        }
        if time_range in freshness_map:
            params["freshness"] = freshness_map[time_range]

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                "https://api.bing.microsoft.com/v7.0/search",
                params=params,
                headers={"Ocp-Apim-Subscription-Key": api_key},
            )
            response.raise_for_status()
            data = response.json()
            results = []
            for r in data.get("webPages", {}).get("value", []):
                results.append(SearchResult(
                    title=r.get("name", ""),
                    url=r.get("url", ""),
                    snippet=r.get("snippet", ""),
                ))
            return results


class DirectEngine(SearchEngine):
    """Direct scraping of Baidu/Bing search results (no API key needed)."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        results = []

        # Try Bing (accessible in China without VPN)
        results.extend(await self._search_bing(query, max_results))
        if len(results) >= 5:
            return results[:max_results]

        # Fallback: try Baidu
        results.extend(await self._search_baidu(query, max_results - len(results)))

        return results[:max_results]

    async def _search_bing(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            url = f"https://cn.bing.com/search?q={quote(query)}&count={max_results}"
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                })
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")
                results = []
                for item in soup.select("li.b_algo"):
                    title_el = item.select_one("h2 a")
                    snippet_el = item.select_one(".b_caption p, .b_lineclamp2")
                    if title_el:
                        results.append(SearchResult(
                            title=title_el.get_text(strip=True),
                            url=title_el.get("href", ""),
                            snippet=snippet_el.get_text(strip=True) if snippet_el else "",
                        ))
                return results
        except Exception as e:
            logger.warning(f"Bing direct search failed: {e}")
            return []

    async def _search_baidu(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            url = f"https://www.baidu.com/s?wd={quote(query)}&rn={max_results}"
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                })
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")
                results = []
                for item in soup.select(".result, .c-container"):
                    title_el = item.select_one("h3 a")
                    snippet_el = item.select_one(".c-abstract, .content-right_8Zs40")
                    if title_el:
                        url = title_el.get("href", "")
                        results.append(SearchResult(
                            title=title_el.get_text(strip=True),
                            url=url,
                            snippet=snippet_el.get_text(strip=True) if snippet_el else "",
                        ))
                return results
        except Exception as e:
            logger.warning(f"Baidu search failed: {e}")
            return []


# ============================================================
# Engine factory
# ============================================================

ENGINES = {
    "tavily": TavilyEngine,
    "bing": BingEngine,
    "direct": DirectEngine,
}


def _get_engine() -> SearchEngine:
    """Get configured search engine with fallback chain."""
    preferred = getattr(settings, "search_engine", "tavily") or "tavily"
    engine_class = ENGINES.get(preferred, TavilyEngine)
    return engine_class()


async def search(query: str, max_results: int = 10, time_range: str = "month") -> list[SearchResult]:
    """Search with primary engine, fallback to direct scraping on failure."""
    engine = _get_engine()
    try:
        results = await engine.search(query, max_results, time_range)
        if results:
            return results
    except Exception as e:
        logger.warning(f"Primary search engine failed: {e}")

    # Fallback to direct scraping
    if not isinstance(engine, DirectEngine):
        logger.info("Falling back to direct search...")
        try:
            fallback = DirectEngine()
            return await fallback.search(query, max_results, time_range)
        except Exception as e:
            logger.error(f"Fallback search also failed: {e}")

    return []


async def search_all(industry: str, time_range: str = "month") -> list[SearchResult]:
    """Run all search queries and return deduplicated results."""
    enhanced = industry
    if len(industry) <= 2:
        enhanced = industry + "行业"

    queries = build_queries(enhanced, time_range)
    results_map = {}
    seen_urls = set()
    results = []

    for key, query in queries.items():
        try:
            batch = await search(query, max_results=5, time_range=time_range)
        except Exception as e:
            logger.warning(f"Search '{key}' failed: {e}")
            batch = []
        results_map[key] = batch
        for r in batch:
            if r.url not in seen_urls:
                seen_urls.add(r.url)
                results.append(r)

    failed_count = sum(1 for v in results_map.values() if len(v) == 0)
    if failed_count >= 7:
        logger.warning(f"{failed_count}/10 queries returned 0 results for '{industry}'")

    return results
