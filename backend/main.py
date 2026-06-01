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
    yield
    logger.info("Backend shutting down...")


app = FastAPI(title="行业摸底工具 API", lifespan=lifespan)

from backend.routes import scan, search, obsidian, config, discover, embeddings
app.include_router(scan.router)
app.include_router(search.router)
app.include_router(obsidian.router)
app.include_router(config.router)
app.include_router(discover.router)
app.include_router(embeddings.router)

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
