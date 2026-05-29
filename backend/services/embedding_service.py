"""Local embedding service using sentence-transformers + ChromaDB."""

import logging
import os
import sys
import re
from typing import Optional
from chromadb import PersistentClient
from chromadb.utils import embedding_functions
from backend.config import settings, get_vault_path

logger = logging.getLogger(__name__)

_embedding_fn: Optional[embedding_functions.SentenceTransformerEmbeddingFunction] = None
_chroma_client: Optional[PersistentClient] = None
_collection: Optional[object] = None


def _get_data_dir() -> str:
    """Resolve data directory for chromadb storage."""
    env_dir = os.environ.get("CHROMA_DATA_DIR")
    if env_dir:
        return os.path.join(env_dir, "chroma_db_v3")
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), "data", "chroma_db_v3")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "chroma_db_v3",
    )


def _get_model_name() -> str:
    """Resolve embedding model path."""
    if getattr(sys, "frozen", False):
        local = os.path.join(sys._MEIPASS, "models", settings.embedding_model)
        if os.path.isdir(local):
            return local
    return settings.embedding_model


def get_embedding_fn():
    """Get or lazy-load the embedding function."""
    global _embedding_fn
    if _embedding_fn is None:
        model = _get_model_name()
        logger.info(f"Loading embedding model: {model}")
        _embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=model,
            device=settings.embedding_device,
        )
        logger.info("Embedding model loaded")
    return _embedding_fn


def preload_model() -> bool:
    """Preload the embedding model (e.g. on app startup). Returns True if successful."""
    try:
        fn = get_embedding_fn()
        # Trigger actual model loading by encoding a dummy sentence
        _ = fn(["preload test"])
        logger.info("Embedding model preloaded successfully")
        return True
    except Exception as e:
        logger.warning(f"Failed to preload embedding model: {e}")
        return False


def get_chroma_client() -> PersistentClient:
    """Get or create the ChromaDB persistent client. Auto-recovers if corrupted."""
    global _chroma_client
    if _chroma_client is None:
        db_path = _get_data_dir()
        os.makedirs(db_path, exist_ok=True)
        try:
            _chroma_client = PersistentClient(path=db_path)
        except Exception as e:
            if _is_corruption(e):
                _recover_chromadb()
                os.makedirs(db_path, exist_ok=True)
                _chroma_client = PersistentClient(path=db_path)
            else:
                raise
    return _chroma_client


def get_collection(name: str = "source_articles_v2"):
    """Get or create a named collection."""
    client = get_chroma_client()
    ef = get_embedding_fn()
    try:
        return client.get_or_create_collection(
            name=name,
            embedding_function=ef,
        )
    except Exception as e:
        if _is_corruption(e):
            _recover_chromadb()
            client = get_chroma_client()
            return client.get_or_create_collection(
                name=name,
                embedding_function=ef,
            )
        raise


# ── Auto-recovery from ChromaDB corruption ──────────────────────

_CORRUPTION_PATTERNS = [
    "Cannot open header file",
    "Invalid argument in upsert",
    "database disk image is malformed",
    "file is not a database",
    "database is locked",
    "Could not connect to tenant",
    "no such table",
    "sqlite3",
]


def _is_corruption(error: Exception) -> bool:
    msg = str(error)
    return any(pattern.lower() in msg.lower() for pattern in _CORRUPTION_PATTERNS)


def _recover_chromadb() -> None:
    """Delete the ChromaDB data directory and reset global state."""
    global _chroma_client, _collection
    import shutil
    db_dir = _get_data_dir()
    if os.path.isdir(db_dir):
        logger.warning(f"ChromaDB corruption detected, removing {db_dir}")
        shutil.rmtree(db_dir, ignore_errors=True)
    _chroma_client = None
    _collection = None
    logger.info("ChromaDB reset complete — will reinitialize on next access")


def index_articles(ids: list[str], texts: list[str], metadatas: list[dict], collection_name: str = "source_articles_v2"):
    """Add articles to the vector index. Auto-recovers if database is corrupted."""
    try:
        col = get_collection(collection_name)
        col.upsert(ids=ids, documents=texts, metadatas=metadatas)
    except Exception as e:
        if _is_corruption(e):
            _recover_chromadb()
            col = get_collection(collection_name)
            col.upsert(ids=ids, documents=texts, metadatas=metadatas)
        else:
            raise


def search(query: str, n_results: int = 5, collection_name: str = "source_articles_v2") -> dict:
    """Semantic search for articles. Auto-recovers if database is corrupted."""
    try:
        col = get_collection(collection_name)
        return col.query(query_texts=[query], n_results=n_results)
    except Exception as e:
        if _is_corruption(e):
            _recover_chromadb()
            col = get_collection(collection_name)
            return col.query(query_texts=[query], n_results=n_results)
        raise


def list_collections() -> list[str]:
    """List all available collection names."""
    client = get_chroma_client()
    return [c.name for c in client.list_collections()]


def get_embedding(text: str) -> list[float]:
    """Encode a single text to vector."""
    ef = get_embedding_fn()
    return ef([text])[0].tolist()


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from markdown content. Returns (frontmatter_dict, body)."""
    fm = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            try:
                import yaml
                fm = yaml.safe_load(parts[1]) or {}
            except Exception:
                fm = {}
            body = parts[2].strip()
    return fm, body


def _extract_title(frontmatter: dict, body: str, filename: str) -> str:
    """Extract title from frontmatter or first heading, fallback to filename."""
    if frontmatter.get("title"):
        return str(frontmatter["title"])
    match = re.search(r"^#\s+(.+)", body, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return os.path.splitext(filename)[0]


def sync_vault_to_collection(
    directories: list[str],
    collection_name: str = "source_articles_v2",
    exclude_sources: bool = True,
) -> dict:
    """Sync markdown files from vault directories into a ChromaDB collection.

    Walks specified directories under the vault, reads .md files, parses
    frontmatter, and indexes into the target collection. Files that exist
    in the collection but not on disk are removed.

    Args:
        directories: Subdirectories under the vault to scan.
        collection_name: ChromaDB collection name.
        exclude_sources: If True, skip files inside sources/ folders (raw
            scraped articles), only indexing report/card files.

    Returns stats: {indexed, removed, errors, total}.
    """
    vault = get_vault_path()
    if not vault:
        return {"error": "Obsidian vault path not configured"}

    col = get_collection(collection_name)

    # Scan all .md files in the specified directories
    file_entries: list[dict] = []  # [{id, text, metadata}]
    errors: list[str] = []
    skipped_sources = 0

    for dir_rel in directories:
        dir_path = os.path.join(vault, dir_rel)
        if not os.path.isdir(dir_path):
            continue

        for root, _dirs, files in os.walk(dir_path):
            for fname in files:
                if not fname.endswith(".md"):
                    continue
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, vault)

                # Skip raw source files when exclude_sources is enabled
                if exclude_sources:
                    parts = rel_path.replace("\\", "/").split("/")
                    if "sources" in parts:
                        skipped_sources += 1
                        continue
                try:
                    # Try UTF-8 first, then GBK for Windows-created files
                    raw = None
                    for enc in ["utf-8", "gbk", "utf-8-sig", "latin-1"]:
                        try:
                            with open(full_path, "r", encoding=enc) as f:
                                raw = f.read()
                            break
                        except (UnicodeDecodeError, UnicodeError):
                            continue
                    if raw is None:
                        errors.append(f"{rel_path}: 无法读取（尝试了所有编码）")
                        continue

                    fm, body = _parse_frontmatter(raw)
                    title = _extract_title(fm, body, fname)
                    tags = fm.get("tags", [])

                    file_entries.append({
                        "id": rel_path.replace("\\", "/"),
                        "text": body[:8000],
                        "metadata": {
                            "source": rel_path.replace("\\", "/"),
                            "title": title,
                            "tags": ", ".join(tags) if isinstance(tags, list) else str(tags),
                        },
                    })
                except OSError as e:
                    errors.append(f"{rel_path}: 文件系统错误 [Errno {e.errno}] {e.strerror}")
                except Exception as e:
                    errors.append(f"{rel_path}: {e}")

    if not file_entries:
        return {"indexed": 0, "removed": 0, "total": 0, "errors": errors}

    # Upsert files into collection
    ids = [e["id"] for e in file_entries]
    texts = [e["text"] for e in file_entries]
    metadatas = [e["metadata"] for e in file_entries]

    # Batch upsert to avoid memory issues with large vaults
    indexed = 0
    batch_size = 50
    for i in range(0, len(ids), batch_size):
        batch_ids = ids[i:i + batch_size]
        batch_texts = texts[i:i + batch_size]
        batch_metadatas = metadatas[i:i + batch_size]
        try:
            col.upsert(ids=batch_ids, documents=batch_texts, metadatas=batch_metadatas)
            indexed += len(batch_ids)
        except Exception as e:
            if _is_corruption(e):
                _recover_chromadb()
                col = get_collection(collection_name)
                try:
                    col.upsert(ids=batch_ids, documents=batch_texts, metadatas=batch_metadatas)
                    indexed += len(batch_ids)
                except Exception as e2:
                    errors.append(f"批次 {i // batch_size + 1} 恢复后仍失败: {e2}")
            else:
                errors.append(f"批次 {i // batch_size + 1} 索引失败: {e}")

    # Remove stale entries (in collection but not on disk)
    removed = 0
    try:
        current_ids = set(ids)
        all_ids = set(col.get()["ids"])
        stale_ids = all_ids - current_ids

        if stale_ids:
            # Only remove IDs that belong to our synced directories
            stale_to_remove = [
                sid for sid in stale_ids
                if any(sid.startswith(d + "/") or sid.startswith(d + "\\") for d in directories)
            ]
            if stale_to_remove:
                col.delete(ids=stale_to_remove)
                removed = len(stale_to_remove)
    except Exception as e:
        if _is_corruption(e):
            _recover_chromadb()
            col = get_collection(collection_name)
            try:
                current_ids = set(ids)
                all_ids = set(col.get()["ids"])
                stale_ids = all_ids - current_ids
                if stale_ids:
                    stale_to_remove = [
                        sid for sid in stale_ids
                        if any(sid.startswith(d + "/") or sid.startswith(d + "\\") for d in directories)
                    ]
                    if stale_to_remove:
                        col.delete(ids=stale_to_remove)
                        removed = len(stale_to_remove)
            except Exception as e2:
                errors.append(f"清理过期条目失败: {e2}")
        else:
            errors.append(f"清理过期条目失败: {e}")

    logger.info(f"Sync complete: {indexed} indexed, {removed} removed, {skipped_sources} sources skipped, {len(errors)} errors")
    return {
        "indexed": indexed,
        "removed": removed,
        "total": len(ids),
        "errors": errors,
        "skipped_sources": skipped_sources,
    }
