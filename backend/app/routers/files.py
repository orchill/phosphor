"""File upload/management: workspace storage, probing, thumbnails, downloads.

Uploads live in <data>/uploads as {id}.bin with a JSON sidecar {id}.json
containing probed metadata. Client-supplied filenames are stored in the
sidecar only and sanitized before reuse - they never touch the filesystem.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path

import fitz
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image, UnidentifiedImageError

from ..config import get_config
from ..security import ValidationError, ensure_within
from ..services import pdf_service
from ..utils import atomic_write_text, new_id, now_iso, sanitize_stem

log = logging.getLogger("pms.files")
router = APIRouter()

MAX_FILES_PER_REQUEST = 24

IMAGE_FORMATS = {"PNG", "JPEG", "WEBP", "GIF", "BMP", "TIFF"}
IMAGE_MIME = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp",
              "GIF": "image/gif", "BMP": "image/bmp", "TIFF": "image/tiff"}


class Sidecar:
    def __init__(self, data: dict):
        self.data = data

    def __getattr__(self, item):
        try:
            return self.data[item]
        except KeyError:
            raise AttributeError(item)


def _sidecar_path(file_id: str) -> Path:
    if not file_id or any(c in file_id for c in "/\\.%"):
        raise HTTPException(400, "Invalid file id")
    return get_config().uploads_dir / f"{file_id}.json"


def get_upload(file_id: str) -> Sidecar:
    path = _sidecar_path(file_id)
    if not path.exists():
        raise HTTPException(404, "File not found (it may have been cleared)")
    try:
        return Sidecar(json.loads(path.read_text(encoding="utf-8")))
    except Exception:
        raise HTTPException(500, "Upload metadata is corrupted")


def _discard(path: Path) -> None:
    """Best-effort delete; on Windows a just-closed handle may lag briefly."""
    for attempt in range(3):
        try:
            path.unlink(missing_ok=True)
            return
        except PermissionError:
            time.sleep(0.05 * (attempt + 1))
        except OSError:
            return


def upload_path(meta: Sidecar) -> Path:
    p = get_config().uploads_dir / f"{meta.data['id']}.bin"
    if not p.exists():
        raise HTTPException(404, "File content is missing")
    return p


# ------------------------------------------------------------------ upload
@router.post("/upload")
async def upload(request: Request, files: list[UploadFile] = File(...)):
    cfg = get_config()
    cfg.ensure_dirs()
    max_bytes = cfg.max_upload_bytes
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(413, f"Too many files in one request (limit {MAX_FILES_PER_REQUEST})")
    declared = request.headers.get("content-length")
    if declared:
        try:
            if int(declared) > max_bytes * (len(files) + 2):
                raise HTTPException(413, f"Request too large (limit {cfg.get('max_upload_mb')} MB)")
        except ValueError:
            pass
    results = []
    for file in files:
        raw_name = file.filename or "upload"
        fid = new_id()
        dest = cfg.uploads_dir / f"{fid}.bin"
        size = 0
        too_big = False
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    too_big = True
                    break
                out.write(chunk)
        if too_big:
            _discard(dest)
            raise HTTPException(413, f"'{raw_name}' exceeds the {cfg.get('max_upload_mb')} MB upload limit")

        # probe content (never trust extensions). filetype="pdf" is required:
        # the stored name is {id}.bin and PyMuPDF sniffs the extension first.
        # It also avoids the Windows handle leak a failed plain open can leave.
        with dest.open("rb") as fh:
            head = fh.read(2048)
        meta: dict
        if head.startswith(b"%PDF-"):
            try:
                doc = fitz.open(str(dest), filetype="pdf")
                pages = doc.page_count
                enc = bool(doc.needs_pass)
                doc.close()
            except Exception:
                _discard(dest)
                raise HTTPException(415, f"'{raw_name}' is not a readable PDF (corrupted?)")
            if enc:
                _discard(dest)
                raise HTTPException(415, f"'{raw_name}' is password-protected")
            meta = {"kind": "pdf", "pages": pages, "format": "PDF"}
        else:
            try:
                with Image.open(dest) as im:
                    im.load()
                    fmt = (im.format or "").upper()
                    width, height = im.size
                    if fmt not in IMAGE_FORMATS:
                        raise UnidentifiedImageError()
            except Exception:
                _discard(dest)
                raise HTTPException(415, f"'{raw_name}' is not a supported image "
                                         f"(PNG, JPEG, WebP, GIF, BMP, TIFF)")
            meta = {"kind": "image", "pages": 1, "format": fmt,
                    "width": width, "height": height}
        meta.update({"id": fid, "name": sanitize_stem(raw_name, 120) or "file",
                     "orig_name": raw_name[:200], "size": size,
                     "ext": Path(raw_name).suffix.lower()[:10],
                     "uploaded_at": now_iso()})
        atomic_write_text(cfg.uploads_dir / f"{fid}.json",
                          json.dumps(meta, ensure_ascii=False))
        results.append(meta)
        log.info("uploaded %s kind=%s size=%d", fid[:8], meta["kind"], size)
    if not results:
        raise HTTPException(400, "No files received")
    return results


# -------------------------------------------------------------- management
@router.get("/files")
async def list_files():
    """List uploads, skipping sidecars whose content (.bin) has vanished -
    half-dead entries must not surface in the UI as phantom files."""
    cfg = get_config()
    out = []
    if cfg.uploads_dir.exists():
        for p in sorted(cfg.uploads_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                meta = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not (cfg.uploads_dir / f"{meta.get('id', '')}.bin").is_file():
                continue
            out.append(meta)
    return out


def _task_using_file(tm, file_id: str) -> bool:
    """True if a queued/running task references this upload (meta.file_ids)."""
    for rec in list(getattr(tm, "tasks", {}).values()):
        if rec.status in ("queued", "running"):
            if file_id in (rec.meta.get("file_ids") or []):
                return True
    return False


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, request: Request):
    cfg = get_config()
    meta = get_upload(file_id)
    if _task_using_file(request.app.state.tm, file_id):
        raise HTTPException(409, "This file is used by a queued or running task "
                                 "- cancel the task first or try again later.")
    (cfg.uploads_dir / f"{meta.data['id']}.bin").unlink(missing_ok=True)
    _sidecar_path(file_id).unlink(missing_ok=True)
    for p in cfg.thumbs_dir.glob(f"{file_id}*"):
        p.unlink(missing_ok=True)
    return {"deleted": file_id}


# -------------------------------------------------------------- previews
@router.get("/file/{file_id}/raw")
async def raw_file(file_id: str):
    meta = get_upload(file_id)
    path = upload_path(meta)
    if meta.data["kind"] == "pdf":
        media = "application/pdf"
    else:
        media = IMAGE_MIME.get(meta.data.get("format", ""), "application/octet-stream")
    return FileResponse(path, media_type=media,
                        filename=meta.data.get("orig_name") or f"{meta.data['name']}",
                        content_disposition_type="inline")


@router.get("/file/{file_id}/thumbnail")
async def file_thumbnail(file_id: str, width: int = 240):
    return await _thumbnail(file_id, 1, width)


def _thumb_response(data: bytes) -> Response:
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


async def _thumbnail(file_id: str, page: int, width: int) -> Response:
    cfg = get_config()
    meta = get_upload(file_id)
    width = max(60, min(640, width))
    cache = cfg.thumbs_dir / f"{file_id}_p{page}_w{width}.jpg"
    if cache.exists():
        try:
            return _thumb_response(cache.read_bytes())
        except OSError:
            pass
    path = upload_path(meta)
    # Rendering happens off the event loop: a cold thumbnail of a large PDF
    # must never stall every other request.
    if meta.data["kind"] == "pdf":
        data = await asyncio.to_thread(pdf_service.render_page_thumbnail, path, page, width)
    else:
        data = await asyncio.to_thread(pdf_service.image_thumbnail, path, width)
    try:
        tmp = cache.with_name(cache.name + ".tmp")
        tmp.write_bytes(data)
        cache.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp, cache)
    except OSError:
        pass  # thumbnail caching is best-effort
    return _thumb_response(data)


# -------------------------------------------------------------- downloads
@router.get("/download")
async def download(path: str):
    """Serve a processed output file. Only paths inside the output directory
    are eligible - everything else is rejected (path traversal protection)."""
    cfg = get_config()
    try:
        resolved = ensure_within(Path(path), cfg.output_dir, "download path")
    except ValidationError as exc:
        raise HTTPException(403, str(exc))
    if not resolved.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(resolved, filename=resolved.name, content_disposition_type="attachment")
