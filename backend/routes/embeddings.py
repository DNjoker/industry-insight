from fastapi import APIRouter, HTTPException
from backend.services.embedding_service import get_collection, get_embedding, list_collections, sync_vault_to_collection
from backend.models.schemas import EmbeddingSyncRequest

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


@router.get("/status")
async def embedding_status():
    try:
        col = get_collection()
        count = col.count()
        return {"loaded": True, "document_count": count}
    except Exception as e:
        return {"loaded": False, "error": str(e)}


@router.post("/search")
async def search_similar(query: str, n_results: int = 5):
    try:
        from backend.services.embedding_service import search
        results = search(query, n_results)
        return {
            "ids": results.get("ids", [[]])[0],
            "documents": results.get("documents", [[]])[0],
            "metadatas": results.get("metadatas", [[]])[0],
            "distances": results.get("distances", [[]])[0],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/encode")
async def encode_text(text: str):
    try:
        vector = get_embedding(text)
        return {"vector": vector, "dimensions": len(vector)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collections")
async def get_collections():
    """List all available ChromaDB collections."""
    try:
        collections = list_collections()
        return {"collections": collections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_embeddings(request: EmbeddingSyncRequest):
    """Sync markdown files from vault directories into ChromaDB."""
    try:
        result = sync_vault_to_collection(
            directories=request.directories,
            collection_name=request.collection_name,
            exclude_sources=request.exclude_sources,
        )
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
