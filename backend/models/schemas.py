from pydantic import BaseModel
from typing import Optional


class ScanRequest(BaseModel):
    industry: str
    time_range: str = "month"  # week, month, half_year, all


class ScanProgress(BaseModel):
    step: str
    progress: int
    message: str
    report_path: Optional[str] = None
    source_count: Optional[int] = None


class SearchRequest(BaseModel):
    query: str
    max_results: int = 10


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    content: Optional[str] = None


class ObsidianNote(BaseModel):
    path: str
    content: str
    frontmatter: dict = {}


class ObsidianWriteRequest(BaseModel):
    relative_path: str
    content: str
    frontmatter: dict = {}
    overwrite: bool = False


class ObsidianWriteResponse(BaseModel):
    path: str
    success: bool
    message: str


class ConfigUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    search_engine: Optional[str] = None
    tavily_api_key: Optional[str] = None
    bing_api_key: Optional[str] = None
    obsidian_vault_path: Optional[str] = None
    volcano_api_key: Optional[str] = None
    volcano_vision_model: Optional[str] = None
    preload_knowledge_base: Optional[bool] = None
    sync_on_startup: Optional[bool] = None


class ConfigResponse(BaseModel):
    llm_provider: str
    llm_model: str
    has_deepseek_key: bool
    has_anthropic_key: bool
    has_openai_key: bool
    openai_base_url: Optional[str] = None
    search_engine: str = "tavily"
    has_tavily_key: bool = False
    has_bing_key: bool = False
    obsidian_vault_path: Optional[str] = None
    has_volcano_key: bool = False
    volcano_vision_model: str = "doubao-seed-1-6-251015"
    preload_knowledge_base: bool = False
    sync_on_startup: bool = False


class AutocompleteRequest(BaseModel):
    keyword: str


class AutocompleteSuggestion(BaseModel):
    name: str
    description: str


class AutocompleteResponse(BaseModel):
    suggestions: list[AutocompleteSuggestion]


class TrendingItem(BaseModel):
    name: str
    reason: str


class TrendingResponse(BaseModel):
    industries: list[TrendingItem]


# ============================================================
# Knowledge Extraction models
# ============================================================

class ParsedItem(BaseModel):
    """A single item parsed from batch input."""
    index: int
    raw: str
    item_type: str  # "web_url" | "text" | "unknown"
    note: Optional[str] = None  # user annotation from | syntax


class KnowledgeCard(BaseModel):
    """AI-generated knowledge card."""
    index: int
    source_type: str  # "实操卡片" | "阅读笔记"
    content_type: str = "mixed"  # "long_form" (preserve original) | "mixed" (AI refined)
    title: str
    tags: list[str] = []
    abstract: str = ""  # 1-2 sentence summary for indexing
    body: str = ""  # main markdown content (original for long_form, refined for mixed)
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    user_note: Optional[str] = None
    raw_content: Optional[str] = None  # original extracted text (includes comments, subtitles, etc.)


class ExtractParseRequest(BaseModel):
    text: str


class ExtractParseResponse(BaseModel):
    items: list[ParsedItem]


class ExtractStreamRequest(BaseModel):
    text: str
    items: Optional[list[ParsedItem]] = None


class SaveCardsRequest(BaseModel):
    cards: list[KnowledgeCard]


class SaveCardsResponse(BaseModel):
    saved_count: int
    paths: list[str]
    saved_dir: Optional[str] = None
    error: Optional[str] = None


# ============================================================
# Chat import models (browser extension)
# ============================================================

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatPreviewRequest(BaseModel):
    messages: list[ChatMessage]


class ChatPreviewResponse(BaseModel):
    suggested_title: str
    suggested_tags: list[str]
    abstract: str


class ChatSaveRequest(BaseModel):
    messages: list[ChatMessage]
    title: str
    tags: list[str] = []
    abstract: str = ""
    refined_content: str = ""
    overwrite_path: Optional[str] = None  # old file path to delete after save


class ChatSaveResponse(BaseModel):
    success: bool
    path: Optional[str] = None
    absolute_dir: Optional[str] = None
    error: Optional[str] = None


class ChatRefineRequest(BaseModel):
    messages: list[ChatMessage]
    title: str = ""


class ChatRefineResponse(BaseModel):
    refined_content: str
    error: Optional[str] = None


# ============================================================
# Strategy Dialog
# ============================================================

class StrategyChatRequest(BaseModel):
    message: str
    conversation_history: list[dict] = []  # [{role, content}]
    enable_web_search: bool = True
    enable_knowledge_search: bool = True
    model: str = "deepseek"
    mode: str = "chat"  # "chat" | "detailed" | "casual"
    collection_name: str = "source_articles_v2"


class StrategySaveRequest(BaseModel):
    title: str
    messages: list[dict]  # [{role, content}]
    tags: list[str] = []
    abstract: str = ""


class StrategySaveSourcesRequest(BaseModel):
    sources: list[dict]  # [{title, url, snippet}]


class EmbeddingSyncRequest(BaseModel):
    directories: list[str] = ["知识卡片", "行业摸底", "DeepSeek对话"]
    collection_name: str = "source_articles_v2"
    exclude_sources: bool = True
