"""AI-powered industry analysis. Model-agnostic via llm_client."""

import json
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


async def analyze_industry(industry: str, search_results: list[SearchResult], role: str = "general") -> str:
    """Analyze an industry or product and return a structured markdown report."""
    role_perspective = ROLE_PERSPECTIVES.get(role, ROLE_PERSPECTIVES["general"])
    role_consumer_modifier = ROLE_CONSUMER_MODIFIERS.get(role, "")
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    analysis_type = await _classify_topic(industry)

    # Build context from search results
    context_parts = []
    source_list_parts = []
    for r in search_results[:15]:
        part = f"### {r.title}\n来源: {r.url}\n{r.snippet}"
        if r.content:
            part += f"\n{r.content[:2000]}"
        context_parts.append(part)
        source_list_parts.append(f"- [{r.title}]({r.url})")
    context = "\n\n---\n\n".join(context_parts)
    source_list = "\n".join(source_list_parts)

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
        user_msg = prompt_template.format(**fmt_kwargs)
        system_msg = SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective)
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ]
        try:
            return key, await chat(messages, temperature=0.7)
        except Exception as e:
            logger.error(f"Failed to generate section {key}: {e}")
            return key, f"*此部分生成失败: {e}*"

    tasks = []
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    for section_key, prompt_template in prompts.items():
        if section_key in skip_sections:
            continue
        fmt_kwargs = {
            "industry": industry,
            "context": context,
            "role_section_modifier": role_section_mods.get(section_key, ""),
        }
        if section_key == "consumers":
            fmt_kwargs["role_consumer_modifier"] = role_consumer_modifier
        tasks.append(generate_section(section_key, prompt_template, fmt_kwargs))
    tasks.append(generate_section("executive_summary", EXECUTIVE_SUMMARY_PROMPT, {"industry": industry, "context": context}))
    tasks.append(generate_section("source_audit", SOURCE_GRADING_PROMPT, {"sources": source_list}))

    results = await asyncio.gather(*tasks)
    sections = dict(results)
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


async def analyze_industry_streaming(industry: str, search_results: list[SearchResult], progress_callback, role: str = "general"):
    """Analyze with streaming progress updates via callback. Auto-detects industry vs product."""

    role_perspective = ROLE_PERSPECTIVES.get(role, ROLE_PERSPECTIVES["general"])
    role_consumer_modifier = ROLE_CONSUMER_MODIFIERS.get(role, "")
    role_section_mods = ROLE_SECTION_MODIFIERS.get(role, {})
    analysis_type = await _classify_topic(industry)
    await progress_callback("analyze", 5, f"识别为: {'产品/爆款' if analysis_type == 'product' else '行业/品类'}分析")

    context_parts = []
    source_list_parts = []
    for r in search_results[:15]:
        part = f"### {r.title}\n来源: {r.url}\n{r.snippet}"
        if r.content:
            part += f"\n{r.content[:2000]}"
        context_parts.append(part)
        source_list_parts.append(f"- [{r.title}]({r.url})")
    context = "\n\n---\n\n".join(context_parts)
    source_list = "\n".join(source_list_parts)

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
        report_title = f"# {industry} 行业分析报告\n\n"

    sections = {}

    # Generate all sections in parallel (content + executive summary + source grading)
    import asyncio
    reset_cumulative_usage()

    content_keys = [k for k in section_order if k in prompts]
    all_keys = content_keys + ["executive_summary", "source_audit"]
    total = len(all_keys)
    completed = [0]

    async def generate_section(key: str):
        name = section_names.get(key, key)
        if key in prompts:
            fmt_kwargs = {
                "industry": industry,
                "context": context,
                "role_section_modifier": role_section_mods.get(key, ""),
            }
            if key == "consumers":
                fmt_kwargs["role_consumer_modifier"] = role_consumer_modifier
            user_msg = prompts[key].format(**fmt_kwargs)
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective)},
                {"role": "user", "content": user_msg},
            ]
        elif key == "executive_summary":
            user_msg = EXECUTIVE_SUMMARY_PROMPT.format(industry=industry, context=context)
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT.format(industry=industry, role_perspective=role_perspective)},
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
        completed[0] += 1
        progress_pct = 55 + int(completed[0] * 40 / total)
        await progress_callback("analyze", progress_pct, f"正在生成: {name}... ({completed[0]}/{total})")
        return key, content

    await progress_callback("analyze", 55, f"并行生成 {total} 个章节（含摘要与来源分级）...")
    results = await asyncio.gather(*[generate_section(k) for k in all_keys])
    sections.update(dict(results))
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
