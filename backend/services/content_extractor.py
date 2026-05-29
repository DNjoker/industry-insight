"""Extract clean content from web pages."""

import logging
import re
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def _detect_encoding(content: bytes, headers: dict) -> str:
    """Detect the correct encoding for HTML content."""
    # 1. Check Content-Type header
    content_type = headers.get("content-type", "")
    match = re.search(r"charset=([\w-]+)", content_type, re.IGNORECASE)
    if match:
        return match.group(1)

    # 2. Check HTML <meta charset> tag (scan first 2KB)
    head = content[:2048].decode("utf-8", errors="replace").lower()
    match = re.search(r'<meta[^>]+charset=["\']?([\w-]+)', head)
    if match:
        return match.group(1)

    # 3. Try to decode as GBK first (common for Chinese sites), then UTF-8
    try:
        text = content.decode("gb18030")
        # If GB18030 decode produces very few weird chars, it's likely correct
        if text.count("�") / max(len(text), 1) < 0.01:
            return "gb18030"
    except Exception:
        pass

    return "utf-8"


def _decode_response(response: httpx.Response) -> str:
    """Decode response content with proper encoding detection."""
    content = response.content
    if not content:
        return ""

    encoding = _detect_encoding(content, response.headers)

    # Normalize encoding names
    encoding_aliases = {
        "gbk": "gb18030",
        "gb2312": "gb18030",
        "gb-2312": "gb18030",
        "ansi": "gb18030",
    }
    encoding = encoding_aliases.get(encoding.lower(), encoding)

    try:
        return content.decode(encoding)
    except (LookupError, UnicodeDecodeError):
        # Final fallback
        try:
            return content.decode("gb18030")
        except Exception:
            return content.decode("utf-8", errors="replace")


async def extract(url: str, max_chars: int = 8000) -> str | None:
    """Fetch a URL and extract readable content. Returns None on failure."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url, headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            response.raise_for_status()
            html = _decode_response(response)
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        return None

    if not html:
        return None

    try:
        # Try readability-lxml first
        from readability import Document
        doc = Document(html)
        content = doc.summary()
        text = BeautifulSoup(content, "lxml").get_text(separator="\n", strip=True)
    except Exception:
        # Fallback to plain BeautifulSoup
        soup = BeautifulSoup(html, "lxml")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)

    # Clean up: remove excessive whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned = "\n".join(lines)

    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars] + "\n\n... [内容已截断]"

    return cleaned


async def extract_all(urls: list[str]) -> dict[str, str]:
    """Extract content from multiple URLs concurrently."""
    import asyncio

    tasks = [extract(url) for url in urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    content_map = {}
    for url, result in zip(urls, results):
        if isinstance(result, Exception) or result is None:
            continue
        content_map[url] = result

    return content_map
