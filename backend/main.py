"""FastAPI server for local MiniKeyboard configuration on macOS."""

from __future__ import annotations

import copy
import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.hid_device import (
    DeviceNotConnectedError,
    MiniKeyboardDevice,
    MiniKeyboardError,
    ProtocolError,
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


class ConnectRequest(BaseModel):
    path: str = Field(..., description="Device path from GET /api/devices")


class ConfigRequest(BaseModel):
    layer: int = 1
    keys: list[dict[str, Any]]
    led_mode: Optional[int] = None


class DeviceManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._device = MiniKeyboardDevice()

    def _hid_log(self, limit: int = 80) -> list[dict[str, Any]]:
        return self._device.get_transactions(limit=limit)

    def list_devices(self) -> Dict[str, Any]:
        devices = MiniKeyboardDevice.enumerate()
        return {
            "ok": True,
            "count": len(devices),
            "devices": devices,
        }

    def connect(self, path: str) -> Dict[str, Any]:
        with self._lock:
            listed = MiniKeyboardDevice.enumerate()
            valid_paths = [entry["path"] for entry in listed]
            if path not in valid_paths:
                raise MiniKeyboardError(
                    "Requested path is not present in current /api/devices results"
                )

            # Try selected path first, then remaining discovered paths as fallback.
            candidates = [path] + [candidate for candidate in valid_paths if candidate != path]
            errors: list[dict[str, str]] = []
            for candidate in candidates:
                try:
                    _ = self._device.open(candidate)
                    report_id = self._device.detect_report_id()
                    info = self._device.get_device_info()
                    return {
                        "ok": True,
                        "connected": True,
                        "report_id": report_id,
                        "device": info,
                        "hid_log": self._hid_log(),
                    }
                except Exception as exc:
                    errors.append({"path": candidate, "error": str(exc)})
                    self._device.close()

            details = json.dumps(errors)
            lowered_errors = [item["error"].lower() for item in errors]
            permission_tokens = ("privilege violation", "not permitted", "permission denied", "not authorized")
            protocol_tokens = ("failed to detect report id", "setreport failed", "iohiddevicesetreport")

            all_permission = bool(lowered_errors) and all(
                any(token in err for token in permission_tokens) for err in lowered_errors
            )
            any_protocol = any(any(token in err for token in protocol_tokens) for err in lowered_errors)

            if all_permission:
                raise MiniKeyboardError(
                    "macOS denied opening all candidate HID interfaces. "
                    f"Details: {details}"
                )

            if any_protocol:
                raise ProtocolError(
                    "Opened at least one HID interface, but config report writes were rejected. "
                    f"Details: {details}"
                )

            raise MiniKeyboardError(
                "Failed to connect to MiniKeyboard on all candidate interfaces. "
                f"Details: {details}"
            )

    def disconnect(self) -> Dict[str, Any]:
        with self._lock:
            self._device.close()
            return {
                "ok": True,
                "connected": False,
            }

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "ok": True,
                "connected": self._device.connected,
                "report_id": self._device.report_id,
                "hid_log": self._hid_log(limit=20),
            }

    def read_config(self) -> Dict[str, Any]:
        with self._lock:
            payload = self._device.read_config()
            return {
                "ok": True,
                **payload,
                "connected": self._device.connected,
                "report_id": self._device.report_id,
                "hid_log": self._hid_log(),
            }

    def write_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            config_copy = copy.deepcopy(config)
            result = self._device.write_config(config_copy)
            return {
                "ok": True,
                "result": result,
                "connected": self._device.connected,
                "report_id": self._device.report_id,
                "hid_log": self._hid_log(),
            }

    def test(self) -> Dict[str, Any]:
        with self._lock:
            result = self._device.test_command()
            return {
                "ok": True,
                "result": result,
                "connected": self._device.connected,
                "report_id": self._device.report_id,
                "hid_log": self._hid_log(),
            }

    def logs(self) -> Dict[str, Any]:
        with self._lock:
            return {"ok": True, "hid_log": self._hid_log(limit=200)}


manager = DeviceManager()
app = FastAPI(title="Mini Keyboard Configurator API")


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/api/devices")
def api_devices() -> Dict[str, Any]:
    return manager.list_devices()


@app.get("/api/status")
def api_status() -> Dict[str, Any]:
    return manager.status()


@app.post("/api/connect")
def api_connect(req: ConnectRequest) -> Dict[str, Any]:
    try:
        return manager.connect(req.path)
    except Exception as exc:
        raise _as_http_error(exc) from exc


@app.post("/api/disconnect")
def api_disconnect() -> Dict[str, Any]:
    try:
        return manager.disconnect()
    except Exception as exc:
        raise _as_http_error(exc) from exc


@app.get("/api/config")
def api_get_config() -> Dict[str, Any]:
    try:
        return manager.read_config()
    except Exception as exc:
        raise _as_http_error(exc) from exc


@app.post("/api/config")
def api_set_config(config: ConfigRequest = Body(...)) -> Dict[str, Any]:
    try:
        return manager.write_config(config.model_dump())
    except Exception as exc:
        raise _as_http_error(exc) from exc


@app.post("/api/test")
def api_test() -> Dict[str, Any]:
    try:
        return manager.test()
    except Exception as exc:
        raise _as_http_error(exc) from exc


@app.get("/api/logs")
def api_logs() -> Dict[str, Any]:
    return manager.logs()


def _as_http_error(exc: Exception) -> HTTPException:
    text = str(exc)

    if isinstance(exc, DeviceNotConnectedError):
        return HTTPException(status_code=400, detail=text)

    if isinstance(exc, ProtocolError):
        return HTTPException(status_code=422, detail=text)

    if isinstance(exc, MiniKeyboardError):
        lowered = text.lower()
        if "permission" in lowered or "denied" in lowered:
            return HTTPException(status_code=403, detail=text)
        if "not present" in lowered or "not found" in lowered:
            return HTTPException(status_code=404, detail=text)
        return HTTPException(status_code=400, detail=text)

    lowered = text.lower()
    # Handle non-wrapped HID backend errors with useful status codes.
    if "privilege violation" in lowered or "not permitted" in lowered or "permission" in lowered:
        return HTTPException(status_code=403, detail=text)
    if "failed to detect report id" in lowered:
        return HTTPException(status_code=422, detail=text)

    return HTTPException(status_code=500, detail=f"Unexpected server error: {text}")
