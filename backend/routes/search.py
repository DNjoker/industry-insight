from fastapi import APIRouter, HTTPException
from backend.models.schemas import SearchRequest, SearchResult
from backend.services.web_search import search

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[SearchResult])
async def search_web(request: SearchRequest):
    try:
        results = await search(request.query, request.max_results)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
