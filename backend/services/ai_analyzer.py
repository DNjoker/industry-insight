"""AI-powered industry analysis. Model-agnostic via llm_client."""

import json
import time
import logging
from backend.models.schemas import SearchResult
from backend.services.llm_client import (
    chat,
    reset_cumulative_usage,
    get_cumulative_usage,
    estimate_cost,
)
from backend.models.prompts import (
    SYSTEM_PROMPT,
    SECTION_PROMPTS,
    PRODUCT_SECTION_PROMPTS,
    EXECUTIVE_SUMMARY_PROMPT,
    SOURCE_GRADING_PROMPT,
    REPORT_FINALIZE_PROMPT,
    ROLE_PERSPECTIVES,
    ROLE_CONSUMER_MODIFIERS,
    ROLE_SECTION_MODIFIERS,
    ROLE_SKIP_SECTIONS,
    ROLE_SECTION_REPLACEMENTS,
    ROLE_LOCATION_MODIFIERS,
    OVERSEAS_SYSTEM_MODIFIER,
    OVERSEAS_SECTION_REPLACEMENTS,
    OVERSEAS_SECTION_MODIFIERS,
)

logger = logging.getLogger(__name__)

# Per-section keyword matching for context relevance (Item 2)
SECTION_KEYWORDS: dict[str, list[str]] = {
    "value_chain": ["产业链", "价值链", "上下游", "供应链", "生产", "制造", "原材料", "成本"],
    "competition": ["竞争", "市场份额", "头部", "格局", "集中度", "排名", "规模", "占比"],
    "players": ["企业", "公司", "平台", "主要玩家", "龙头", "代表企业", "头部企业", "上市公司"],
    "consumers": ["消费者", "用户", "画像", "目标人群", "需求", "行为", "偏好", "购买"],
    "tactics": ["运营", "策略", "经营", "商业模式", "打法", "盈利", "模式", "布局"],
    "brands": ["品牌", "新锐", "产品线", "主推", "矩阵", "子品牌", "产品矩阵"],
    "channels": ["渠道", "推广", "营销", "抖音", "小红书", "直播", "投放", "短视频", "流量", "电商"],
    "trending_products": ["爆品", "热销", "趋势", "新品", "销量", "卖点", "爆款", "增长"],
    "competitor_ops": ["竞品", "拆解", "话术", "详情页", "关键词", "运营细节", "打法拆解"],
    "creative_pricing": ["视觉", "素材", "文案", "定价", "促销", "价格带", "卖点提炼", "优惠", "折扣"],
    "product_attribution": ["爆款", "归因", "走红", "爆火", "热门", "流行", "为什么火", "出圈"],
    "product_audience": ["人群", "用户画像", "消费者", "目标", "受众", "谁在买", "购买人群"],
    "product_competition": ["竞品", "替代", "对比", "同类", "竞争", "差异化", "对比分析"],
    "product_lifecycle": ["热度", "周期", "趋势", "增长", "衰退", "生命周期", "时间线"],
    "product_entry": ["切入", "电商", "开店", "供应链", "货源", "选品", "入驻", "开店流程"],
    "product_marketing": ["营销", "内容", "推广", "种草", "投放", "短视频", "引流", "转化"],
}


def _build_context(results: list[SearchResult], max_articles: int = 15, max_content: int = 2000) -> str:
    """Build a context string from a list of search results."""
    parts = []
    for r in results[:max_articles]:
        part = f"### {r.title}\n来源: {r.url}\n{r.snippet}"
        if r.content:
            part += f"\n{r.content[:max_content]}"
        parts.append(part)
    return "\n\n---\n\n".join(parts)


def match_articles_to_section(section_key: str, results: list[SearchResult], top_n: int = 6) -> list[SearchResult]:
    """Select top-N articles most relevant to a section based on keyword overlap."""
    keywords = SECTION_KEYWORDS.get(section_key, [])
    if not keywords:
        return results[:top_n]

    scored = []
    for r in results:
        text = f"{r.title} {r.snippet} {r.search_origin or ''}"
        score = sum(1 for kw in keywords if kw in text)
        # Direct query match (strip _en suffix for overseas results)
        origin_base = (r.search_origin or "").replace("_en", "")
        if origin_base == section_key:
            score += 3
        scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:top_n]]


async def _classify_topic(topic: str) -> str:
    """Quick LLM call to determine if the input is an industry or a product/hot item.

    Returns "product" or "industry".
    """
    prompt = (
        f'判断以下输入是"行业/品类"还是"具体产品/爆款"：\n\n'
        f'输入：{topic}\n\n'
        f'只回复一个词：industry 或 product'
    )
    try:
        result = await chat([{"role": "user", "content": prompt}], temperature=0)
        result = result.strip().lower()
        if "product" in result:
            return "product"
        return "industry"
    except Exception:
        return "industry"


# Simple in-memory cache for section regeneration (30 min TTL)
_search_cache: dict[str, tuple[float, list[SearchResult]]] = {}
_CACHE_TTL = 1800


def cache_search_results(industry: str, role: str, location: str, results: list[SearchResult], overseas: bool = False):
    """Store search results for later section regeneration."""
    key = f"{industry}::{role}::{location}::{overseas}"
    _search_cache[key] = (time.time(), results)


def get_cached_results(industry: str, role: str, location: str = "", overseas: bool = False) -> list[SearchResult] | None:
    """Get cached search results if still valid."""
    key = f"{industry}::{role}::{location}::{overseas}"
    entry = _search_cache.get(key)
    if entry is None:
        return None
    timestamp, results = entry
    if time.time() - timestamp > _CACHE_TTL:
        del _search_cache[key]
        return None
    return results


async def regenerate_section(industry: str, role: str, section_key: str, analysis_type: str = "industry", location: str = "", overseas: bool = False) -> tuple[str, str]:
    """Regenerate a single section. Returns (section_name, content)."""
    results = get_cached_results(industry, role, location, overseas=overseas)
    if not results:
        raise ValueError("搜索缓存已过期，请重新运行行业扫描")

    role_perspective = ROLE_PERSPECTIVES.get(role, ROLE_PERSPECTIVES["general"])
    role_consumer_modifier = ROLE_CONSUMER_MODIFIERS.get(role, "")
    location_modifier = ROLE_LOCATION_MODIFIERS.get(role, "").format(location=location) if location else ""
    overseas_modifier_str = OVERSEAS_SYSTEM_MODIFIER if overseas else ""
    combined_modifier = (location_modifier + "\n" + overseas_modifier_str).strip()
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    role_replacements = ROLE_SECTION_REPLACEMENTS.get(role, {})

    prompts = PRODUCT_SECTION_PROMPTS if analysis_type == "product" else SECTION_PROMPTS

    section_names = {
        "value_chain": "价值链分析", "competition": "竞争格局", "players": "主要玩家",
        "consumers": "消费者行为", "tactics": "经营打法", "brands": "品牌格局",
        "channels": "渠道玩法", "trending_products": "爆品与趋势",
        "competitor_ops": "竞品打法拆解", "creative_pricing": "素材与定价",
        "product_attribution": "爆款归因", "product_audience": "人群画像",
        "product_competition": "竞品格局", "product_lifecycle": "热度周期",
        "product_entry": "电商切入", "product_marketing": "内容营销",
    }

    if role == "government":
        if section_key == "competition":
            section_names["competition"] = "产业分布格局"
        elif section_key == "tactics":
            section_names["tactics"] = "招商策略"

    if overseas:
        if section_key == "value_chain":
            section_names["value_chain"] = "跨境价值链"
        elif section_key == "channels":
            section_names["channels"] = "跨境平台对比"

    name = section_names.get(section_key, section_key)

    overseas_replacements = OVERSEAS_SECTION_REPLACEMENTS if overseas else {}
    template = overseas_replacements.get(section_key, role_replacements.get(section_key, prompts.get(section_key)))
    if not template:
        raise ValueError(f"未知章节: {section_key}")

    matched = match_articles_to_section(section_key, results, top_n=6)
    section_context = _build_context(matched, max_articles=6)

    section_mod = role_section_mods.get(section_key, "")
    if overseas and section_key in OVERSEAS_SECTION_MODIFIERS:
        section_mod += "\n" + OVERSEAS_SECTION_MODIFIERS[section_key].format(industry=industry)

    fmt_kwargs = {
        "industry": industry,
        "context": section_context,
        "role_section_modifier": section_mod,
    }
    if section_key == "consumers":
        fmt_kwargs["role_consumer_modifier"] = role_consumer_modifier

    user_msg = template.format(**fmt_kwargs)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective, location_modifier=combined_modifier)},
        {"role": "user", "content": user_msg},
    ]

    content = await chat(messages, temperature=0.7)
    return name, content


async def analyze_industry(industry: str, search_results: list[SearchResult], role: str = "general", location: str = "", overseas: bool = False) -> str:
    """Analyze an industry or product and return a structured markdown report."""
    role_perspective = ROLE_PERSPECTIVES.get(role, ROLE_PERSPECTIVES["general"])
    role_consumer_modifier = ROLE_CONSUMER_MODIFIERS.get(role, "")
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    location_modifier = ROLE_LOCATION_MODIFIERS.get(role, "").format(location=location) if location else ""
    overseas_modifier = OVERSEAS_SYSTEM_MODIFIER if overseas else ""
    combined_modifier = (location_modifier + "\n" + overseas_modifier).strip()
    analysis_type = await _classify_topic(industry)

    # Build source list and full context
    source_list_parts = []
    for r in search_results:
        origin = r.search_origin or ""
        tag = " [英文补充]" if origin.startswith("supplement_en") else " [英文]" if origin.endswith("_en") else ""
        source_list_parts.append(f"- [{r.title}]({r.url}){tag}")
    source_list = "\n".join(source_list_parts)
    full_context = _build_context(search_results)

    if analysis_type == "product":
        prompts = PRODUCT_SECTION_PROMPTS
        section_order = ["product_attribution", "product_audience", "product_competition", "product_lifecycle", "product_entry", "product_marketing"]
        report_title = f"# {industry} 产品分析报告\n\n"
    else:
        prompts = SECTION_PROMPTS
        skip_sections = set(ROLE_SKIP_SECTIONS.get(role, []))
        section_order = [k for k in [
            "value_chain", "competition", "players", "consumers", "tactics", "brands", "channels", "trending_products", "competitor_ops", "creative_pricing"
        ] if k not in skip_sections]
        report_title = f"# {industry} 行业分析报告\n\n"

    # Generate all sections in parallel (content + executive summary + source grading)
    import asyncio
    reset_cumulative_usage()

    async def generate_section(key: str, prompt_template: str, fmt_kwargs: dict):
        # Content sections: compute matched context; meta sections use passed-in kwargs
        if key not in ("executive_summary", "source_audit"):
            matched = match_articles_to_section(key, search_results, top_n=6)
            fmt_kwargs["context"] = _build_context(matched, max_articles=6)
        user_msg = prompt_template.format(**fmt_kwargs)
        system_msg = SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective, location_modifier=combined_modifier)
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ]
        try:
            return key, await chat(messages, temperature=0.7)
        except Exception as e:
            logger.error(f"Failed to generate section {key}: {e}")
            return key, f"*此部分生成失败: {e}*"

    # Phase 1: Generate all content sections in parallel
    content_tasks = []
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    role_replacements = ROLE_SECTION_REPLACEMENTS.get(role, {})
    overseas_replacements = OVERSEAS_SECTION_REPLACEMENTS if overseas else {}
    for section_key, prompt_template in prompts.items():
        if section_key in skip_sections:
            continue
        if section_key in overseas_replacements:
            prompt_template = overseas_replacements[section_key]
        elif section_key in role_replacements:
            prompt_template = role_replacements[section_key]
        section_mod = role_section_mods.get(section_key, "")
        if overseas and section_key in OVERSEAS_SECTION_MODIFIERS:
            section_mod += "\n" + OVERSEAS_SECTION_MODIFIERS[section_key].format(industry=industry)
        fmt_kwargs = {
            "industry": industry,
            "role_section_modifier": section_mod,
        }
        if section_key == "consumers":
            fmt_kwargs["role_consumer_modifier"] = role_consumer_modifier
        content_tasks.append(generate_section(section_key, prompt_template, fmt_kwargs))

    content_results = await asyncio.gather(*content_tasks)
    sections = dict(content_results)

    # Phase 2: Assemble report body, then generate exec summary (based on full body) + source audit
    report_body_parts = [sections[k] for k in section_order if k in sections]
    report_body = "\n\n".join(report_body_parts)
    phase2_tasks = [
        generate_section("executive_summary", EXECUTIVE_SUMMARY_PROMPT, {"industry": industry, "report_body": report_body}),
        generate_section("source_audit", SOURCE_GRADING_PROMPT, {"sources": source_list}),
    ]
    phase2_results = await asyncio.gather(*phase2_tasks)
    sections.update(dict(phase2_results))
    usage = get_cumulative_usage()
    estimated_cost = estimate_cost(usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))

    # Assemble report in inverted pyramid order
    report = report_title
    report += f"> 生成时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}　|　Token: {usage.get('total_tokens', 0):,} (提示 {usage.get('prompt_tokens', 0):,} + 生成 {usage.get('completion_tokens', 0):,})　|　估算费用: {estimated_cost}\n\n"

    # 1. Executive summary first
    if "executive_summary" in sections:
        report += sections["executive_summary"] + "\n\n---\n\n"

    # 2. Content sections in order
    for section_key in section_order:
        if section_key in sections:
            report += sections[section_key] + "\n\n"

    # 3. Source grading last
    if "source_audit" in sections:
        report += "\n\n---\n\n" + sections["source_audit"] + "\n"

    return report


async def analyze_industry_streaming(industry: str, search_results: list[SearchResult], progress_callback, role: str = "general", location: str = "", overseas: bool = False):
    """Analyze with streaming progress updates via callback. Auto-detects industry vs product."""

    role_perspective = ROLE_PERSPECTIVES.get(role, ROLE_PERSPECTIVES["general"])
    role_consumer_modifier = ROLE_CONSUMER_MODIFIERS.get(role, "")
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    location_modifier = ROLE_LOCATION_MODIFIERS.get(role, "").format(location=location) if location else ""
    overseas_modifier = OVERSEAS_SYSTEM_MODIFIER if overseas else ""
    combined_modifier = (location_modifier + "\n" + overseas_modifier).strip()
    analysis_type = await _classify_topic(industry)
    await progress_callback("analyze", 5, f"识别为: {'产品/爆款' if analysis_type == 'product' else '行业/品类'}分析")

    source_list_parts = []
    for r in search_results:
        origin = r.search_origin or ""
        tag = " [英文补充]" if origin.startswith("supplement_en") else " [英文]" if origin.endswith("_en") else ""
        source_list_parts.append(f"- [{r.title}]({r.url}){tag}")
    source_list = "\n".join(source_list_parts)
    full_context = _build_context(search_results)

    if analysis_type == "product":
        prompts = PRODUCT_SECTION_PROMPTS
        section_order = ["product_attribution", "product_audience", "product_competition", "product_lifecycle", "product_entry", "product_marketing"]
        section_names = {
            "product_attribution": "爆款归因",
            "product_audience": "人群画像",
            "product_competition": "竞品格局",
            "product_lifecycle": "热度周期",
            "product_entry": "电商切入",
            "product_marketing": "内容营销",
            "executive_summary": "核心摘要",
            "source_audit": "来源分级",
        }
        report_title = f"# {industry} 产品分析报告\n\n"
    else:
        prompts = SECTION_PROMPTS
        skip_sections = set(ROLE_SKIP_SECTIONS.get(role, []))
        section_order = [k for k in [
            "value_chain", "competition", "players", "consumers", "tactics", "brands", "channels", "trending_products", "competitor_ops", "creative_pricing"
        ] if k not in skip_sections]
        section_names = {
            "value_chain": "价值链分析",
            "competition": "竞争格局",
            "players": "主要玩家",
            "consumers": "消费者行为",
            "tactics": "经营打法",
            "brands": "品牌格局",
            "channels": "渠道玩法",
            "trending_products": "爆品与趋势",
            "competitor_ops": "竞品打法拆解",
            "creative_pricing": "素材与定价",
            "executive_summary": "核心摘要",
            "source_audit": "来源分级",
        }
        if overseas:
            section_names["value_chain"] = "跨境价值链"
            section_names["channels"] = "跨境平台对比"
        report_title = f"# {industry} 行业分析报告\n\n"

    sections = {}

    # Phase 1: Generate all content sections in parallel
    import asyncio
    reset_cumulative_usage()

    content_keys = [k for k in section_order if k in prompts]
    total = len(content_keys)
    completed = [0]

    role_replacements = ROLE_SECTION_REPLACEMENTS.get(role, {})
    overseas_replacements_stream = OVERSEAS_SECTION_REPLACEMENTS if overseas else {}

    async def generate_section(key: str):
        name = section_names.get(key, key)
        # Build section-matched context for content sections
        matched = match_articles_to_section(key, search_results, top_n=6)
        section_context = _build_context(matched, max_articles=6)
        section_mod = role_section_mods.get(key, "")
        if overseas and key in OVERSEAS_SECTION_MODIFIERS:
            section_mod += "\n" + OVERSEAS_SECTION_MODIFIERS[key].format(industry=industry)
        fmt_kwargs = {
            "industry": industry,
            "context": section_context,
            "role_section_modifier": section_mod,
        }
        if key == "consumers":
            fmt_kwargs["role_consumer_modifier"] = role_consumer_modifier
        template = overseas_replacements_stream.get(key, role_replacements.get(key, prompts[key]))
        user_msg = template.format(**fmt_kwargs)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective, location_modifier=combined_modifier)},
            {"role": "user", "content": user_msg},
        ]

        try:
            content = await chat(messages, temperature=0.7)
        except Exception as e:
            logger.error(f"Failed to generate section {key}: {e}")
            content = f"*此部分生成失败: {e}*"
        completed[0] += 1
        progress_pct = 55 + int(completed[0] * 25 / total)
        await progress_callback("analyze", progress_pct, f"正在生成: {name}... ({completed[0]}/{total})")
        return key, content

    await progress_callback("analyze", 55, f"并行生成 {total} 个内容章节...")
    results = await asyncio.gather(*[generate_section(k) for k in content_keys])
    sections.update(dict(results))

    # Phase 2: Assemble report body, then generate exec summary + source audit in parallel
    await progress_callback("analyze", 82, "正在生成核心摘要与来源分级...")
    report_body_parts = [sections[k] for k in section_order if k in sections]
    report_body = "\n\n".join(report_body_parts)

    async def generate_meta(key: str):
        name = section_names.get(key, key)
        if key == "executive_summary":
            user_msg = EXECUTIVE_SUMMARY_PROMPT.format(industry=industry, report_body=report_body)
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective, location_modifier=combined_modifier)},
                {"role": "user", "content": user_msg},
            ]
        elif key == "source_audit":
            user_msg = SOURCE_GRADING_PROMPT.format(sources=source_list)
            messages = [
                {"role": "system", "content": "你是一个信息质量评估专家，擅长对信息来源进行权威性和时效性评级。"},
                {"role": "user", "content": user_msg},
            ]
        else:
            return key, f"*未知章节: {key}*"

        try:
            content = await chat(messages, temperature=0.7)
        except Exception as e:
            logger.error(f"Failed to generate section {key}: {e}")
            content = f"*此部分生成失败: {e}*"
        await progress_callback("analyze", 90, f"完成: {name}")
        return key, content

    phase2_results = await asyncio.gather(
        generate_meta("executive_summary"),
        generate_meta("source_audit"),
    )
    sections.update(dict(phase2_results))
    usage = get_cumulative_usage()
    estimated_cost = estimate_cost(usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
    await progress_callback("analyze", 97, f"报告生成完成", token_usage=usage, estimated_cost=estimated_cost)

    # Assemble report in inverted pyramid order
    report = report_title
    report += f"> 生成时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}　|　Token: {usage.get('total_tokens', 0):,} (提示 {usage.get('prompt_tokens', 0):,} + 生成 {usage.get('completion_tokens', 0):,})　|　估算费用: {estimated_cost}\n\n"

    # 1. Executive summary first
    if "executive_summary" in sections:
        report += sections["executive_summary"] + "\n\n---\n\n"

    # 2. Content sections in order
    for section_key in section_order:
        if section_key in sections:
            report += sections[section_key] + "\n\n"

    # 3. Source grading last
    if "source_audit" in sections:
        report += "\n\n---\n\n" + sections["source_audit"] + "\n"

    return report
