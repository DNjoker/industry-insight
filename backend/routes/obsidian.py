import os
from fastapi import APIRouter, HTTPException
from backend.models.schemas import ObsidianWriteRequest, ObsidianWriteResponse
from backend.services.obsidian_writer import atomic_write, build_frontmatter
from backend.config import settings, get_vault_path

router = APIRouter(prefix="/api/obsidian", tags=["obsidian"])


@router.get("/validate")
async def validate_vault():
    vault_path = get_vault_path()
    obsidian_dir = os.path.join(vault_path, ".obsidian")
    if os.path.isdir(obsidian_dir):
        return {"valid": True, "vault_path": vault_path}
    return {"valid": False, "vault_path": vault_path, "detail": ".obsidian folder not found"}


@router.post("/write", response_model=ObsidianWriteResponse)
async def write_note(request: ObsidianWriteRequest):
    vault_path = get_vault_path()

    full_path = os.path.join(vault_path, request.relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)

    if os.path.exists(full_path) and not request.overwrite:
        return ObsidianWriteResponse(
            path=request.relative_path,
            success=False,
            message="File already exists, set overwrite=true to replace"
        )

    fm = build_frontmatter(request.frontmatter)
    content = fm + request.content
    atomic_write(full_path, content)

    return ObsidianWriteResponse(
        path=request.relative_path,
        success=True,
        message="Note written successfully"
    )


@router.get("/notes")
async def list_notes():
    """List all notes in the vault (top-level folders only)."""
    vault_path = get_vault_path()

    notes = []
    for root, dirs, files in os.walk(vault_path):
        # Skip hidden dirs
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.endswith(".md"):
                rel_path = os.path.relpath(os.path.join(root, f), vault_path)
                notes.append(rel_path)
    return {"notes": notes}


@router.get("/read")
async def read_note(relative_path: str):
    """Read a single note from the vault."""
    vault_path = get_vault_path()

    full_path = os.path.join(vault_path, relative_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Note not found")

    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()

    return {"path": relative_path, "content": content}
