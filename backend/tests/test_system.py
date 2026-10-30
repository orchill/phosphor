"""System endpoints, settings validation, upload probing."""
from __future__ import annotations

from .conftest import image_bytes, upload_file


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_system_info_reports_deps(client):
    r = client.get("/api/system/info")
    assert r.status_code == 200
    data = r.json()
    assert data["app"]
    assert data["deps"]["pymupdf"] != "not found"
    assert data["deps"]["pypdf"] != "not found"
    assert data["deps"]["pillow"] != "not found"
    assert data["deps"]["ytdlp"]["found"] is True
    assert "127.0.0.1" in data["config"]["host"] or "0.0.0.0" in data["config"]["host"]


def test_settings_roundtrip_and_validation(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    original = r.json()

    # invalid values rejected
    r = client.put("/api/settings", json={"patch": {"port": 99999}})
    assert r.status_code == 400
    r = client.put("/api/settings", json={"patch": {"max_upload_mb": "abc"}})
    assert r.status_code == 400
    r = client.put("/api/settings", json={"patch": {"unknown_key": 1}})
    assert r.status_code == 400

    # valid change applied, then reverted
    r = client.put("/api/settings", json={"patch": {"max_upload_mb": 16}})
    assert r.status_code == 200
    assert r.json()["config"]["max_upload_mb"] == 16
    client.put("/api/settings", json={"patch": {"max_upload_mb": original["max_upload_mb"]}})


def test_upload_probes_pdf_and_images(client):
    import tempfile, pathlib
    from .conftest import make_pdf
    tmp = pathlib.Path(tempfile.mkdtemp())
    pdf = make_pdf(tmp / "ok.pdf", pages=2)
    meta_pdf = upload_file(client, "doc.pdf", pdf.read_bytes())
    assert meta_pdf["kind"] == "pdf"
    assert meta_pdf["pages"] == 2

    meta_img = upload_file(client, "pic.png", image_bytes(color=(0, 255, 0)))
    assert meta_img["kind"] == "image"
    assert meta_img["format"] == "PNG"
    assert meta_img["width"] == 300 and meta_img["height"] == 200

    r = client.post("/api/upload", files=[("files", ("note.txt", b"just text"))])
    assert r.status_code == 415


def test_oversized_upload_rejected(client):
    big = b"\x00" * (9 * 1024 * 1024)  # > 8 MB test limit
    r = client.post("/api/upload", files=[("files", ("big.png", big))])
    assert r.status_code == 413


def test_file_listing_and_delete(client):
    meta = upload_file(client, "deleteme.png", image_bytes(fmt="JPEG", color=(0, 0, 255)))
    files = client.get("/api/files").json()
    assert any(f["id"] == meta["id"] for f in files)
    r = client.delete(f"/api/files/{meta['id']}")
    assert r.status_code == 200
    files_after = client.get("/api/files").json()
    assert not any(f["id"] == meta["id"] for f in files_after)


def test_thumbnails(client):
    import fitz
    from .conftest import make_pdf
    import tempfile, pathlib
    tmp = pathlib.Path(tempfile.mkdtemp())
    pdf = make_pdf(tmp / "thumb.pdf", pages=3)
    meta = upload_file(client, "thumb.pdf", pdf.read_bytes())

    r = client.get(f"/api/file/{meta['id']}/thumbnail")
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/")
    r = client.get(f"/api/pdf/{meta['id']}/page/2/thumbnail?width=160")
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/")
    r = client.get(f"/api/pdf/{meta['id']}/page/99/thumbnail")
    assert r.status_code == 400


def test_config_get_accepts_default():
    """Regression: run.py calls cfg.get("open_browser", True); Config.get
    must accept an optional default (TypeError broke startup, see v1.0.1)."""
    import tempfile, pathlib
    from backend.app.config import Config
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="pms_cfg_get_"))
    cfg = Config(tmp / "config.json")
    assert cfg.get("open_browser", True) in (True, False)   # 3-arg call works
    assert cfg.get("missing_key_xyz", "fallback") == "fallback"
    assert cfg.get("host") == "127.0.0.1"                   # 2-arg call unchanged


def test_config_boolean_validation(client):
    """String booleans are only accepted as explicit 'true'/'false'; anything
    else is rejected instead of silently becoming bool(value) == True."""
    r = client.put("/api/settings", json={"patch": {"open_browser": "yes"}})
    assert r.status_code == 400
    r = client.put("/api/settings", json={"patch": {"open_browser": 1}})
    assert r.status_code == 400
    r = client.put("/api/settings", json={"patch": {"open_browser": "false"}})
    assert r.status_code == 200
    assert r.json()["config"]["open_browser"] is False
    r = client.put("/api/settings", json={"patch": {"open_browser": True}})
    assert r.status_code == 200


def test_config_load_sanitizes_bad_file_values(tmp_path):
    """A hand-edited/corrupted config file must not poison runtime state."""
    import json
    from backend.app.config import Config
    p = tmp_path / "config.json"
    p.write_text(json.dumps({"open_browser": "banana", "cookie_source": "hax",
                             "cookie_browser": "notabrowser",
                             "max_upload_mb": "bogus", "port": "not-a-port"}))
    cfg = Config(p)
    assert cfg.get("open_browser") is False
    assert cfg.get("cookie_source") == "none"
    assert cfg.get("cookie_browser") == ""
    assert cfg.get("max_upload_mb") == 512          # int-clamp fallback default
    assert cfg.get("port") == 8756


def test_config_update_rolls_back_on_save_failure(client, monkeypatch):
    """If persisting fails, the previous configuration stays active."""
    from backend.app.config import get_config
    cfg = get_config()
    original = cfg.get("max_upload_mb")
    from backend.app.utils import atomic_write_text
    def boom(path, text):
        raise OSError("disk full")
    monkeypatch.setattr("backend.app.config.atomic_write_text", boom)
    try:
        r = client.put("/api/settings", json={"patch": {"max_upload_mb": 32}})
        assert r.status_code in (400, 500)
        assert cfg.get("max_upload_mb") == original   # memory untouched
    finally:
        monkeypatch.undo()
    r = client.put("/api/settings", json={"patch": {"max_upload_mb": original}})
    assert r.status_code == 200
