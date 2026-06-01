import sys
import os
from pydantic_settings import BaseSettings
from typing import Optional


def _get_dotenv_path() -> str:
    env_path = os.environ.get("DOTENV_PATH")
    if env_path:
        return env_path
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), ".env")
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


class Settings(BaseSettings):
    model_config = {"env_file": _get_dotenv_path(), "env_file_encoding": "utf-8"}

    # HuggingFace mirror
    hf_endpoint: str = "https://hf-mirror.com"

    # AI Provider
    llm_provider: str = "deepseek"  # deepseek | claude | openai
    llm_model: str = "deepseek-chat"
    deepseek_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None  # for openai-compatible providers

    # Search
    search_engine: str = "baidu"  # baidu | tavily | direct
    tavily_api_key: Optional[str] = None
    baidu_api_key: Optional[str] = None

    # Obsidian
    obsidian_vault_path: Optional[str] = None

    # Server
    backend_port: int = 19877

    # Embedding
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_device: str = "cpu"


settings = Settings()

# Apply HuggingFace endpoint before any HF libraries are imported
if settings.hf_endpoint:
    os.environ["HF_ENDPOINT"] = settings.hf_endpoint


def _get_app_data_dir() -> str:
    """Get the writable data directory for the app (fallback vault, chroma, etc.)."""
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), "data")
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def get_vault_path() -> str:
    """Return the configured Obsidian vault path, or a local fallback directory.

    When no Obsidian vault is configured, files are saved to data/vault/
    inside the project (dev) or alongside the exe (production). This ensures
    all features work without Obsidian.
    """
    if settings.obsidian_vault_path:
        return settings.obsidian_vault_path
    fallback = os.path.join(_get_app_data_dir(), "vault")
    os.makedirs(fallback, exist_ok=True)
    return fallback
