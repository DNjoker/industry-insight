"""Autocomplete suggestions and trending industry discovery."""

import time
import logging
from fastapi import APIRouter, HTTPException
from backend.models.schemas import AutocompleteRequest, AutocompleteResponse, TrendingResponse
from backend.services.llm_client import chat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["discover"])

# Cache: refreshed every 24 hours
_trending_cache: list[dict] | None = None
_trending_cache_time: float = 0
_CACHE_TTL = 86400  # 24 hours

# Fallback static list (used when LLM is unavailable)
FALLBACK_TRENDING = [
    {"name": "直播电商", "reason": "持续高增长，平台混战"},
    {"name": "宠物经济", "reason": "千亿赛道，年轻人消费升级"},
    {"name": "AI 应用", "reason": "大模型落地年，应用层爆发"},
    {"name": "预制菜", "reason": "餐饮零售化，渠道变革"},
    {"name": "银发经济", "reason": "老龄化加速，政策红利"},
    {"name": "新能源出海", "reason": "中国车企全球化加速"},
    {"name": "跨境电商", "reason": "TEMU/TikTok Shop 持续扩张"},
    {"name": "折扣零售", "reason": "消费分级，奥莱/零食量贩火热"},
    {"name": "短剧/微短剧", "reason": "内容新形态，付费模式验证"},
    {"name": "本地生活", "reason": "抖音美团开战，到店到家混战"},
    {"name": "储能/户用储能", "reason": "欧洲能源转型，需求爆发"},
    {"name": "男士护肤", "reason": "新人群觉醒，品类渗透率提升"},
]


async def _generate_trending() -> list[dict]:
    """Use LLM to generate trending industry topics."""
    prompt = f"""列出当前（{time.strftime('%Y年%m月')}）中国商业/消费领域最值得关注的 10-12 个热门行业或赛道。

要求：
- 优先当前正在发生变化的赛道（政策变化、技术突破、消费趋势、资本动向）
- 覆盖不同领域（消费、科技、出海、新能源、内容等）
- 每个赛道给一句简短理由（≤15字），说明为什么现在值得关注
- 不要泛泛的"电商"、"教育"这种大词，要具体赛道

输出格式：严格 JSON 数组
[
  {{"name": "赛道名", "reason": "一句话理由"}}
]

只输出 JSON 数组，不要其他文字。"""

    try:
        response = await chat([
            {"role": "system", "content": "你是一个商业趋势分析师，擅长发现新兴赛道。输出严格的 JSON 数组。"},
            {"role": "user", "content": prompt},
        ], temperature=0.7)
    except Exception as e:
        logger.warning(f"Trending generation failed: {e}")
        return []

    import json
    import re
    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        if isinstance(parsed, list) and len(parsed) > 0:
            return [{"name": item["name"], "reason": item["reason"]} for item in parsed if "name" in item]
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse trending JSON: {e}")

    return []


@router.get("/trending", response_model=TrendingResponse)
async def trending_industries():
    global _trending_cache, _trending_cache_time

    now = time.time()
    if _trending_cache and (now - _trending_cache_time) < _CACHE_TTL:
        return TrendingResponse(industries=_trending_cache)

    # Try LLM generation
    generated = await _generate_trending()
    if generated:
        _trending_cache = generated
        _trending_cache_time = now
        return TrendingResponse(industries=generated)

    # Fallback to last cache or static list
    if _trending_cache:
        return TrendingResponse(industries=_trending_cache)
    return TrendingResponse(industries=FALLBACK_TRENDING)


@router.post("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(request: AutocompleteRequest):
    keyword = request.keyword.strip()
    if not keyword or len(keyword) < 1:
        return AutocompleteResponse(suggestions=[])

    prompt = f"""用户对「{keyword}」行业感兴趣，但这个范围可能太宽泛。
请列出 5-8 个与「{keyword}」相关的更具体的细分行业/赛道/方向。
每行输出一个，格式为：细分名称|一句话价值点
要求：
- 覆盖不同角度（产品、服务、渠道、人群、阶段等）
- 不要重复，每个方向要明显不同
- 不要解释，只输出列表

例如输入"宠物"，输出：
宠物食品|主粮零食营养品，刚需高频
宠物医疗|连锁医院+线上问诊，技术驱动
宠物用品|智能猫砂盆、出行装备，消费升级
宠物殡葬|情感消费+服务链条长，高客单
宠物洗护美容|到店+上门，人力密集型连锁化
宠物保险|金融+宠物，高增长低渗透
宠物社交/社区|内容+电商，流量变现
宠物寄养/托育|节假日经济，标准化难"""

    try:
        response = await chat(
            messages=[
                {"role": "system", "content": "你是一个行业分析师，擅长拆解行业细分赛道。只输出列表，不输出其他内容。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
        )
    except Exception:
        return AutocompleteResponse(suggestions=[])

    suggestions = []
    for line in response.strip().split("\n"):
        line = line.strip()
        if not line or "|" not in line:
            continue
        parts = line.split("|", 1)
        name = parts[0].strip()
        desc = parts[1].strip() if len(parts) > 1 else ""
        # Clean up numbering
        if name and (name[0].isdigit()):
            name = name.lstrip("0123456789.、) ）")
        if name:
            suggestions.append({"name": name, "description": desc})

    return AutocompleteResponse(suggestions=suggestions[:8])
