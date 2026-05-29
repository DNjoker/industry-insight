import re
import sys
import os
from pathlib import Path
from fastapi import APIRouter
from backend.models.schemas import ConfigUpdate, ConfigResponse
from backend.config import settings, get_vault_path

router = APIRouter(prefix="/api/config", tags=["config"])


def _get_env_path() -> Path:
    env_path = os.environ.get("DOTENV_PATH")
    if env_path:
        return Path(env_path)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / ".env"
    return Path(__file__).resolve().parent.parent / ".env"


def _format_env_line(key: str, value: str) -> str:
    if " " in value or "\t" in value:
        return f'{key}="{value}"'
    return f"{key}={value}"


def _persist_env(updates: dict[str, str]) -> None:
    """Write key=value pairs back to the .env file, preserving existing lines."""
    env_path = _get_env_path()
    if not env_path.exists():
        lines: list[str] = []
    else:
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        m = re.match(r"^([A-Z_]+)\s*=\s*.*", stripped)
        if m and m.group(1) in updates:
            new_lines.append(_format_env_line(m.group(1), updates[m.group(1)]))
            updated_keys.add(m.group(1))
        else:
            new_lines.append(line)

    for env_key, value in updates.items():
        if env_key not in updated_keys:
            new_lines.append(_format_env_line(env_key, value))

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


@router.get("/", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        has_deepseek_key=bool(settings.deepseek_api_key),
        has_anthropic_key=bool(settings.anthropic_api_key),
        has_openai_key=bool(settings.openai_api_key),
        openai_base_url=settings.openai_base_url,
        search_engine=getattr(settings, "search_engine", "tavily") or "tavily",
        has_tavily_key=bool(settings.tavily_api_key),
        has_bing_key=bool(settings.bing_api_key),
        obsidian_vault_path=get_vault_path(),
        has_volcano_key=bool(settings.volcano_api_key),
        volcano_vision_model=settings.volcano_vision_model or "doubao-seed-1-6-251015",
        preload_knowledge_base=settings.preload_knowledge_base,
        sync_on_startup=settings.sync_on_startup,
    )


@router.put("/", response_model=ConfigResponse)
async def update_config(data: ConfigUpdate):
    env_updates: dict[str, str] = {}

    if data.llm_provider is not None:
        settings.llm_provider = data.llm_provider
        env_updates["LLM_PROVIDER"] = data.llm_provider
    if data.llm_model is not None:
        settings.llm_model = data.llm_model
        env_updates["LLM_MODEL"] = data.llm_model
    if data.deepseek_api_key is not None:
        settings.deepseek_api_key = data.deepseek_api_key
        env_updates["DEEPSEEK_API_KEY"] = data.deepseek_api_key
    if data.anthropic_api_key is not None:
        settings.anthropic_api_key = data.anthropic_api_key
        env_updates["ANTHROPIC_API_KEY"] = data.anthropic_api_key
    if data.openai_api_key is not None:
        settings.openai_api_key = data.openai_api_key
        env_updates["OPENAI_API_KEY"] = data.openai_api_key
    if data.openai_base_url is not None:
        settings.openai_base_url = data.openai_base_url
        env_updates["OPENAI_BASE_URL"] = data.openai_base_url
    if data.search_engine is not None:
        settings.search_engine = data.search_engine
        env_updates["SEARCH_ENGINE"] = data.search_engine
    if data.tavily_api_key is not None:
        settings.tavily_api_key = data.tavily_api_key
        env_updates["TAVILY_API_KEY"] = data.tavily_api_key
    if data.bing_api_key is not None:
        settings.bing_api_key = data.bing_api_key
        env_updates["BING_API_KEY"] = data.bing_api_key
    if data.obsidian_vault_path is not None:
        settings.obsidian_vault_path = data.obsidian_vault_path
        env_updates["OBSIDIAN_VAULT_PATH"] = data.obsidian_vault_path
    if data.volcano_api_key is not None:
        settings.volcano_api_key = data.volcano_api_key
        env_updates["VOLCANO_API_KEY"] = data.volcano_api_key
    if data.volcano_vision_model is not None:
        settings.volcano_vision_model = data.volcano_vision_model
        env_updates["VOLCANO_VISION_MODEL"] = data.volcano_vision_model
    if data.preload_knowledge_base is not None:
        settings.preload_knowledge_base = data.preload_knowledge_base
        env_updates["PRELOAD_KNOWLEDGE_BASE"] = "true" if data.preload_knowledge_base else "false"
    if data.sync_on_startup is not None:
        settings.sync_on_startup = data.sync_on_startup
        env_updates["SYNC_ON_STARTUP"] = "true" if data.sync_on_startup else "false"

    if env_updates:
        _persist_env(env_updates)

    return ConfigResponse(
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        has_deepseek_key=bool(settings.deepseek_api_key),
        has_anthropic_key=bool(settings.anthropic_api_key),
        has_openai_key=bool(settings.openai_api_key),
        openai_base_url=settings.openai_base_url,
        search_engine=getattr(settings, "search_engine", "tavily") or "tavily",
        has_tavily_key=bool(settings.tavily_api_key),
        has_bing_key=bool(settings.bing_api_key),
        obsidian_vault_path=get_vault_path(),
        has_volcano_key=bool(settings.volcano_api_key),
        volcano_vision_model=settings.volcano_vision_model or "doubao-seed-1-6-251015",
        preload_knowledge_base=settings.preload_knowledge_base,
        sync_on_startup=settings.sync_on_startup,
    )
