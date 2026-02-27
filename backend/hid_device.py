"""HID protocol implementation for the MiniKeyboard (VID 0x1189, PID 0x8890).

Protocol source of truth:
- https://github.com/cho45/webhid-mini-keyboard-configurator/blob/main/KeyConfigurator.js
- https://github.com/emonkey/MiniKeyboard/blob/master/MiniKeyboard48/FormMain.Designer.cs
"""

from __future__ import annotations

import argparse
import copy
import json
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import hid
try:
    import usb.core as usb_core
    import usb.util as usb_util
except Exception:  # pragma: no cover - optional runtime dependency
    usb_core = None  # type: ignore[assignment]
    usb_util = None  # type: ignore[assignment]

VENDOR_ID = 0x1189
PRODUCT_ID = 0x8890
REPORT_ID_CANDIDATES = [3, 0, 2]
KEY_NUMBERS = [1, 2, 3, 13, 14, 15]
MAX_KEYSTROKES = 6
MAX_LOG_ENTRIES = 500
USB_CONFIG_INTERFACE = 1
USB_OUT_ENDPOINT = 0x02
USB_OUT_PACKET_SIZE = 64


class MiniKeyboardError(RuntimeError):
    """Base error type for MiniKeyboard operations."""


class DeviceNotConnectedError(MiniKeyboardError):
    """Raised when no device handle is open."""


class ProtocolError(MiniKeyboardError):
    """Raised when a HID write/read violates expected protocol behavior."""


@dataclass
class HidTransaction:
    timestamp: float
    direction: str
    report_id: Optional[int]
    data: List[int]

    def as_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "direction": self.direction,
            "report_id": self.report_id,
            "data": self.data,
            "hex": " ".join(f"{b:02X}" for b in self.data),
        }


class MiniKeyboardDevice:
    """Single-device HID client for the MiniKeyboard."""

    def __init__(self) -> None:
        self._device: Optional[Any] = None
        self._transport: Optional[str] = None  # "hidapi" | "usb"
        self._usb_device: Optional[Any] = None
        self._usb_interface_claimed = False
        self._path: Optional[bytes] = None
        self._device_info: Optional[Dict[str, Any]] = None
        self._report_id: Optional[int] = None
        self._lock = threading.RLock()
        self._transactions: List[HidTransaction] = []
        self._shadow_config: Dict[str, Any] = self.default_config()

    @staticmethod
    def default_config() -> Dict[str, Any]:
        return {
            "layer": 1,
            "keys": [
                {"key_num": key_num, "type": "key", "keystrokes": []}
                for key_num in KEY_NUMBERS
            ],
            "led_mode": None,
        }

    @property
    def report_id(self) -> Optional[int]:
        return self._report_id

    @property
    def connected(self) -> bool:
        return self._device is not None or self._usb_device is not None

    def get_device_info(self) -> Optional[Dict[str, Any]]:
        if self._device_info is None:
            return None
        snapshot = copy.deepcopy(self._device_info)
        snapshot["transport"] = self._transport
        return snapshot

    @staticmethod
    def _encode_path(path: bytes) -> str:
        return f"hex:{path.hex()}"

    @staticmethod
    def _decode_path(path: str) -> bytes:
        if path.startswith("hex:"):
            return bytes.fromhex(path[4:])
        try:
            return bytes.fromhex(path)
        except ValueError:
            return path.encode("utf-8")

    @staticmethod
    def _path_display(path: bytes) -> str:
        try:
            return path.decode("utf-8", errors="replace")
        except Exception:
            return repr(path)

    @classmethod
    def enumerate_raw(cls) -> List[Dict[str, Any]]:
        devices = hid.enumerate(VENDOR_ID, PRODUCT_ID)
        results: List[Dict[str, Any]] = []
        for dev in devices:
            raw_path = dev.get("path", b"")
            path_bytes = raw_path if isinstance(raw_path, (bytes, bytearray)) else str(raw_path).encode("utf-8")
            results.append(
                {
                    "path": cls._encode_path(bytes(path_bytes)),
                    "path_display": cls._path_display(bytes(path_bytes)),
                    "vendor_id": dev.get("vendor_id"),
                    "product_id": dev.get("product_id"),
                    "manufacturer": dev.get("manufacturer_string"),
                    "product": dev.get("product_string"),
                    "serial": dev.get("serial_number"),
                    "interface_number": dev.get("interface_number"),
                    "usage_page": dev.get("usage_page"),
                    "usage": dev.get("usage"),
                }
            )
        return results

    @classmethod
    def enumerate(cls) -> List[Dict[str, Any]]:
        raw = cls.enumerate_raw()
        merged: Dict[str, Dict[str, Any]] = {}
        for entry in raw:
            key = str(entry["path"])
            current = merged.get(key)
            if current is None:
                current = {
                    "path": entry["path"],
                    "path_display": entry["path_display"],
                    "vendor_id": entry["vendor_id"],
                    "product_id": entry["product_id"],
                    "manufacturer": entry.get("manufacturer") or "",
                    "product": entry.get("product") or "",
                    "serial": entry.get("serial") or "",
                    "interface_numbers": [],
                    "collections": [],
                }
                merged[key] = current

            if not current["manufacturer"] and entry.get("manufacturer"):
                current["manufacturer"] = entry["manufacturer"]
            if not current["product"] and entry.get("product"):
                current["product"] = entry["product"]
            if not current["serial"] and entry.get("serial"):
                current["serial"] = entry["serial"]

            iface = entry.get("interface_number")
            if iface is not None and iface not in current["interface_numbers"]:
                current["interface_numbers"].append(iface)

            collection = {"usage_page": entry.get("usage_page"), "usage": entry.get("usage")}
            if collection not in current["collections"]:
                current["collections"].append(collection)

        results = list(merged.values())
        results.sort(key=lambda d: str(d.get("path_display") or d.get("path")))
        for item in results:
            item["interface_numbers"].sort()
            item["collections"].sort(key=lambda c: (int(c["usage_page"] or 0), int(c["usage"] or 0)))
        return results

    def _append_transaction(self, direction: str, report_id: Optional[int], data: List[int]) -> None:
        self._transactions.append(
            HidTransaction(
                timestamp=time.time(),
                direction=direction,
                report_id=report_id,
                data=list(data),
            )
        )
        if len(self._transactions) > MAX_LOG_ENTRIES:
            del self._transactions[: len(self._transactions) - MAX_LOG_ENTRIES]

    def get_transactions(self, limit: int = 200) -> List[Dict[str, Any]]:
        with self._lock:
            clipped = self._transactions[-max(1, min(limit, MAX_LOG_ENTRIES)) :]
            return [item.as_dict() for item in clipped]

    def clear_transactions(self) -> None:
        with self._lock:
            self._transactions.clear()

    def _require_device(self) -> Any:
        if self._device is None:
            raise DeviceNotConnectedError("Device not connected")
        return self._device

    @staticmethod
    def _new_hid_device(path_bytes: bytes) -> Any:
        # Compatibility across common `hid` package variants:
        # - hidapi style: hid.device().open_path(...)
        # - pyhidapi style: hid.Device(path=...)
        if hasattr(hid, "device"):
            dev = hid.device()
            dev.open_path(path_bytes)
            return dev
        if hasattr(hid, "Device"):
            return hid.Device(path=path_bytes)
        raise MiniKeyboardError("Unsupported hid package API: missing device/Device constructor")

    @staticmethod
    def _usb_available() -> bool:
        return usb_core is not None and usb_util is not None

    def _open_usb_transport(self) -> None:
        if not self._usb_available():
            raise MiniKeyboardError("USB fallback unavailable: install pyusb and libusb")

        device = usb_core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)
        if device is None:
            raise MiniKeyboardError("USB fallback: target VID/PID device not found")

        try:
            # Usually already configured; calling again is safe.
            device.set_configuration()
        except Exception:
            pass

        try:
            usb_util.claim_interface(device, USB_CONFIG_INTERFACE)
            claimed = True
        except Exception as exc:
            raise MiniKeyboardError(f"USB fallback: failed to claim interface {USB_CONFIG_INTERFACE}: {exc}") from exc

        self._usb_device = device
        self._usb_interface_claimed = claimed
        self._transport = "usb"

    def _release_usb_transport(self) -> None:
        if self._usb_device is None:
            return
        try:
            if self._usb_interface_claimed and self._usb_available():
                usb_util.release_interface(self._usb_device, USB_CONFIG_INTERFACE)
        except Exception:
            pass
        try:
            if self._usb_available():
                usb_util.dispose_resources(self._usb_device)
        except Exception:
            pass
        self._usb_device = None
        self._usb_interface_claimed = False

    def open(self, path: str) -> Dict[str, Any]:
        with self._lock:
            self.close()
            path_bytes = self._decode_path(path)
            try:
                device = self._new_hid_device(path_bytes)
            except Exception as exc:
                raise MiniKeyboardError(
                    f"Failed to open HID device at path: {path}: {exc}"
                ) from exc

            self._device = device
            self._transport = "hidapi"
            self._path = path_bytes
            self._report_id = None

            matching = [d for d in self.enumerate() if d["path"] == self._encode_path(path_bytes)]
            self._device_info = matching[0] if matching else {
                "path": self._encode_path(path_bytes),
                "path_display": self._path_display(path_bytes),
                "manufacturer": None,
                "product": None,
                "serial": None,
            }
            self._device_info["transport"] = self._transport
            return copy.deepcopy(self._device_info)

    def close(self) -> None:
        with self._lock:
            if self._device is not None:
                try:
                    self._device.close()
                except Exception:
                    pass
            self._release_usb_transport()
            self._device = None
            self._transport = None
            self._path = None
            self._report_id = None
            self._device_info = None

    def detect_report_id(self) -> int:
        with self._lock:
            if self._device is None and self._usb_device is None:
                raise DeviceNotConnectedError("Device not connected")

            last_error: Optional[Exception] = None
            for report_id in REPORT_ID_CANDIDATES:
                try:
                    # Match the WebHID configurator's probe frame exactly.
                    self.send_report(report_id, [0x00] * 8)
                    self._report_id = report_id
                    return report_id
                except Exception as exc:
                    last_error = exc
                    continue

            # macOS can block hidapi report writes on keyboard collections.
            # Fall back to direct USB interrupt-OUT transport if available.
            if self._transport != "usb":
                try:
                    if self._device is not None:
                        try:
                            self._device.close()
                        except Exception:
                            pass
                        self._device = None
                    self._open_usb_transport()
                    if self._device_info is not None:
                        self._device_info["transport"] = "usb"
                    for report_id in REPORT_ID_CANDIDATES:
                        self.send_report(report_id, [0x00] * 8)
                        self._report_id = report_id
                        return report_id
                except Exception as exc:
                    if last_error is None:
                        last_error = exc
                    else:
                        last_error = ProtocolError(f"{last_error}; usb fallback: {exc}")

            message = "Failed to detect report ID (tried 3, 0, 2)"
            if last_error:
                message = f"{message}: {last_error}"
            raise ProtocolError(message)

    def send_report(self, report_id: int, data8: List[int]) -> int:
        with self._lock:
            if len(data8) != 8:
                raise ProtocolError(f"Expected 8-byte payload, got {len(data8)} bytes")

            for idx, value in enumerate(data8):
                if not isinstance(value, int) or value < 0 or value > 0xFF:
                    raise ProtocolError(f"Invalid byte at index {idx}: {value}")

            if self._transport == "usb":
                if self._usb_device is None:
                    raise DeviceNotConnectedError("USB transport not connected")
                packet = [report_id & 0xFF] + [b & 0xFF for b in data8]
                if len(packet) < USB_OUT_PACKET_SIZE:
                    packet.extend([0x00] * (USB_OUT_PACKET_SIZE - len(packet)))
                try:
                    written = int(self._usb_device.write(USB_OUT_ENDPOINT, bytes(packet), timeout=200))
                except Exception as exc:
                    raise ProtocolError(f"USB write failed for report ID {report_id}: {exc}") from exc
            else:
                device = self._require_device()
                # hidapi expects first byte to be report ID (0x00 for report-id 0 devices).
                write_buffer = [report_id & 0xFF] + [b & 0xFF for b in data8]

                written = None
                write_error: Optional[Exception] = None
                for candidate in (bytes(write_buffer), write_buffer):
                    try:
                        written = int(device.write(candidate))
                        break
                    except TypeError as exc:
                        write_error = exc
                        continue
                    except OSError as exc:
                        raise ProtocolError(f"HID write failed for report ID {report_id}: {exc}") from exc

                if written is None:
                    raise ProtocolError(
                        f"HID write failed for report ID {report_id}: {write_error or 'unsupported write signature'}"
                    )

            self._append_transaction("tx", report_id & 0xFF, list(data8))

            if written <= 0:
                raise ProtocolError(f"HID write returned {written} bytes")
            if self._transport == "usb":
                # USB interrupt OUT usually returns endpoint packet size (64 bytes here).
                return written
            write_buffer = [report_id & 0xFF] + [b & 0xFF for b in data8]
            if written not in (len(write_buffer), len(data8)):
                raise ProtocolError(
                    "HID write length mismatch: "
                    f"wrote {written}, expected {len(write_buffer)} or {len(data8)}"
                )
            return written

    def read_reports(
        self,
        *,
        report_length: int = 64,
        timeout_ms: int = 30,
        max_reports: int = 8,
    ) -> List[List[int]]:
        with self._lock:
            if self._transport == "usb":
                # Config path uses write-only interrupt OUT endpoint; reads are optional.
                return []

            device = self._require_device()
            reports: List[List[int]] = []
            for _ in range(max_reports):
                try:
                    data = device.read(report_length, timeout_ms)
                except OSError as exc:
                    raise ProtocolError(f"HID read failed: {exc}") from exc

                if not data:
                    break

                report = [int(b) & 0xFF for b in data]
                self._append_transaction("rx", None, report)
                reports.append(report)
            return reports

    def _require_report_id(self) -> int:
        if self._report_id is None:
            raise ProtocolError("Report ID is not detected; call detect_report_id() first")
        return self._report_id

    def set_layer_if_needed(self, layer: int) -> None:
        report_id = self._require_report_id()
        if report_id != 0:
            layer_num = 1 if layer == 0 else layer
            self.send_report(report_id, [0xA1, layer_num & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    def _key_type_with_layer(self, layer: int, base_type: int) -> int:
        report_id = self._require_report_id()
        if report_id == 0:
            return base_type
        return ((layer & 0x0F) << 4) | (base_type & 0x0F)

    def set_single_key(self, key_num: int, layer: int, modifier: int, key_code: int) -> None:
        report_id = self._require_report_id()
        self.set_layer_if_needed(layer)
        key_type = self._key_type_with_layer(layer, 0x01)

        # Index 0: modifier only
        self.send_report(report_id, [key_num, key_type, 1, 0, modifier, 0x00, 0x00, 0x00])
        # Index 1: modifier + keycode
        self.send_report(report_id, [key_num, key_type, 1, 1, modifier, key_code, 0x00, 0x00])

    def set_keystroke(self, key_num: int, layer: int, keystrokes: List[Dict[str, int]]) -> None:
        if len(keystrokes) == 0 or len(keystrokes) > MAX_KEYSTROKES:
            raise ProtocolError(f"Keystrokes must be 1-{MAX_KEYSTROKES}")

        report_id = self._require_report_id()
        self.set_layer_if_needed(layer)
        key_type = self._key_type_with_layer(layer, 0x01)

        first_modifier = int(keystrokes[0].get("modifier", 0)) & 0xFF
        # Index 0: first stroke modifier only
        self.send_report(
            report_id,
            [key_num, key_type, len(keystrokes), 0, first_modifier, 0x00, 0x00, 0x00],
        )

        # Index 1..N: each stroke
        for idx, stroke in enumerate(keystrokes):
            modifier = int(stroke.get("modifier", 0)) & 0xFF
            keycode = int(stroke.get("keycode", 0)) & 0xFF
            self.send_report(
                report_id,
                [key_num, key_type, len(keystrokes), idx + 1, modifier, keycode, 0x00, 0x00],
            )

    def set_media_key(self, key_num: int, layer: int, code1: int, code2: int) -> None:
        report_id = self._require_report_id()
        self.set_layer_if_needed(layer)
        key_type = self._key_type_with_layer(layer, 0x02)
        self.send_report(report_id, [key_num, key_type, code1, code2, 0x00, 0x00, 0x00, 0x00])

    def set_mouse_key(self, key_num: int, layer: int, button: int, wheel: int, modifier: int) -> None:
        report_id = self._require_report_id()
        self.set_layer_if_needed(layer)
        key_type = self._key_type_with_layer(layer, 0x03)
        self.send_report(report_id, [key_num, key_type, button, 0x00, 0x00, 0x00, wheel, modifier])

    def write_flash(self) -> None:
        report_id = self._require_report_id()
        self.send_report(report_id, [0xAA, 0xAA, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    def set_led(self, mode: int) -> None:
        report_id = self._require_report_id()
        if mode < 0 or mode > 2:
            raise ProtocolError("LED mode must be 0..2")

        # Match KeyConfigurator.js sequence exactly.
        self.send_report(report_id, [0xA1, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        self.send_report(report_id, [0xB0, 0x18, mode, 0x00, 0x00, 0x00, 0x00, 0x00])
        self.send_report(report_id, [0xAA, 0xA1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    def write_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        report_id = self._require_report_id()
        _ = report_id  # explicit protocol precondition

        layer = int(config.get("layer", 1))
        keys = config.get("keys")
        if not isinstance(keys, list):
            raise ProtocolError("config.keys must be a list")

        for key in keys:
            if not isinstance(key, dict):
                raise ProtocolError("Each config.keys item must be an object")

            key_num = int(key.get("key_num", -1))
            if key_num not in KEY_NUMBERS:
                raise ProtocolError(f"Unsupported key_num {key_num}; expected one of {KEY_NUMBERS}")

            key_type = str(key.get("type", "")).strip().lower()
            if key_type == "key":
                keystrokes = key.get("keystrokes", [])
                if not isinstance(keystrokes, list):
                    raise ProtocolError(f"key_num {key_num}: keystrokes must be a list")
                if len(keystrokes) == 1:
                    stroke = keystrokes[0]
                    self.set_single_key(
                        key_num,
                        layer,
                        int(stroke.get("modifier", 0)),
                        int(stroke.get("keycode", 0)),
                    )
                else:
                    self.set_keystroke(key_num, layer, keystrokes)
            elif key_type == "media":
                self.set_media_key(
                    key_num,
                    layer,
                    int(key.get("code1", 0)),
                    int(key.get("code2", 0)),
                )
            elif key_type == "mouse":
                self.set_mouse_key(
                    key_num,
                    layer,
                    int(key.get("button", 0)),
                    int(key.get("wheel", 0)),
                    int(key.get("modifier", 0)),
                )
            else:
                raise ProtocolError(f"key_num {key_num}: unknown type '{key_type}'")

        self.write_flash()

        if config.get("led_mode") is not None:
            self.set_led(int(config["led_mode"]))

        self._shadow_config = copy.deepcopy(config)
        return {
            "ok": True,
            "report_id": self._report_id,
            "written_keys": len(keys),
            "led_mode": config.get("led_mode"),
        }

    def read_config(self) -> Dict[str, Any]:
        self._require_report_id()
        # The reference WebHID implementation exposes write commands only. We return the
        # latest in-process shadow state and make that explicit to the caller.
        return {
            "supports_device_readback": False,
            "source": "shadow",
            "note": (
                "No documented config read command is present in KeyConfigurator.js; "
                "returning last written config from this process."
            ),
            "config": copy.deepcopy(self._shadow_config),
        }

    def test_command(self) -> Dict[str, Any]:
        report_id = self._require_report_id()
        self.send_report(report_id, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        reports = self.read_reports(timeout_ms=20, max_reports=4)
        return {
            "ok": True,
            "report_id": report_id,
            "rx_reports": reports,
        }


def _diagnostics_dump(path: Optional[str]) -> int:
    dev = MiniKeyboardDevice()
    devices = dev.enumerate()
    print(json.dumps({"devices": devices}, indent=2))

    if not devices:
        print("No matching MiniKeyboard HID devices found.")
        return 1

    paths = [path] if path else [item["path"] for item in devices]
    errors: List[Dict[str, str]] = []

    for target_path in paths:
        print(f"Using device path: {target_path}")
        try:
            info = dev.open(target_path)
            report_id = dev.detect_report_id()
            print(json.dumps({"opened": info, "report_id": report_id}, indent=2))
            test_result = dev.test_command()
            print(json.dumps({"test": test_result}, indent=2))
            return 0
        except Exception as exc:
            errors.append({"path": target_path, "error": str(exc)})
            print(f"Diagnostics failed on {target_path}: {exc}")
        finally:
            dev.close()

    print(json.dumps({"errors": errors}, indent=2))
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniKeyboard HID diagnostics")
    parser.add_argument("--dump", action="store_true", help="List matching devices and send a no-op test command")
    parser.add_argument("--path", help="Device path token from /api/devices (hex:...)")
    args = parser.parse_args()

    if args.dump:
        return _diagnostics_dump(args.path)

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
