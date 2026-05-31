"""Multi-engine web search with time range support."""

import asyncio
import logging
import random
import re
from datetime import datetime, timedelta
from urllib.parse import quote
import httpx
from bs4 import BeautifulSoup
from backend.config import settings
from backend.models.schemas import SearchResult

logger = logging.getLogger(__name__)

# Cache for industry name translations (survives the session)
_translation_cache: dict[str, str] = {}

# Exposed so routes can report search stats to the UI
last_search_stats: dict = {}


async def _translate_industry(industry: str) -> str:
    """Translate a Chinese industry name to English. Cached per session."""
    if industry in _translation_cache:
        return _translation_cache[industry]

    # Check if already English (no CJK)
    cjk = sum(1 for ch in industry if '一' <= ch <= '鿿')
    if cjk == 0:
        _translation_cache[industry] = industry
        return industry

    try:
        from backend.services.llm_client import chat
        response = await chat(
            messages=[
                {"role": "system", "content": "Translate Chinese industry names to concise English. Output ONLY the English translation, nothing else. Use standard industry terminology."},
                {"role": "user", "content": industry},
            ],
            temperature=0.1,
        )
        result = response.strip().strip('"').strip("'")
        # Take first line only
        result = result.split('\n')[0].strip()
        if result and len(result) <= 80:
            _translation_cache[industry] = result
            logger.info(f"Translated '{industry}' → '{result}'")
            return result
    except Exception as e:
        logger.warning(f"Industry translation failed: {e}")

    # Fallback: strip CJK and hope the rest is meaningful
    fallback = re.sub(r'[一-鿿]+', '', industry).strip()
    _translation_cache[industry] = fallback
    return fallback


def _is_english_query(query: str) -> bool:
    """Detect if a query is primarily English (majority ASCII, minimal CJK)."""
    cjk = sum(1 for ch in query if '一' <= ch <= '鿿' or '぀' <= ch <= 'ヿ' or '가' <= ch <= '힯')
    total = len(query) or 1
    # If CJK is less than 30% of the query, treat as English
    return cjk / total < 0.3


SEARCH_QUERIES = {
    "landscape": "{industry} 产业链 竞争格局 市场份额 头部企业 上下游 主要玩家",
    "consumers": "{industry} 消费者行为 用户画像 目标人群",
    "products": "{industry} 爆品 热销产品 新锐品牌 头部品牌 产品线 趋势品类 卖点",
    "channels": "{industry} 推广渠道 营销玩法 抖音 小红书 短视频 直播 投放策略 运营打法",
    "pricing": "{industry} 定价策略 促销机制 价格带 视觉素材 文案方向 卖点提炼",
    "ops": "{industry} 竞品拆解 运营细节 商业模式 经营策略",
}

# English queries for overseas/cross-border mode
SEARCH_QUERIES_EN = {
    "landscape": "{industry} value chain market share competitive landscape top companies global 2025 2026",
    "consumers": "{industry} consumer behavior user demographics target market trends 2025 2026",
    "products": "{industry} trending products hot selling bestseller new launch brands product lines 2025 2026",
    "channels": "{industry} distribution channels marketing TikTok Instagram Amazon ecommerce strategy",
    "pricing": "{industry} pricing strategy promotion visual marketing copywriting 2025 2026",
    "ops": "{industry} competitor analysis case study business model strategy breakdown",
}

TIME_SUFFIX = {
    "week": " 2025 2026 最新",
    "month": " 2025 2026",
    "half_year": " 2024 2025 2026",
    "all": "",
}


def build_queries(industry: str, time_range: str = "month", overseas: bool = False, industry_en: str = "") -> dict[str, str]:
    suffix = TIME_SUFFIX.get(time_range, "")
    queries = {key: tmpl.format(industry=industry) + suffix for key, tmpl in SEARCH_QUERIES.items()}
    if overseas:
        en_suffix = " 2025 2026"
        en_name = industry_en or industry
        for key, tmpl in SEARCH_QUERIES_EN.items():
            queries[f"{key}_en"] = tmpl.format(industry=en_name) + en_suffix
    return queries


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


class DirectEngine(SearchEngine):
    """Direct scraping of Baidu/Bing search results (no API key needed)."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        if _is_english_query(query):
            # English queries: use international Bing only
            return (await self._search_bing_intl(query, max_results))[:max_results]

        # Chinese queries: Bing CN first, then Baidu after a short delay (avoid rate-limit)
        bing_results = await self._search_bing_cn(query, max_results)
        await asyncio.sleep(0.5)
        baidu_results = await self._search_baidu(query, max_results)

        # Merge: Bing first (usually better), then Baidu for fill
        seen = set()
        merged = []
        for r in bing_results + baidu_results:
            if r.url not in seen:
                seen.add(r.url)
                merged.append(r)
        return merged[:max_results]

    # Rotating User-Agents to reduce blocking
    _USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    ]
    _ua_idx = 0

    def _next_ua(self) -> str:
        ua = self._USER_AGENTS[self._ua_idx % len(self._USER_AGENTS)]
        self._ua_idx += 1
        return ua

    def _browser_headers(self, lang: str = "zh-CN,zh;q=0.9") -> dict:
        return {
            "User-Agent": self._next_ua(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": lang,
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Cache-Control": "max-age=0",
        }

    def _parse_bing_results(self, soup: BeautifulSoup, query_hint: str = "") -> list[SearchResult]:
        """Parse Bing search results with multiple fallback selectors."""
        results = []
        # Try multiple container selectors
        items = soup.select("li.b_algo") or soup.select("#b_results > li.b_algo") or soup.select("ol#b_results > li")
        if not items:
            # Diagnostic: check if we're getting a captcha/block page
            page_text = soup.get_text()[:300]
            logger.warning(f"Bing parse: 0 result items for '{query_hint}'. Page preview: {page_text}")
        for item in items:
            title_el = item.select_one("h2 a") or item.select_one("a[href]")
            if not title_el:
                continue
            href = title_el.get("href", "")
            if not href or not href.startswith("http"):
                continue
            snippet_el = (
                item.select_one(".b_caption p") or
                item.select_one(".b_lineclamp2") or
                item.select_one(".b_caption") or
                item.select_one("p")
            )
            results.append(SearchResult(
                title=title_el.get_text(strip=True),
                url=href,
                snippet=snippet_el.get_text(strip=True) if snippet_el else "",
            ))
        return results

    def _parse_baidu_results(self, soup: BeautifulSoup, query_hint: str = "") -> list[SearchResult]:
        """Parse Baidu search results with multiple fallback selectors."""
        results = []
        items = (
            soup.select(".result.c-container") or
            soup.select("div.result") or
            soup.select(".c-container") or
            soup.select("div[class*='result']")
        )
        if not items:
            page_text = soup.get_text()[:300]
            logger.warning(f"Baidu parse: 0 result items for '{query_hint}'. Page preview: {page_text}")
        for item in items:
            title_el = item.select_one("h3 a") or item.select_one("a[href]")
            if not title_el:
                continue
            href = title_el.get("href", "")
            if not href:
                continue
            snippet_el = (
                item.select_one(".c-abstract") or
                item.select_one(".content-right_8Zs40") or
                item.select_one("span.content-right_2VFww") or
                item.select_one(".c-span-last") or
                item.select_one("p")
            )
            results.append(SearchResult(
                title=title_el.get_text(strip=True),
                url=href,
                snippet=snippet_el.get_text(strip=True) if snippet_el else "",
            ))
        return results

    async def _search_bing_cn(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            # cn.bing.com is dead (301→www.bing.com), use www.bing.com with zh-CN market
            url = f"https://www.bing.com/search?q={quote(query)}&count={max_results}&mkt=zh-CN"
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                response = await client.get(url, headers=self._browser_headers("zh-CN,zh;q=0.9"))
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")
                results = self._parse_bing_results(soup)
                logger.debug(f"Bing CN: {len(results)} results for '{query[:40]}'")
                return results
        except Exception as e:
            logger.warning(f"Bing CN direct search failed: {e}")
            return []

    async def _search_bing_intl(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            url = f"https://www.bing.com/search?q={quote(query)}&count={max_results}"
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                response = await client.get(url, headers=self._browser_headers("en-US,en;q=0.9"))
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")
                results = self._parse_bing_results(soup)
                logger.debug(f"Bing INTL: {len(results)} results for '{query[:40]}'")
                return results
        except Exception as e:
            logger.warning(f"Bing international direct search failed: {e}")
            return []

    async def _search_baidu(self, query: str, max_results: int) -> list[SearchResult]:
        try:
            url = f"https://www.baidu.com/s?wd={quote(query)}&rn={max_results}"
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                response = await client.get(url, headers=self._browser_headers("zh-CN,zh;q=0.9"))
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "lxml")
                results = self._parse_baidu_results(soup)
                logger.debug(f"Baidu: {len(results)} results for '{query[:40]}'")
                return results
        except Exception as e:
            logger.warning(f"Baidu search failed: {e}")
            return []


class BaiduEngine(SearchEngine):
    """Baidu AI Search API (千帆 AppBuilder) — best Chinese search quality, 1500 free/month."""

    async def search(self, query: str, max_results: int, time_range: str) -> list[SearchResult]:
        api_key = settings.baidu_api_key
        if not api_key:
            raise ValueError("Baidu API key not configured")

        recency_map = {"week": "week", "month": "month", "half_year": "year", "all": ""}
        recency = recency_map.get(time_range, "month")

        body: dict = {
            "messages": [{"role": "user", "content": query}],
            "search_source": "baidu_search_v2",
            "resource_type_filter": [{"type": "web", "top_k": max_results}],
            "stream": False,
            "enable_deep_search": False,
            "enable_followup_query": False,
        }
        if recency:
            body["search_recency_filter"] = recency

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://qianfan.baidubce.com/v2/ai_search/web_search",
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "X-Appbuilder-Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for ref in data.get("references", []):
                r = SearchResult(
                    title=ref.get("title", ""),
                    url=ref.get("url", ""),
                    snippet=ref.get("content", ""),
                )
                if "rerank_score" in ref:
                    r.quality_score = ref["rerank_score"]
                if "authority_score" in ref:
                    r.authority_tier = 1 if ref["authority_score"] >= 0.7 else (2 if ref["authority_score"] >= 0.4 else 3)
                results.append(r)

            logger.debug(f"Baidu: {len(results)} results for '{query[:40]}'")
            return results


# ============================================================
# Engine factory
# ============================================================

ENGINES = {
    "tavily": TavilyEngine,
    "baidu": BaiduEngine,
    "direct": DirectEngine,
}

_primary_failed: bool = False  # Remember Tavily failure within session


def _get_engine() -> SearchEngine:
    """Get configured search engine, skip Tavily if known to be down."""
    global _primary_failed
    preferred = getattr(settings, "search_engine", "tavily") or "tavily"
    if _primary_failed and preferred == "tavily":
        return DirectEngine()
    engine_class = ENGINES.get(preferred, TavilyEngine)
    return engine_class()


async def search(query: str, max_results: int = 10, time_range: str = "month") -> list[SearchResult]:
    """Search with primary engine, fallback to direct scraping on failure."""
    global _primary_failed
    engine = _get_engine()
    try:
        results = await engine.search(query, max_results, time_range)
        if results:
            return results
    except Exception as e:
        logger.warning(f"Primary search engine failed: {e}")

    # Fallback to direct scraping — only for Tavily (Baidu API failures are rare, DirectEngine is broken anyway)
    if isinstance(engine, TavilyEngine):
        _primary_failed = True
        logger.info("Falling back to direct search...")
        try:
            fallback = DirectEngine()
            return await fallback.search(query, max_results, time_range)
        except Exception as e:
            logger.error(f"Fallback search also failed: {e}")

    return []


async def search_all(industry: str, time_range: str = "month", overseas: bool = False) -> list[SearchResult]:
    """Run all search queries and return deduplicated results."""
    enhanced = industry
    if len(industry) <= 2:
        enhanced = industry + "行业"

    # Translate industry name to English for English queries
    industry_en = await _translate_industry(enhanced)

    queries = build_queries(enhanced, time_range, overseas=overseas, industry_en=industry_en)

    # Silent English supplement for normal mode — fills Chinese data gaps with global perspective
    # Skip for Baidu engine: native Chinese search quality is excellent, no supplement needed
    engine_name = getattr(settings, "search_engine", "tavily") or "tavily"
    if not overseas and engine_name != "baidu":
        en_name = industry_en or industry
        en_supplement = {
            "supplement_en_market": f"{en_name} market size trends global industry report 2025 2026",
            "supplement_en_stats": f"{en_name} statistics data market share growth rate global",
            "supplement_en_innovation": f"{en_name} innovation trends technology new products global 2025 2026",
        }
    else:
        en_supplement = {}

    all_queries = {**queries, **en_supplement}

    semaphore = asyncio.Semaphore(3 if engine_name == "baidu" else 1)  # Baidu API handles concurrency
    per_query = 12 if engine_name == "baidu" else 8  # Baidu is cheap, grab more

    async def run_one(key: str, query: str):
        try:
            async with semaphore:
                # Delay + random jitter to avoid rate limiting
                delay = 0.3 + random.random() * 0.3 if engine_name == "baidu" else 2.0 + random.random() * 1.5
                await asyncio.sleep(delay)
                batch = await search(query, max_results=per_query, time_range=time_range)
        except Exception as e:
            logger.warning(f"Search '{key}' failed: {e}")
            batch = []
        return key, batch

    tasks = [run_one(key, q) for key, q in all_queries.items()]
    batches = await asyncio.gather(*tasks)

    results_map = {}
    seen_urls = set()
    results = []
    total_raw = 0
    for key, batch in batches:
        results_map[key] = batch
        total_raw += len(batch)
        for r in batch:
            if r.url not in seen_urls:
                seen_urls.add(r.url)
                r.search_origin = key
                results.append(r)

    # Summary log
    cn_count = sum(len(batch) for k, batch in batches if not k.endswith("_en") and not k.startswith("supplement_en"))
    en_count = total_raw - cn_count
    empty_queries = [k for k, batch in batches if len(batch) == 0]
    logger.info(f"Search: {total_raw} raw results ({cn_count} CN + {en_count} EN), {len(results)} unique after dedup")
    if empty_queries:
        logger.warning(f"Empty queries: {', '.join(empty_queries)}")

    # Expose stats for route to show in UI
    global last_search_stats
    last_search_stats = {
        "queries": len(all_queries),
        "raw": total_raw,
        "cn": cn_count,
        "en": en_count,
        "unique": len(results),
        "empty": empty_queries,
    }

    failed_count = sum(1 for v in results_map.values() if len(v) == 0)
    if failed_count >= 7:
        logger.warning(f"{failed_count}/{len(all_queries)} queries returned 0 results for '{industry}'")

    return results
