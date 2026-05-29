import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings, get_vault_path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Backend starting...")
    if settings.preload_knowledge_base or settings.sync_on_startup:
        logger.info("Preloading knowledge base (embedding model)...")
        import asyncio
        from backend.services.embedding_service import preload_model
        loop = asyncio.get_event_loop()
        # Wait for model to load before anything else touches it
        await loop.run_in_executor(None, preload_model)

    if settings.sync_on_startup:
        logger.info("Auto-syncing vault to knowledge base...")
        from backend.services.embedding_service import sync_vault_to_collection
        loop = asyncio.get_event_loop()
        # Fire-and-forget: sync runs in background, model is already loaded
        loop.run_in_executor(
            None,
            lambda: sync_vault_to_collection(
                ["知识卡片", "行业摸底", "DeepSeek对话"],
                "source_articles_v2",
                exclude_sources=True,
            ),
        )
    yield
    logger.info("Backend shutting down...")


app = FastAPI(title="信息汇总桌面工具 API", lifespan=lifespan)

# Register routes
from backend.routes import scan, search, obsidian, config, embeddings, discover, extract, chat, strategy, selling_point, competitor
app.include_router(scan.router)
app.include_router(search.router)
app.include_router(obsidian.router)
app.include_router(config.router)
app.include_router(embeddings.router)
app.include_router(discover.router)
app.include_router(extract.router)
app.include_router(chat.router)
app.include_router(strategy.router)
app.include_router(selling_point.router)
app.include_router(competitor.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "vault_path": get_vault_path(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=settings.backend_port, reload=True)
