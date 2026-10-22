"""Shared pytest fixtures for the MiniKeyboard configurator tests.

These tests never touch real hardware. They use a fake HID device that records
every write so protocol framing can be asserted byte-for-byte.
"""

from __future__ import annotations

from typing import Iterable, List, Optional

import pytest

from backend import hid_device


class FakeHidDevice:
    """Minimal stand-in for a `hid.device()` handle.

    Records every write buffer (report-id byte included) so tests can assert the
    exact bytes the protocol layer emits.
    """

    def __init__(self, ok_report_ids: Optional[Iterable[int]] = None) -> None:
        self.writes: List[List[int]] = []
        self.raw_writes: List[bytes] = []
        self.closed = False
        self._ok_report_ids = set(ok_report_ids) if ok_report_ids is not None else None

    def write(self, data) -> int:
        payload = list(data)
        if self._ok_report_ids is not None and payload and payload[0] not in self._ok_report_ids:
            raise OSError(f"iohiddevicesetreport failed for report id {payload[0]}")
        self.writes.append(payload)
        if isinstance(data, (bytes, bytearray)):
            self.raw_writes.append(bytes(data))
        return len(payload)

    def read(self, length: int, timeout_ms: int) -> List[int]:
        return []

    def close(self) -> None:
        self.closed = True


class FakeUsbDevice:
    """Stand-in for a pyusb device using the interrupt-OUT fallback transport."""

    def __init__(self) -> None:
        self.packets: List[tuple] = []

    def write(self, endpoint: int, data: bytes, timeout: int = 0) -> int:
        self.packets.append((endpoint, bytes(data)))
        return len(data)


@pytest.fixture
def fake_hid() -> FakeHidDevice:
    return FakeHidDevice()


@pytest.fixture
def device(monkeypatch, fake_hid) -> hid_device.MiniKeyboardDevice:
    """A MiniKeyboardDevice wired to a fake HID handle with report id 3 detected."""
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)
    monkeypatch.setattr(hid_device, "KEY_COMMIT_DELAY_S", 0.0)
    dev = hid_device.MiniKeyboardDevice()
    dev._device = fake_hid
    dev._transport = "hidapi"
    dev._report_id = 3
    return dev


@pytest.fixture
def tx_frames():
    """Return a helper that extracts the 8-byte payloads of all tx transactions."""

    def _frames(dev: hid_device.MiniKeyboardDevice) -> List[List[int]]:
        return [entry["data"] for entry in dev.get_transactions()]

    return _frames
