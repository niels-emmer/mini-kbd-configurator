"""API surface tests for backend/main.py using FastAPI's TestClient.

The device manager is replaced per test so no real HID handle is opened.
"""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from backend import hid_device, main as backend_main
from tests.conftest import FakeHidDevice, FakeUsbBackend, FakeUsbDevice

_MACOS_DENIED = (
    "unable to open device: hid_open_path: failed to open IOHIDDevice from mach "
    "entry: (0xE00002E2) (iokit/common) not permitted"
)


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
    assert body["transport"] is None


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


# ------------------------------------------------------------- usb fallback


def _one_device(monkeypatch, path: str = "hex:616263") -> None:
    entry = {
        "path": path,
        "path_display": "abc",
        "vendor_id": 0x1189,
        "product_id": 0x8890,
        "manufacturer": "MiniKeyboard",
        "product": "MiniKeyboard",
        "serial": "",
        "interface_numbers": [1],
        "collections": [{"usage_page": 1, "usage": 1}],
    }
    monkeypatch.setattr(
        hid_device.MiniKeyboardDevice,
        "enumerate",
        classmethod(lambda cls: [dict(entry)]),
    )


def _deny_hidapi(monkeypatch) -> None:
    def deny(self, candidate):
        raise hid_device.MiniKeyboardError(_MACOS_DENIED)

    monkeypatch.setattr(hid_device.MiniKeyboardDevice, "open", deny)


def test_connect_falls_back_to_usb_when_hidapi_denied(client, monkeypatch):
    """(a) all hidapi opens denied -> USB transport used, response says "usb"."""
    path = "hex:616263"
    _one_device(monkeypatch, path)
    _deny_hidapi(monkeypatch)
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)

    usb = FakeUsbDevice()
    backend = FakeUsbBackend(usb)
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    res = client.post("/api/connect", json={"path": path})

    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is True
    assert body["transport"] == "usb"
    assert body["report_id"] == 3
    assert body["device"]["transport"] == "usb"
    assert backend.claim_calls == [hid_device.USB_CONFIG_INTERFACE]
    assert usb.packets  # probe reports were written over the USB endpoint

    # /api/status must surface the active transport too.
    assert client.get("/api/status").json()["transport"] == "usb"


def test_connect_uses_hidapi_without_touching_pyusb(client, monkeypatch):
    """(b) a working hidapi open must not consult pyusb at all."""
    path = "hex:616263"
    _one_device(monkeypatch, path)
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)

    fake = FakeHidDevice()
    monkeypatch.setattr(
        hid_device.MiniKeyboardDevice, "_new_hid_device", staticmethod(lambda p: fake)
    )

    backend = FakeUsbBackend(FakeUsbDevice())
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    res = client.post("/api/connect", json={"path": path})

    assert res.status_code == 200
    body = res.json()
    assert body["transport"] == "hidapi"
    assert body["report_id"] == 3
    assert fake.writes  # hidapi path was used
    assert backend.find_calls == 0  # pyusb never consulted


def test_connect_permission_denied_maps_to_403_with_hint(client, monkeypatch):
    """(c) all transports denied -> 403 carrying the Input Monitoring hint."""
    path = "hex:616263"
    _one_device(monkeypatch, path)
    _deny_hidapi(monkeypatch)

    # USB fallback also fails to find the device, so every transport fails.
    backend = FakeUsbBackend(None)
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    res = client.post("/api/connect", json={"path": path})

    assert res.status_code == 403
    detail = res.json()["detail"]
    assert "System Settings > Privacy & Security > Input Monitoring" in detail
    assert "hex:616263" in detail  # per-candidate errors returned as JSON
    assert backend.find_calls == 1  # the USB fallback was attempted


def test_connect_protocol_failure_maps_to_422(client, monkeypatch):
    """(c) hidapi opens but report writes are rejected -> 422."""
    path = "hex:616263"
    _one_device(monkeypatch, path)
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)

    # hidapi opens, but every report-id probe is rejected.
    fake = FakeHidDevice(ok_report_ids=set())
    monkeypatch.setattr(
        hid_device.MiniKeyboardDevice, "_new_hid_device", staticmethod(lambda p: fake)
    )

    backend = FakeUsbBackend(None)
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    res = client.post("/api/connect", json={"path": path})

    assert res.status_code == 422
    assert "detect report id" in res.json()["detail"].lower()
