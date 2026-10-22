"""API surface tests for backend/main.py using FastAPI's TestClient.

The device manager is replaced per test so no real HID handle is opened.
"""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from backend import hid_device, main as backend_main


@pytest.fixture
def client(monkeypatch) -> TestClient:
    # Fresh manager per test so connection state does not leak between tests.
    monkeypatch.setattr(backend_main, "manager", backend_main.DeviceManager())
    return TestClient(backend_main.app)


def _no_devices(monkeypatch) -> None:
    monkeypatch.setattr(
        hid_device.MiniKeyboardDevice,
        "enumerate",
        classmethod(lambda cls: []),
    )


# ------------------------------------------------------------------- static UI


def test_root_serves_index(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Mini Keyboard Configurator" in res.text


def test_assets_serve_frontend_files(client):
    css = client.get("/assets/style.css")
    assert css.status_code == 200
    assert ".key-card" in css.text

    js = client.get("/assets/app.js")
    assert js.status_code == 200
    assert "renderKeyCards" in js.text

    # app.js is split into ES modules; every one must be reachable so the
    # browser's module graph resolves (a bad import path 404s and breaks the UI).
    modules = (
        "lib/keys.js",
        "lib/modifiers.js",
        "lib/api.js",
        "lib/layers.js",
        "ui/keycards.js",
        "ui/modes/key.js",
        "ui/modes/media.js",
        "ui/modes/mouse.js",
    )
    for module in modules:
        res = client.get(f"/assets/{module}")
        assert res.status_code == 200, module


def test_frontend_module_imports_resolve():
    """Every relative import in the frontend ES modules must resolve to a real file.

    ``app.js`` is split into ES modules, so a wrong relative path 404s at runtime
    and silently leaves the UI unrendered. Guard the whole module graph here.
    """
    pattern = re.compile(r"""import\s+(?:[^'"]*?\s+from\s+)?["'](\.[^"']+)["']""")
    checked = 0
    for path in sorted(backend_main.FRONTEND_DIR.rglob("*.js")):
        source = path.read_text(encoding="utf-8")
        for specifier in pattern.findall(source):
            checked += 1
            target = (path.parent / specifier).resolve()
            assert target.is_file(), f"{path.name} imports missing {specifier}"

    # Guard against the pattern silently matching nothing.
    assert checked >= 8


def test_openapi_schema_is_available(client):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json()["paths"]
    for path in ("/api/devices", "/api/connect", "/api/config", "/api/test"):
        assert path in paths


# ------------------------------------------------------------------- status/log


def test_status_defaults_to_disconnected(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["connected"] is False
    assert body["report_id"] is None


def test_logs_endpoint_returns_empty_log(client):
    res = client.get("/api/logs")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "hid_log": []}


def test_devices_lists_nothing_when_absent(client, monkeypatch):
    _no_devices(monkeypatch)
    res = client.get("/api/devices")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "count": 0, "devices": []}


# ------------------------------------------------------------------- connect


def test_connect_requires_path_field(client):
    res = client.post("/api/connect", json={})
    assert res.status_code == 422


def test_connect_rejects_path_not_present(client, monkeypatch):
    _no_devices(monkeypatch)
    res = client.post("/api/connect", json={"path": "hex:00"})
    assert res.status_code == 404
    assert "not present" in res.json()["detail"]


def test_disconnect_is_idempotent(client):
    res = client.post("/api/disconnect")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "connected": False}


# ------------------------------------------------------------------- config


def test_get_config_requires_connection(client):
    res = client.get("/api/config")
    assert res.status_code == 422


def test_post_config_requires_connection(client):
    res = client.post("/api/config", json={"layer": 1, "keys": []})
    assert res.status_code == 422


def test_post_config_validates_body_shape(client):
    res = client.post("/api/config", json={"layer": 1})
    assert res.status_code == 422


def test_test_command_requires_connection(client):
    res = client.post("/api/test")
    assert res.status_code == 422


# --------------------------------------------------------------- error mapping


def test_error_mapping_status_codes():
    mapping = [
        (hid_device.DeviceNotConnectedError("x"), 400),
        (hid_device.ProtocolError("x"), 422),
        (hid_device.MiniKeyboardError("permission denied"), 403),
        (hid_device.MiniKeyboardError("device not found"), 404),
        (hid_device.MiniKeyboardError("something else"), 400),
        (RuntimeError("privilege violation"), 403),
        (RuntimeError("failed to detect report id"), 422),
        (RuntimeError("totally unexpected"), 500),
    ]
    for exc, expected in mapping:
        assert backend_main._as_http_error(exc).status_code == expected
