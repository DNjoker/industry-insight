"""Competitor analysis: image analysis via Volcano Vision, save to 灵感库."""
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from backend.services.vision_client import analyze_main_image, analyze_detail_screen, analyze_overall
from backend.services.obsidian_writer import atomic_write, build_frontmatter
from backend.config import settings, get_vault_path

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/competitor", tags=["competitor"])


# ── Request/Response Models ──────────────────────────────────────────────

class AnalyzeReviewsRequest(BaseModel):
    reviews: list[str] = Field(default_factory=list, description="提取到的评价文本列表")
    product_name: str = Field(default="", description="竞品名称")


@router.post("/analyze-reviews")
async def analyze_reviews(request: AnalyzeReviewsRequest):
    """Analyze competitor reviews using LLM to extract insights."""
    if not request.reviews:
        raise HTTPException(status_code=400, detail="请提供评价文本")

    reviews_text = "\n---\n".join(
        f"评价{i+1}: {r}" for i, r in enumerate(request.reviews[:50])
    )

    from backend.services.llm_client import chat
    prompt = (
        "你是一个电商运营专家。以下是竞品「" + request.product_name + "」的用户评价。\n"
        "请重点分析差评和中评，同时也要看好评。\n\n"
        + reviews_text + "\n\n"
        "请分析这些评价，返回严格的JSON格式（不要任何额外文字）：\n"
        "{\n"
        '  "negative_reviews": ["列出最关键的3-5条差评原文（原文，不是概括）"],\n'
        '  "negative_themes": ["差评集中反映的3-5个问题（如：物流慢、包装漏、效果夸大、和描述不符等）"],\n'
        '  "praise_points": ["好评中用户夸的最多的3-5个点，用用户原话"],\n'
        '  "complaint_points": ["用户抱怨最多的3-5个点，用用户原话"],\n'
        '  "competitive_gaps": ["从差评和中评中看到的、我的产品有机会超越的3个方向"],\n'
        '  "fake_review_signs": "是否存在刷好评迹象（如大量雷同评价、新账号集中好评等，1句话判断）",\n'
        '  "price_sentiment": "用户对价格的看法（1句话）",\n'
        '  "repurchase_signal": "是否有复购信号（1句话）",\n'
        '  "review_quality_score": 7.5\n'
        "}\n\n"
        "评分标准：差评洞察力(40%) + 好评真实性(20%) + 机会发现(20%) + 复购信号(20%)\n"
        "注意：negative_reviews 必须保留差评用户原话，不要改写。"
    )

    try:
        result = await chat(
            [{"role": "user", "content": prompt}],
            temperature=0.5,
        )
        cleaned = result.strip()
        import re
        code_blocks = re.findall(r"```(?:json)?\s*\n?(.*?)```", cleaned, re.DOTALL)
        if code_blocks:
            cleaned = max(code_blocks, key=len).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            cleaned = cleaned[start:end + 1]
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning(f"Review analysis JSON parse failed")
        return {"raw": result, "error": "JSON解析失败"}


class AnalyzeImagesRequest(BaseModel):
    image_paths: list[str] = Field(..., description="本地图片文件路径列表（主图+详情页截图）")
    image_categories: list[str] = Field(default_factory=list, description="每张图的分类: main/sku/detail")
    platform: str = Field(default="淘宝", description="平台名称")
    category: str = Field(default="", description="产品类目")
    product_name: str = Field(default="", description="竞品名称")


class SaveAnalysisRequest(BaseModel):
    """Save a completed analysis to the 灵感库."""
    product_name: str
    platform: str
    category: str
    url: str = Field(default="")
    images: list[str] = Field(default_factory=list)  # source image paths
    analysis: dict = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    reviews: list[str] = Field(default_factory=list)  # raw review texts
    review_analysis: dict | None = None  # AI analysis of reviews


# ── Analysis Endpoint ────────────────────────────────────────────────────

@router.get("/preview-image")
async def preview_image(path: str):
    """Serve a captured image file for preview in the frontend."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(path)


@router.post("/analyze")
async def analyze_images(request: AnalyzeImagesRequest):
    """Analyze competitor images using Volcano Vision model."""
    if not settings.volcano_api_key:
        raise HTTPException(status_code=400, detail="Volcano API Key 未配置")

    if not request.image_paths:
        raise HTTPException(status_code=400, detail="请提供至少一张图片")

    logger.info(f"Analyze request: {len(request.image_paths)} images, categories: {request.image_categories}")
    results = []
    categories = request.image_categories or []
    for i, img_path in enumerate(request.image_paths):
        logger.info(f"Checking image [{i}]: {img_path}")
        if not os.path.exists(img_path):
            logger.warning(f"Image not found: {img_path}")
            results.append({"error": f"图片不存在: {img_path}"})
            continue
        file_size = os.path.getsize(img_path)
        logger.info(f"Image [{i}] found, size: {file_size} bytes")
        if file_size < 1024:
            logger.warning(f"Image [{i}] too small ({file_size}B), likely not a valid image")
            results.append({"error": f"图片文件异常（大小仅{file_size}B），可能下载失败"})
            continue

        img_cat = categories[i] if i < len(categories) else "detail"
        try:
            if img_cat == "main":
                analysis = await analyze_main_image(img_path)
                analysis["image_type"] = "main_image"
            elif img_cat == "sku":
                # SKU images: use main_image analysis (simpler prompt) since they're usually product shots
                analysis = await analyze_main_image(img_path)
                analysis["image_type"] = "sku_image"
            else:
                analysis = await analyze_detail_screen(img_path)
                analysis["image_type"] = "detail_screen"
            analysis["image_index"] = i
            analysis["source_path"] = img_path
            results.append(analysis)
        except Exception as e:
            logger.error(f"Vision analysis failed for {img_path}: {e}")
            results.append({"error": str(e), "source_path": img_path})

    # Generate overall assessment
    overall = {}
    valid = [r for r in results if "error" not in r]
    if len(valid) >= 2:
        try:
            overall = await analyze_overall(valid)
        except Exception as e:
            logger.error(f"Overall analysis failed: {e}")
            overall = {"error": str(e)}

    return {
        "platform": request.platform,
        "category": request.category,
        "product_name": request.product_name,
        "screens": results,
        "overall": overall,
    }


# ── Save / List / Load 灵感库 ────────────────────────────────────────────

def _get_inspiration_dir(category: str = "") -> str:
    vault = get_vault_path()
    if not vault:
        raise ValueError("Obsidian vault path not configured")
    if category:
        return os.path.join(vault, "灵感库", category)
    return os.path.join(vault, "灵感库")


@router.post("/save")
async def save_analysis(request: SaveAnalysisRequest):
    """Save a competitor analysis to the Obsidian 灵感库."""
    vault = get_vault_path()
    if not vault:
        raise HTTPException(status_code=400, detail="Obsidian Vault 路径未配置")

    category_dir = request.category or "未分类"
    base_dir = os.path.join(vault, "灵感库", category_dir, request.product_name)
    os.makedirs(base_dir, exist_ok=True)

    # Copy images to inspiration library
    saved_images = []
    for i, img_path in enumerate(request.images):
        if not os.path.exists(img_path):
            continue
        ext = os.path.splitext(img_path)[1] or ".png"
        dest = os.path.join(base_dir, f"{i+1:02d}_{request.product_name}{ext}")
        shutil.copy2(img_path, dest)
        saved_images.append(dest)

    # Build analysis markdown
    analysis = request.analysis or {}
    overall = analysis.get("overall", {})
    screens = analysis.get("screens", [])

    tags = list(set(
        (request.tags or []) +
        ["灵感库", "竞品分析", request.platform] +
        ([request.category] if request.category else [])
    ))
    fm = build_frontmatter({
        "tags": tags,
        "product": request.product_name,
        "platform": request.platform,
        "category": request.category,
        "url": request.url,
        "overall_score": overall.get("overall_score", ""),
        "analyzed_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })

    body_lines = [f"# {request.product_name}\n"]
    body_lines.append(f"**平台**: {request.platform}  ")
    if request.category:
        body_lines.append(f"**类目**: {request.category}  ")
    if request.url:
        body_lines.append(f"**链接**: {request.url}  ")
    body_lines.append("")

    # Overall assessment
    if overall:
        body_lines.append("## 综合评估\n")
        score = overall.get("overall_score", "")
        if score:
            body_lines.append(f"**综合评分**: {score}/10  \n")
        for key, label in [
            ("structure_quality", "结构质量"),
            ("copy_quality", "文案质量"),
            ("visual_quality", "视觉质量"),
        ]:
            val = overall.get(key, "")
            if val:
                body_lines.append(f"- **{label}**: {val}")
        body_lines.append("")

        if overall.get("top_strengths"):
            body_lines.append("### 最大亮点\n")
            for s in overall["top_strengths"]:
                body_lines.append(f"- {s}")
            body_lines.append("")

        if overall.get("top_weaknesses"):
            body_lines.append("### 可改进点\n")
            for w in overall["top_weaknesses"]:
                body_lines.append(f"- {w}")
            body_lines.append("")

        if overall.get("usable_ideas"):
            body_lines.append("### 可借鉴思路\n")
            for idea in overall["usable_ideas"]:
                body_lines.append(f"- {idea}")
            body_lines.append("")

        if overall.get("extracted_selling_points"):
            body_lines.append("### 提取到的卖点\n")
            for sp in overall["extracted_selling_points"]:
                body_lines.append(f"- {sp}")
            body_lines.append("")

    # Per-screen analysis
    if screens:
        body_lines.append("## 各屏分析\n")
        for s in screens:
            if "error" in s:
                continue
            idx = s.get("image_index", "?")
            img_type = s.get("image_type", "")
            title = "主图" if img_type == "main_image" else f"详情页第{idx}屏"
            screen_title = s.get("screen_title", "")
            if screen_title:
                title += f" — {screen_title}"

            body_lines.append(f"### {title}\n")
            for key, label in [
                ("copy_text", "文案内容"), ("layout_style", "构图"),
                ("layout", "排版"), ("colors", "配色"),
                ("visual_focus", "视觉重心"), ("selling_point", "核心卖点"),
            ]:
                val = s.get(key, "")
                if val:
                    if isinstance(val, list):
                        body_lines.append(f"- **{label}**: {', '.join(val)}")
                    else:
                        body_lines.append(f"- **{label}**: {val}")
            if s.get("score"):
                body_lines.append(f"- **评分**: {s['score']}/10")
            body_lines.append("")

    # Reviews
    reviews = request.reviews or []
    if reviews:
        body_lines.append("## 用户评价原文\n")
        for i, r in enumerate(reviews[:30], 1):
            body_lines.append(f"{i}. {r}")
        body_lines.append("")

    # Review analysis
    ra = request.review_analysis or {}
    if ra and not ra.get("error"):
        body_lines.append("## 评价分析\n")
        score = ra.get("review_quality_score", "")
        if score:
            body_lines.append(f"**评价质量分**: {score}/10\n")

        negative = ra.get("negative_reviews", [])
        if negative:
            body_lines.append("### 关键差评（原文）\n")
            for n in negative:
                body_lines.append(f"- {n}")
            body_lines.append("")

        neg_themes = ra.get("negative_themes", [])
        if neg_themes:
            body_lines.append("### 差评集中反映的问题\n")
            for t in neg_themes:
                body_lines.append(f"- {t}")
            body_lines.append("")

        praise = ra.get("praise_points", [])
        if praise:
            body_lines.append("### 用户夸赞\n")
            for p in praise:
                body_lines.append(f"- {p}")
            body_lines.append("")

        gaps = ra.get("competitive_gaps", [])
        if gaps:
            body_lines.append("### 我的机会点\n")
            for g in gaps:
                body_lines.append(f"- {g}")
            body_lines.append("")

        fake = ra.get("fake_review_signs", "")
        if fake:
            body_lines.append(f"**刷好评迹象**: {fake}\n")
        price = ra.get("price_sentiment", "")
        if price:
            body_lines.append(f"**价格感知**: {price}\n")
        repurchase = ra.get("repurchase_signal", "")
        if repurchase:
            body_lines.append(f"**复购信号**: {repurchase}\n")
        body_lines.append("")

    # Image gallery
    if saved_images:
        body_lines.append("## 图片\n")
        for img in saved_images:
            rel = os.path.relpath(img, base_dir)
            body_lines.append(f"![[{rel}]]")
        body_lines.append("")

    body_lines.append("---")
    body_lines.append(f"*分析时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")

    # Write analysis.md
    md_path = os.path.join(base_dir, f"{request.product_name} 竞品分析.md")
    atomic_write(md_path, fm + "\n".join(body_lines))

    rel_path = os.path.relpath(md_path, vault).replace("\\", "/")
    return {"success": True, "path": rel_path, "saved_images": len(saved_images)}


@router.get("/library")
async def list_library():
    """List saved competitor analyses from 灵感库."""
    vault = get_vault_path()
    if not vault:
        return {"items": [], "error": "Obsidian Vault 路径未配置"}

    lib_dir = os.path.join(vault, "灵感库")
    if not os.path.exists(lib_dir):
        return {"items": []}

    items = []
    for root, dirs, files in os.walk(lib_dir):
        # Only process leaf directories (product folders)
        md_files = [f for f in files if f.endswith(".md")]
        img_files = [f for f in files if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
        if md_files:
            for md in md_files:
                md_path = os.path.join(root, md)
                rel = os.path.relpath(md_path, vault).replace("\\", "/")
                cat = os.path.relpath(root, lib_dir).replace("\\", "/")
                if cat == ".":
                    cat = "未分类"
                elif "/" in cat:
                    cat = cat.split("/")[0]
                items.append({
                    "name": md.replace(".md", "").replace(" 竞品分析", ""),
                    "path": rel,
                    "category": cat,
                    "image_count": len(img_files),
                })
        # Only items with analysis markdown are shown

    # Sort by name
    items.sort(key=lambda x: x["name"])
    return {"items": items}


@router.post("/library/delete")
async def delete_from_library(request: dict):
    """Delete a saved competitor analysis from 灵感库."""
    vault = get_vault_path()
    if not vault:
        raise HTTPException(status_code=400, detail="Obsidian Vault 路径未配置")

    analysis_path = request.get("path", "")
    if not analysis_path:
        raise HTTPException(status_code=400, detail="请提供分析文件路径")

    full_path = os.path.join(vault, analysis_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="分析文件不存在")

    # Delete the parent folder (contains images + md)
    parent_dir = os.path.dirname(full_path)
    try:
        if os.path.isdir(parent_dir):
            shutil.rmtree(parent_dir)
        else:
            os.remove(full_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/library/open-folder")
async def open_library_folder(request: dict):
    """Open the 灵感库 folder in system file manager."""
    import subprocess
    vault = get_vault_path()
    if not vault:
        raise HTTPException(status_code=400, detail="Obsidian Vault 路径未配置")

    lib_dir = os.path.join(vault, "灵感库")
    category = request.get("category", "")
    if category:
        lib_dir = os.path.join(lib_dir, category)

    if not os.path.exists(lib_dir):
        os.makedirs(lib_dir, exist_ok=True)

    try:
        if os.name == "nt":
            os.startfile(lib_dir)
        else:
            subprocess.run(["open", lib_dir])
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/library/load")
async def load_analysis(request: dict):
    """Load a saved competitor analysis to import into selling point."""
    vault = get_vault_path()
    if not vault:
        raise HTTPException(status_code=400, detail="Obsidian Vault 路径未配置")

    analysis_path = request.get("path", "")
    if not analysis_path:
        raise HTTPException(status_code=400, detail="请提供分析文件路径")

    full_path = os.path.join(vault, analysis_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="分析文件不存在")

    content = Path(full_path).read_text(encoding="utf-8")

    # Extract frontmatter for structured data
    data: dict = {"content": content, "path": analysis_path}
    if content.startswith("---"):
        end = content.find("---", 4)
        if end != -1:
            fm_text = content[4:end].strip()
            for line in fm_text.split("\n"):
                line = line.strip()
                if ":" in line:
                    key, _, val = line.partition(":")
                    data[key.strip()] = val.strip()

    # Find extracted selling points from the markdown
    import re
    sp_match = re.search(r"### 提取到的卖点\n(.*?)(?:\n##|\n---|\Z)", content, re.DOTALL)
    if sp_match:
        sp_text = sp_match.group(1)
        data["selling_points"] = [s.strip("- ") for s in sp_text.strip().split("\n") if s.strip().startswith("-")]

    snippet_match = re.search(r"### 可借鉴思路\n(.*?)(?:\n##|\n---|\Z)", content, re.DOTALL)
    if snippet_match:
        idea_text = snippet_match.group(1)
        data["usable_ideas"] = [s.strip("- ") for s in idea_text.strip().split("\n") if s.strip().startswith("-")]

    return data


def _validate_config() -> str | None:
    if not settings.volcano_api_key:
        return "Volcano Vision API Key 未配置"
    return None
