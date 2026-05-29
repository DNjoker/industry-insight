"""AI-powered industry analysis. Model-agnostic via llm_client."""

import json
import logging
from backend.models.schemas import SearchResult
from backend.services.llm_client import chat
from backend.models.prompts import (
    SYSTEM_PROMPT,
    SECTION_PROMPTS,
    PRODUCT_SECTION_PROMPTS,
    REPORT_MERGE_PROMPT,
)

logger = logging.getLogger(__name__)


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


async def analyze_industry(industry: str, search_results: list[SearchResult]) -> str:
    """Analyze an industry or product and return a structured markdown report."""
    analysis_type = await _classify_topic(industry)

    # Build context from search results
    context_parts = []
    for r in search_results[:15]:
        part = f"### {r.title}\n来源: {r.url}\n{r.snippet}"
        if r.content:
            part += f"\n{r.content[:2000]}"
        context_parts.append(part)
    context = "\n\n---\n\n".join(context_parts)

    if analysis_type == "product":
        prompts = PRODUCT_SECTION_PROMPTS
        section_order = ["product_attribution", "product_audience", "product_competition", "product_lifecycle", "product_entry", "product_marketing"]
        report_title = f"# {industry} 产品分析报告\n\n"
    else:
        prompts = SECTION_PROMPTS
        section_order = ["value_chain", "competition", "players", "consumers", "tactics", "brands", "channels", "trending_products", "competitor_ops", "creative_pricing"]
        report_title = f"# {industry} 行业分析报告\n\n"

    # Generate each section
    sections = {}
    for section_key, prompt_template in prompts.items():
        user_msg = prompt_template.format(industry=industry, context=context)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry)},
            {"role": "user", "content": user_msg},
        ]
        try:
            content = await chat(messages, temperature=0.7)
            sections[section_key] = content
        except Exception as e:
            logger.error(f"Failed to generate section {section_key}: {e}")
            sections[section_key] = f"*此部分生成失败: {e}*"

    # Merge sections into a full report
    report = report_title
    report += f"> 生成时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"

    for section_key in section_order:
        if section_key in sections:
            report += sections[section_key] + "\n\n"

    return report


async def analyze_industry_streaming(industry: str, search_results: list[SearchResult], progress_callback):
    """Analyze with streaming progress updates via callback. Auto-detects industry vs product."""

    analysis_type = await _classify_topic(industry)
    await progress_callback("analyze", 5, f"识别为: {'产品/爆款' if analysis_type == 'product' else '行业/品类'}分析")

    context_parts = []
    for r in search_results[:15]:
        part = f"### {r.title}\n来源: {r.url}\n{r.snippet}"
        if r.content:
            part += f"\n{r.content[:2000]}"
        context_parts.append(part)
    context = "\n\n---\n\n".join(context_parts)

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
        }
        report_title = f"# {industry} 产品分析报告\n\n"
    else:
        prompts = SECTION_PROMPTS
        section_order = ["value_chain", "competition", "players", "consumers", "tactics", "brands", "channels", "trending_products", "competitor_ops", "creative_pricing"]
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
        }
        report_title = f"# {industry} 行业分析报告\n\n"

    sections = {}

    # Generate all sections in parallel
    import asyncio

    valid_keys = [k for k in section_order if k in prompts]
    total = len(valid_keys)
    completed = [0]

    async def generate_section(key: str):
        prompt_template = prompts[key]
        name = section_names.get(key, key)
        user_msg = prompt_template.format(industry=industry, context=context)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry)},
            {"role": "user", "content": user_msg},
        ]
        try:
            content = await chat(messages, temperature=0.7)
        except Exception as e:
            logger.error(f"Failed to generate section {key}: {e}")
            content = f"*此部分生成失败: {e}*"
        completed[0] += 1
        progress_pct = 60 + int(completed[0] * 30 / total)
        await progress_callback("analyze", progress_pct, f"正在生成: {name}... ({completed[0]}/{total})")
        return key, content

    await progress_callback("analyze", 60, f"并行生成 {total} 个章节...")
    results = await asyncio.gather(*[generate_section(k) for k in valid_keys])
    sections.update(dict(results))

    # Assemble report in order
    report = report_title
    report += f"> 生成时间: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"

    for section_key in section_order:
        if section_key in sections:
            report += sections[section_key] + "\n\n"

    return report
