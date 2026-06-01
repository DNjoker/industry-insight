from pydantic import BaseModel
from typing import Optional


class ScanRequest(BaseModel):
    industry: str
    time_range: str = "month"  # week, month, half_year, all
    role: str = "general"  # general, factory, brand, dealer, investor, government
    location: str = ""  # optional location context, e.g. "广西贺州", "浙江杭州"
    overseas: bool = False  # cross-border/overseas mode — enables bilingual search + overseas chapters


class ScanProgress(BaseModel):
    step: str
    progress: int
    message: str
    report_path: Optional[str] = None
    source_count: Optional[int] = None


class RegenerateSectionRequest(BaseModel):
    industry: str
    role: str = "general"
    section_key: str  # e.g. "competition", "tactics", "value_chain"
    analysis_type: str = "industry"  # "industry" or "product"
    location: str = ""
    overseas: bool = False


class RegenerateSectionResponse(BaseModel):
    section_key: str
    section_name: str
    content: str


class SearchRequest(BaseModel):
    query: str
    max_results: int = 10


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    content: Optional[str] = None
    quality_score: Optional[float] = None
    authority_tier: Optional[int] = None
    search_origin: Optional[str] = None  # which search query produced this result


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
    baidu_api_key: Optional[str] = None
    obsidian_vault_path: Optional[str] = None
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
    has_baidu_key: bool = False
    obsidian_vault_path: Optional[str] = None
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


class EmbeddingSyncRequest(BaseModel):
    directories: list[str] = ["行业摸底"]
    collection_name: str = "source_articles_v2"
    exclude_sources: bool = True
