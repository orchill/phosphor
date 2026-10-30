"""Security tests: path traversal, URL validation, invalid inputs."""
from __future__ import annotations

import pathlib
import tempfile

import pytest

from backend.app.security import (ValidationError, validate_media_url,
                                  validate_order, validate_rotation, parse_pages)
from .conftest import make_pdf, upload_file

TMP = pathlib.Path(tempfile.mkdtemp(prefix="pms_sec_"))


# ------------------------------------------------------------- path safety
def test_download_blocks_path_traversal(client):
    assert client.get("/api/download", params={"path": "/etc/passwd"}).status_code == 403
    assert client.get("/api/download", params={"path": "C:/Windows/win.ini"}).status_code == 403
    assert client.get("/api/download", params={"path": "../../etc/shadow"}).status_code == 403
    # an existing file OUTSIDE the output dir must be rejected too
    outside = TMP / "outside.txt"
    outside.write_text("secret")
    assert client.get("/api/download", params={"path": str(outside)}).status_code == 403


def test_download_only_serves_output_dir(client):
    r = client.post("/api/upload", files=[("files", ("t.pdf", b"%PDF-not-really"))])
    assert r.status_code == 415
    # upload dir path must not be downloadable
    from backend.app.config import get_config
    cfg = get_config()
    fake_upload = cfg.uploads_dir / "xyz.bin"
    fake_upload.write_bytes(b"x")
    assert client.get("/api/download", params={"path": str(fake_upload)}).status_code == 403


def test_invalid_file_ids_rejected(client):
    assert client.post("/api/pdf/merge", json={"file_ids": ["nope"]}).status_code in (400, 404, 415, 422)
    assert client.post("/api/pdf/merge", json={"file_ids": []}).status_code in (400, 422)
    assert client.post("/api/pdf/compress",
                       json={"file_id": "../../etc/passwd"}).status_code in (400, 404)
    assert client.post("/api/pdf/pages",
                       json={"file_id": "x", "order": [1]}).status_code in (400, 404)


def test_invalid_page_selections_rejected(client):
    pdf = make_pdf(TMP / "v.pdf", 3, "V")
    meta = upload_file(client, "v.pdf", pdf.read_bytes())
    for payload in (
        {"file_id": meta["id"], "order": [1, 1, 2]},          # duplicate
        {"file_id": meta["id"], "order": [1, 99]},            # out of range
        {"file_id": meta["id"], "order": [0]},                # 1-based only
        {"file_id": meta["id"], "order": [1], "rotate": {"1": 45}},  # invalid degrees
    ):
        r = client.post("/api/pdf/pages", json=payload)
        assert r.status_code == 400, payload


def test_split_validation(client):
    pdf = make_pdf(TMP / "sv.pdf", 3, "V")
    meta = upload_file(client, "sv.pdf", pdf.read_bytes())
    assert client.post("/api/pdf/split", json={
        "file_id": meta["id"], "mode": "extract", "pages": "1-99"}).status_code == 400
    assert client.post("/api/pdf/split", json={
        "file_id": meta["id"], "mode": "ranges", "ranges": "banana"}).status_code == 400
    assert client.post("/api/pdf/split", json={
        "file_id": meta["id"], "mode": "every_n", "every_n": 0}).status_code == 422


# -------------------------------------------------------------- URL safety
@pytest.mark.parametrize("bad", [
    "file:///etc/passwd",
    "ftp://example.com/x",
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://192.168.1.5/video",
    "http://10.0.0.1/video",
    "http://[::1]/x",
    "http://[fd12::1]/x",
    "http://169.254.169.254/latest/meta-data",
    "http://user:pass@example.com/x",
    "javascript:alert(1)",
    "",
])
def test_media_url_validation_blocks_unsafe(bad):
    with pytest.raises(ValidationError):
        validate_media_url(bad)


def test_media_url_validation_accepts_public():
    assert validate_media_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == \
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_media_info_endpoint_rejects_local(client):
    assert client.get("/api/media/info",
                      params={"url": "http://127.0.0.1:9999/x.mp4"}).status_code == 400
    assert client.get("/api/media/info", params={"url": "file:///x"}).status_code == 400


def test_media_download_endpoint_validates_mode(client):
    r = client.post("/api/media/download",
                    json={"url": "https://example.com/v", "mode": "banana"})
    assert r.status_code == 400


def test_media_download_failure_is_reported_as_task_error(client):
    """example.com serves no media -> task must fail with a clear error."""
    r = client.post("/api/media/download",
                    json={"url": "https://example.com/nothing-here.mp4", "mode": "video"})
    if r.status_code in (400, 502):
        return  # offline sandbox: validation or exec failure is still a clean failure
    from .conftest import wait_task
    task = wait_task(client, r.json()["task_id"], timeout=120)
    assert task["status"] == "failed"
    assert task["error"]


# --------------------------------------------------------- helper coverage
def test_parse_pages_util():
    assert parse_pages("1-3,5", 10) == [1, 2, 3, 5]
    assert parse_pages(None, 3) == [1, 2, 3]
    assert parse_pages([2, "1"], 5) == [1, 2]
    with pytest.raises(ValidationError):
        parse_pages("0", 3)
    with pytest.raises(ValidationError):
        parse_pages("2-1x", 3)


def test_validate_helpers():
    assert validate_rotation(90) == 90
    with pytest.raises(ValidationError):
        validate_rotation(45)
    with pytest.raises(ValidationError):
        validate_order([1, 1], 3)


# ------------------------------------------------- request security guard
def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    csp = r.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_docs_pages_get_relaxed_csp(client):
    docs_csp = client.get("/api/docs").headers["content-security-policy"]
    assert "script-src 'self' 'unsafe-inline'" in docs_csp
    app_csp = client.get("/").headers["content-security-policy"]
    assert "script-src 'self'" in app_csp
    assert "default-src 'self'" in app_csp


def test_cross_origin_state_change_blocked(client):
    # Merge with an empty list is normally a 400/404 - a 403 means the
    # request never reached the route because its Origin was rejected.
    for origin in ("https://evil.example", "http://evil.example:8756",
                   "http://testserver.evil.com", "null"):
        r = client.post("/api/pdf/merge", json={"file_ids": []},
                        headers={"Origin": origin})
        assert r.status_code == 403, origin


def test_same_origin_and_dev_origin_allowed(client):
    for origin in ("http://testserver", "http://localhost:5173"):
        r = client.post("/api/pdf/merge", json={"file_ids": []},
                        headers={"Origin": origin})
        assert r.status_code in (400, 422), origin


def test_cross_site_fetch_metadata_blocked(client):
    # No Origin header (img/form style GET) but cross-site fetch metadata.
    assert client.get("/api/files",
                      headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/api/files",
                      headers={"Sec-Fetch-Site": "same-site"}).status_code == 200


def test_host_guard_unit():
    # TestClient/httpx cannot override the Host header, so the guard logic is
    # tested directly. Public-IP Hosts are rejected (port-forwarding footgun);
    # private/loopback IPs and ordinary hostnames keep LAN usage working.
    from backend.app.security import _host_allowed
    assert not _host_allowed("8.8.8.8")                # public IP
    assert not _host_allowed("8.8.8.8:8756")
    assert not _host_allowed("93.184.216.34")
    assert _host_allowed("127.0.0.1:8756")
    assert _host_allowed("localhost:8756")
    assert _host_allowed("192.168.1.10:8756")          # LAN IP literal
    assert _host_allowed("[::1]:8756")                 # IPv6 loopback
    assert _host_allowed("my-machine:8756")            # LAN hostname
    assert _host_allowed("")                           # missing Host (HTTP/1.0)
