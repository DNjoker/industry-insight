"""Source quality scoring — filters and ranks search results before LLM analysis."""

import re
import logging
from urllib.parse import urlparse
from backend.models.schemas import SearchResult

logger = logging.getLogger(__name__)

# Domain authority tiers: 1 = authoritative, 2 = standard, 3 = low
DOMAIN_AUTHORITY: dict[str, tuple[int, float]] = {
    # Tier 1: official sources, top-tier financial media, brokerages
    "stats.gov.cn": (1, 1.0),
    "gov.cn": (1, 0.95),
    "caixin.com": (1, 0.9),
    "cls.cn": (1, 0.85),
    "eastmoney.com": (1, 0.8),
    "sse.com.cn": (1, 1.0),
    "szse.cn": (1, 1.0),
    "ndrc.gov.cn": (1, 1.0),
    "miit.gov.cn": (1, 1.0),
    "mofcom.gov.cn": (1, 1.0),
    "people.com.cn": (1, 0.9),
    "xinhuanet.com": (1, 0.9),
    "economicdaily.com.cn": (1, 0.9),
    "ce.cn": (1, 0.85),
    "yicai.com": (1, 0.85),
    "21jingji.com": (1, 0.8),
    "fortune.com": (1, 0.85),
    "bloomberg.com": (1, 0.9),
    "reuters.com": (1, 0.9),
    # Brokerage research
    "citics.com": (1, 0.85),
    "gtja.com": (1, 0.85),
    "htsc.com": (1, 0.85),
    "cicc.com": (1, 0.9),
    "gf.com.cn": (1, 0.8),
    "cmschina.com": (1, 0.8),
    # Tier 2: industry media, mainstream portals
    "36kr.com": (2, 0.7),
    "iyiou.com": (2, 0.7),
    "163.com": (2, 0.6),
    "qq.com": (2, 0.6),
    "sina.com.cn": (2, 0.6),
    "sohu.com": (2, 0.6),
    "ifeng.com": (2, 0.6),
    "thepaper.cn": (2, 0.65),
    "jiemian.com": (2, 0.65),
    "tmtpost.com": (2, 0.65),
    "huxiu.com": (2, 0.65),
    "guancha.cn": (2, 0.65),
    "zhidx.com": (2, 0.65),
    "ebrun.com": (2, 0.65),
    "linkshop.com": (2, 0.65),
    "cifnews.com": (2, 0.65),
    "dsb.cn": (2, 0.65),
    # Tier 3: self-media, forums, personal blogs
    "zhihu.com": (3, 0.4),
    "jianshu.com": (3, 0.3),
    "douban.com": (3, 0.3),
    "csdn.net": (3, 0.4),
    "juejin.cn": (3, 0.4),
    "mp.weixin.qq.com": (3, 0.35),
    "weibo.com": (3, 0.3),
    "xiaohongshu.com": (3, 0.3),
    "douyin.com": (3, 0.3),
    "bilibili.com": (3, 0.35),
    "medium.com": (3, 0.4),
}


def _get_authority(url: str) -> tuple[int, float]:
    """Determine authority tier and score for a URL."""
    try:
        domain = urlparse(url).netloc.lower()
        # Remove www. prefix
        if domain.startswith("www."):
            domain = domain[4:]
    except Exception:
        return (2, 0.5)

    # Exact match first
    if domain in DOMAIN_AUTHORITY:
        return DOMAIN_AUTHORITY[domain]

    # Suffix match for subdomains (e.g., xxx.gov.cn)
    for key, (tier, score) in DOMAIN_AUTHORITY.items():
        if domain.endswith("." + key) or domain == key:
            return (tier, score)

    # Default: unknown domain
    return (2, 0.5)


def _extract_year_from_text(text: str) -> int | None:
    """Try to find a year mention in text."""
    if not text:
        return None
    # Look for 4-digit years between 2020-2026
    matches = re.findall(r"(20[2-9]\d)年?", text)
    if matches:
        years = [int(m[:4]) for m in matches]
        return max(years)  # Most recent year mentioned
    return None


def score_article(r: SearchResult, industry: str = "", industry_en: str = "") -> float:
    """Score a single article. Returns 0.0-1.0."""
    tier, authority = _get_authority(r.url)

    # Length score: content length
    content_len = len(r.content or "")
    snippet_len = len(r.snippet or "")
    total_len = max(content_len, snippet_len)
    if total_len < 200:
        length_score = 0.1
    elif total_len < 500:
        length_score = 0.4
    elif total_len < 1000:
        length_score = 0.7
    else:
        length_score = 1.0

    # Recency score: check for year mentions
    year = _extract_year_from_text(r.title + (r.snippet or ""))
    if year is None:
        recency_score = 0.5  # Unknown
    elif year >= 2026:
        recency_score = 1.0
    elif year >= 2025:
        recency_score = 0.9
    elif year >= 2024:
        recency_score = 0.7
    elif year >= 2023:
        recency_score = 0.5
    else:
        recency_score = 0.3

    # Relevance score: does the article mention the industry keyword?
    relevance_score = _check_relevance(r, industry, industry_en)

    score = authority * 0.25 + length_score * 0.25 + recency_score * 0.15 + relevance_score * 0.35
    r.quality_score = round(score, 3)
    r.authority_tier = tier
    return r.quality_score


def _check_relevance(r: SearchResult, industry: str, industry_en: str = "") -> float:
    """Check if article title+snippet is relevant to the industry. Returns 0.0-1.0."""
    if not industry:
        return 0.5
    text = (r.title or "") + " " + (r.snippet or "")
    core = industry.replace("行业", "").replace("产业", "").replace("市场", "").strip()
    if not core:
        return 0.5

    # If industry is Chinese but article has zero CJK, check against English translation
    has_cjk_core = any('一' <= ch <= '鿿' for ch in core)
    if has_cjk_core:
        has_cjk_text = any('一' <= ch <= '鿿' for ch in text)
        if not has_cjk_text:
            # English article for Chinese industry — check against English name
            if industry_en:
                en_words = [w for w in re.findall(r"[a-zA-Z]{3,}", industry_en.lower()) if w not in ('the', 'and', 'for')]
                if en_words:
                    text_lower = text.lower()
                    matches = sum(1 for w in en_words if w in text_lower)
                    if matches >= len(en_words) * 0.5:
                        return 0.8
                    elif matches >= 1:
                        return 0.5
            return 0.25

    # Direct match of core keyword
    if core.lower() in text.lower():
        return 1.0
    # For Chinese multi-char keywords, check each 2-char bigram
    if len(core) >= 2:
        for i in range(len(core) - 1):
            if core[i:i+2] in text:
                return 0.8
    # For English/alphabetic keywords, check word-level presence
    import re
    words = re.findall(r"[a-zA-Z]+", core)
    if words:
        matches = sum(1 for w in words if w.lower() in text.lower())
        if matches >= len(words) * 0.5:
            return 0.7
    return 0.1


def score_articles(results: list[SearchResult], industry: str = "", industry_en: str = "") -> list[SearchResult]:
    """Score all articles in place and sort by quality descending."""
    for r in results:
        score_article(r, industry, industry_en)
    results.sort(key=lambda r: r.quality_score or 0, reverse=True)
    return results


def trim_results(
    results: list[SearchResult],
    min_score: float = 0.3,
    max_articles: int = 10,
) -> list[SearchResult]:
    """Remove low-quality articles and trim content of borderline ones.

    - Drop articles below min_score
    - Keep top max_articles
    - For kept articles with score < 0.5, truncate content to 1000 chars
    """
    # Filter by minimum score
    filtered = [r for r in results if (r.quality_score or 0) >= min_score]

    if not filtered:
        logger.warning("All articles below quality threshold, keeping top 5")
        filtered = sorted(results, key=lambda r: r.quality_score or 0, reverse=True)[:5]

    # Keep top N
    kept = filtered[:max_articles]

    # Truncate content of low-score articles
    for r in kept:
        score = r.quality_score or 0
        if score < 0.5 and r.content and len(r.content) > 1000:
            r.content = r.content[:1000]
        elif score < 0.7 and r.content and len(r.content) > 1500:
            r.content = r.content[:1500]

    dropped = len(results) - len(kept)
    if dropped > 0:
        logger.info(
            "Source quality: dropped %d/%d articles (min_score=%.1f, max=%d)",
            dropped, len(results), min_score, max_articles,
        )

    return kept
