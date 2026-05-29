"""Multi-provider Vision API client for image analysis.

Supports: Volcano Doubao Vision, Qwen-VL, GPT-4o.
"""

import base64
import logging
from openai import AsyncOpenAI
from backend.config import settings

logger = logging.getLogger(__name__)


def _get_vision_config() -> tuple[str, str, str]:
    """Get vision model configuration based on settings.

    Returns (model_name, api_key, base_url).
    """
    model = _get_vision_model() or "doubao-seed-1-6-251015"
    api_key = settings.volcano_api_key

    if not api_key:
        raise ValueError("视觉模型 API Key 未配置，请在设置中配置")

    if model.startswith("qwen"):
        # Qwen-VL via DashScope (OpenAI-compatible)
        return model, api_key, "https://dashscope.aliyuncs.com/compatible-mode/v1"
    elif model.startswith("gpt"):
        # GPT-4o via OpenAI
        return model, api_key, "https://api.openai.com/v1"
    else:
        # Volcano Doubao Vision (default)
        return model, api_key, settings.volcano_base_url or "https://ark.cn-beijing.volces.com/api/v3"


def _get_vision_client() -> AsyncOpenAI:
    """Create OpenAI-compatible client for the configured vision model."""
    model, api_key, base_url = _get_vision_config()
    return AsyncOpenAI(api_key=api_key, base_url=base_url)


def _get_vision_model() -> str:
    """Get the currently configured vision model name."""
    model, _, _ = _get_vision_config()
    return model


def _encode_image(image_path: str) -> str:
    """Read an image file and encode as base64 data URL."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def analyze_main_image(image_path: str) -> dict:
    """Analyze a single e-commerce main image.

    Returns structured analysis: copy text, layout, colors, visual focus, score.
    """
    client = _get_vision_client()
    b64 = _encode_image(image_path)

    response = await client.chat.completions.create(
        model=_get_vision_model(),
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                },
                {
                    "type": "text",
                    "text": (
                        "你是一个资深电商设计师。请分析这张电商主图，返回严格的JSON格式（不要任何额外文字）：\n\n"
                        "{\n"
                        '  "copy_text": "图片上所有文字内容（逐条列出）",\n'
                        '  "layout_style": "构图类型（居中产品/场景氛围/文字强击/对比拼接/白底产品等）",\n'
                        '  "colors": ["主色1", "主色2", "辅色"],\n'
                        '  "visual_focus": "视觉重心在哪（如：产品占画面60%，促销文字占右上20%）",\n'
                        '  "text_ratio": "文字占画面百分比（估算）",\n'
                        '  "score": 8.5,\n'
                        '  "strengths": ["亮点1", "亮点2"],\n'
                        '  "weaknesses": ["可改进点1"]\n'
                        "}\n\n"
                        "评分标准：文案清晰度(30%) + 视觉冲击力(25%) + 卖点突出度(25%) + 平台合规性(20%)"
                    ),
                },
            ],
        }],
        max_tokens=2000,
        temperature=0.3,
    )
    return _parse_vision_response(response)


async def analyze_detail_screen(image_path: str) -> dict:
    """Analyze a detail page screen image.

    Returns: copy text, layout structure, selling point logic, score.
    """
    client = _get_vision_client()
    b64 = _encode_image(image_path)

    response = await client.chat.completions.create(
        model=_get_vision_model(),
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                },
                {
                    "type": "text",
                    "text": (
                        "你是一个资深电商详情页设计师。请分析这张详情页截图，返回严格的JSON格式：\n\n"
                        "{\n"
                        '  "screen_title": "这一屏的大标题（如有）",\n'
                        '  "copy_text": "这一屏的所有文案内容",\n'
                        '  "layout": "排版方式（左图右文/右图左文/全屏大图/三列图标/居中大字报等）",\n'
                        '  "selling_point": "这一屏要表达的核心卖点是什么",\n'
                        '  "visual_elements": ["画面元素1", "元素2"],\n'
                        '  "score": 8.0,\n'
                        '  "notes": "这一屏做得好/不好的地方（1句话）"\n'
                        "}\n\n"
                        "评分标准：卖点清晰度(40%) + 视觉设计(30%) + 文案简洁度(30%)\n"
                        "注意：不要输出任何markdown包裹，只输出纯JSON。"
                    ),
                },
            ],
        }],
        max_tokens=2000,
        temperature=0.3,
    )
    return _parse_vision_response(response)


async def analyze_overall(analyses: list[dict]) -> dict:
    """Generate overall competitor assessment from individual screen analyses."""
    client = _get_vision_client()

    summary = "\n".join(
        f"图片{i+1}: {a.get('copy_text', '')[:200]}" for i, a in enumerate(analyses)
    )

    response = await client.chat.completions.create(
        model=_get_vision_model(),
        messages=[{
            "role": "user",
            "content": (
                "你是一个资深电商运营。以下是对一个竞品详情页各屏的分析摘要。请综合评估，返回严格的JSON格式：\n\n"
                f"### 各屏分析摘要\n{summary}\n\n"
                "### 请返回：\n"
                "{\n"
                '  "overall_score": 7.5,\n'
                '  "structure_quality": "详情页整体结构评价（1-2句）",\n'
                '  "copy_quality": "文案质量评价（1-2句）",\n'
                '  "visual_quality": "视觉设计评价（1-2句）",\n'
                '  "top_strengths": ["最大亮点1", "最大亮点2", "最大亮点3"],\n'
                '  "top_weaknesses": ["最需改进1", "最需改进2"],\n'
                '  "usable_ideas": ["可以直接借鉴的思路1", "可以直接借鉴的思路2"],\n'
                '  "extracted_selling_points": ["从详情页提取到的卖点1", "卖点2"],\n'
                '  "extracted_copy_snippets": ["值得参考的文案片段1", "片段2"],\n'
                '  "applicable_categories": [\n'
                '    {"category": "适合借鉴的类目", "reason": "为什么这个设计思路适合该类目（1句话）"}\n'
                '  ]\n'
                "}\n\n"
                "评分标准：结构逻辑(25%) + 文案水平(25%) + 视觉设计(25%) + 差异化(25%)\n"
                "applicable_categories 要求：\n"
                "- 根据详情页的设计风格、卖点逻辑、文案调性，判断这套思路最适合哪些类目（美妆/服饰/3C/食品/家清/母婴/宠物/运动户外等）\n"
                "- 至少列出 2 个类目，每个附上简短的原因\n"
                "- 注意：不是照搬内容，而是「这套排版的逻辑可以迁移到XX类目」\n"
                "注意：不要输出任何markdown包裹，只输出纯JSON。"
            ),
        }],
        max_tokens=3000,
        temperature=0.3,
    )
    return _parse_vision_response(response)


def _parse_vision_response(response) -> dict:
    """Parse JSON from vision model response, handling markdown wrapping."""
    import json
    import re

    text = response.choices[0].message.content or ""
    text = text.strip()

    # Extract from code blocks if present
    code_blocks = re.findall(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if code_blocks:
        text = max(code_blocks, key=len).strip()

    # Find outermost { ... }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning(f"Vision JSON parse failed, raw: {text[:300]}")
        return {"raw": text, "error": "JSON解析失败"}
