"""Protocol framing tests for backend/hid_device.py.

These assert the exact 8-byte command frames the firmware expects, mirroring the
reference WebHID configurator (`cho45/webhid-mini-keyboard-configurator`).
"""

from __future__ import annotations

import pytest

from backend import hid_device


# --------------------------------------------------------------------- helpers


def test_default_config_shape():
    cfg = hid_device.MiniKeyboardDevice.default_config()
    assert cfg["layer"] == 1
    assert [k["key_num"] for k in cfg["keys"]] == [1, 2, 3, 13, 14, 15]
    assert all(k["type"] == "key" for k in cfg["keys"])
    assert cfg["led_mode"] is None


def test_path_token_roundtrip():
    raw = b"DevSrvsID:4295020042"
    token = hid_device.MiniKeyboardDevice._encode_path(raw)
    assert token == "hex:" + raw.hex()
    assert hid_device.MiniKeyboardDevice._decode_path(token) == raw


def test_decode_path_accepts_bare_hex():
    assert hid_device.MiniKeyboardDevice._decode_path("68656c6c6f") == b"hello"


# ------------------------------------------------------------- send_report guard


def test_send_report_rejects_non_eight_byte_payload(device):
    with pytest.raises(hid_device.ProtocolError):
        device.send_report(3, [0] * 7)
    with pytest.raises(hid_device.ProtocolError):
        device.send_report(3, [0] * 9)


def test_send_report_rejects_out_of_range_byte(device):
    with pytest.raises(hid_device.ProtocolError):
        device.send_report(3, [0] * 7 + [0x100])
    with pytest.raises(hid_device.ProtocolError):
        device.send_report(3, [0] * 7 + [-1])


def test_send_report_prefixes_report_id(device, fake_hid):
    device.send_report(3, [1, 2, 3, 4, 5, 6, 7, 8])
    assert fake_hid.writes[-1] == [3, 1, 2, 3, 4, 5, 6, 7, 8]


# ----------------------------------------------------------------- key commands


def test_set_media_key_frame(device, tx_frames):
    device.set_media_key(1, 1, 0xB6, 0x00)
    frames = tx_frames(device)
    assert frames[0] == [0xA1, 0x01, 0, 0, 0, 0, 0, 0]  # layer select
    assert frames[1] == [1, 0x12, 0xB6, 0x00, 0, 0, 0, 0]


def test_set_single_key_frames(device, tx_frames):
    device.set_single_key(2, 1, 0x02, 0x04)  # Shift + A
    frames = tx_frames(device)
    assert frames[0] == [0xA1, 0x01, 0, 0, 0, 0, 0, 0]
    assert frames[1] == [2, 0x11, 1, 0, 0x02, 0x00, 0, 0]  # modifier-only row
    assert frames[2] == [2, 0x11, 1, 1, 0x02, 0x04, 0, 0]  # modifier + keycode


def test_set_keystroke_multi_stroke_frames(device, tx_frames):
    strokes = [
        {"modifier": 0x02, "keycode": 0x04},
        {"modifier": 0x00, "keycode": 0x05},
    ]
    device.set_keystroke(3, 1, strokes)
    frames = tx_frames(device)
    assert frames[0] == [0xA1, 0x01, 0, 0, 0, 0, 0, 0]
    assert frames[1] == [3, 0x11, 2, 0, 0x02, 0x00, 0, 0]  # header (first modifier)
    assert frames[2] == [3, 0x11, 2, 1, 0x02, 0x04, 0, 0]
    assert frames[3] == [3, 0x11, 2, 2, 0x00, 0x05, 0, 0]


def test_set_keystroke_rejects_empty_and_too_many(device):
    with pytest.raises(hid_device.ProtocolError):
        device.set_keystroke(1, 1, [])
    with pytest.raises(hid_device.ProtocolError):
        device.set_keystroke(1, 1, [{"modifier": 0, "keycode": 0x04}] * 7)


def test_set_mouse_key_frame(device, tx_frames):
    device.set_mouse_key(15, 1, 0x02, 0x00, 0x04)  # right button + Alt
    frames = tx_frames(device)
    assert frames[1] == [15, 0x13, 0x02, 0x00, 0x00, 0x00, 0x00, 0x04]


def test_write_flash_frame(device, tx_frames):
    device.write_flash()
    assert tx_frames(device)[0] == [0xAA, 0xAA, 0, 0, 0, 0, 0, 0]


def test_set_led_sequence(device, tx_frames):
    device.set_led(2)
    assert tx_frames(device) == [
        [0xA1, 0x01, 0, 0, 0, 0, 0, 0],
        [0xB0, 0x18, 0x02, 0, 0, 0, 0, 0],
        [0xAA, 0xA1, 0, 0, 0, 0, 0, 0],
    ]


def test_set_led_rejects_out_of_range_mode(device):
    with pytest.raises(hid_device.ProtocolError):
        device.set_led(3)


# ------------------------------------------------------------- layer encoding


def test_layer_is_encoded_into_key_type(device, tx_frames):
    device.set_media_key(1, 2, 0xB5, 0x00)
    frames = tx_frames(device)
    assert frames[0] == [0xA1, 0x02, 0, 0, 0, 0, 0, 0]
    assert frames[1][1] == 0x22  # (layer 2 << 4) | media type 2


def test_layer_zero_is_promoted_to_one(device, tx_frames):
    device.set_media_key(1, 0, 0xB5, 0x00)
    frames = tx_frames(device)
    assert frames[0] == [0xA1, 0x01, 0, 0, 0, 0, 0, 0]


# ----------------------------------------------------------------- write_config


def test_write_config_writes_keys_commits_and_sets_led(device, tx_frames):
    config = {
        "layer": 1,
        "led_mode": 1,
        "keys": [
            {"key_num": 1, "type": "media", "code1": 0xB6, "code2": 0x00},
            {"key_num": 2, "type": "key", "keystrokes": [{"modifier": 0, "keycode": 0x04}]},
        ],
    }
    result = device.write_config(config)

    assert result["ok"] is True
    assert result["written_keys"] == 2

    frames = tx_frames(device)
    assert [1, 0x12, 0xB6, 0x00, 0, 0, 0, 0] in frames
    assert [2, 0x11, 1, 1, 0x00, 0x04, 0, 0] in frames
    # one flash commit per key
    assert frames.count([0xAA, 0xAA, 0, 0, 0, 0, 0, 0]) == 2
    # LED sequence applied after keys
    assert [0xB0, 0x18, 0x01, 0, 0, 0, 0, 0] in frames

    assert device.read_config()["config"] == config


def test_write_config_rejects_unknown_key_number(device):
    with pytest.raises(hid_device.ProtocolError):
        device.write_config(
            {
                "layer": 1,
                "keys": [{"key_num": 9, "type": "key", "keystrokes": [{"modifier": 0, "keycode": 0x04}]}],
            }
        )


def test_write_config_rejects_unknown_type(device):
    with pytest.raises(hid_device.ProtocolError):
        device.write_config({"layer": 1, "keys": [{"key_num": 1, "type": "macro"}]})


def test_write_config_rejects_non_list_keys(device):
    with pytest.raises(hid_device.ProtocolError):
        device.write_config({"layer": 1, "keys": "nope"})


# ------------------------------------------------------------------- read state


def test_read_config_requires_report_id():
    dev = hid_device.MiniKeyboardDevice()
    with pytest.raises(hid_device.ProtocolError):
        dev.read_config()


def test_read_config_reports_shadow_source(device):
    payload = device.read_config()
    assert payload["supports_device_readback"] is False
    assert payload["source"] == "shadow"
    assert payload["config"] == hid_device.MiniKeyboardDevice.default_config()


# ------------------------------------------------------------- report-id detect


def test_detect_report_id_skips_rejecting_ids(monkeypatch):
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)
    from tests.conftest import FakeHidDevice

    dev = hid_device.MiniKeyboardDevice()
    fake = FakeHidDevice(ok_report_ids={2})
    dev._device = fake
    dev._transport = "hidapi"

    assert dev.detect_report_id() == 2
    # probe order is 3, 0, 2
    assert [w[0] for w in fake.writes] == [2]
    assert dev.report_id == 2


def test_detect_report_id_probes_in_documented_order(monkeypatch):
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)
    from tests.conftest import FakeHidDevice

    dev = hid_device.MiniKeyboardDevice()
    fake = FakeHidDevice(ok_report_ids={3})
    dev._device = fake
    dev._transport = "hidapi"

    assert dev.detect_report_id() == 3
    assert [w[0] for w in fake.writes] == [3]


# ---------------------------------------------------------------- usb transport


def test_usb_transport_pads_to_endpoint_packet_size(monkeypatch):
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)
    from tests.conftest import FakeUsbDevice

    dev = hid_device.MiniKeyboardDevice()
    usb = FakeUsbDevice()
    dev._usb_device = usb
    dev._transport = "usb"
    dev._report_id = 3

    dev.send_report(3, [1, 2, 3, 4, 5, 6, 7, 8])

    endpoint, packet = usb.packets[0]
    assert endpoint == hid_device.USB_OUT_ENDPOINT
    assert len(packet) == hid_device.USB_OUT_PACKET_SIZE
    assert list(packet[:9]) == [3, 1, 2, 3, 4, 5, 6, 7, 8]


def test_open_usb_claims_interface_and_reports_transport(monkeypatch):
    from tests.conftest import FakeUsbBackend, FakeUsbDevice

    backend = FakeUsbBackend(FakeUsbDevice())
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    dev = hid_device.MiniKeyboardDevice()
    info = dev.open_usb()

    assert dev.transport == "usb"
    assert dev.connected is True
    assert info["transport"] == "usb"
    assert backend.claim_calls == [hid_device.USB_CONFIG_INTERFACE]


def test_detect_report_id_falls_back_to_usb(monkeypatch):
    """hidapi rejects every probe -> the probe runs over the USB endpoint."""
    monkeypatch.setattr(hid_device, "REPORT_PACE_DELAY_S", 0.0)
    from tests.conftest import FakeHidDevice, FakeUsbBackend, FakeUsbDevice

    dev = hid_device.MiniKeyboardDevice()
    dev._device = FakeHidDevice(ok_report_ids=set())
    dev._transport = "hidapi"

    usb = FakeUsbDevice()
    backend = FakeUsbBackend(usb)
    monkeypatch.setattr(hid_device, "usb_core", backend)
    monkeypatch.setattr(hid_device, "usb_util", backend)

    assert dev.detect_report_id() == 3
    assert dev.transport == "usb"
    assert usb.packets  # the probe was written over the USB endpoint
    endpoint, _packet = usb.packets[0]
    assert endpoint == hid_device.USB_OUT_ENDPOINT


# ------------------------------------------------------------- enumeration merge


def test_enumerate_merges_duplicate_paths(monkeypatch):
    raw = [
        {
            "path": b"p1",
            "vendor_id": 0x1189,
            "product_id": 0x8890,
            "manufacturer_string": "",
            "product_string": "",
            "serial_number": "",
            "interface_number": 3,
            "usage_page": 1,
            "usage": 1,
        },
        {
            "path": b"p1",
            "vendor_id": 0x1189,
            "product_id": 0x8890,
            "manufacturer_string": "MiniKeyboard",
            "product_string": "MiniKeyboard",
            "serial_number": "abc",
            "interface_number": 3,
            "usage_page": 1,
            "usage": 2,
        },
        {
            "path": b"p2",
            "vendor_id": 0x1189,
            "product_id": 0x8890,
            "manufacturer_string": "",
            "product_string": "",
            "serial_number": "",
            "interface_number": 0,
            "usage_page": 1,
            "usage": 6,
        },
    ]
    monkeypatch.setattr(hid_device.hid, "enumerate", lambda vid, pid: raw)

    devices = hid_device.MiniKeyboardDevice.enumerate()
    assert len(devices) == 2

    merged = next(d for d in devices if d["path_display"] == "p1")
    assert merged["manufacturer"] == "MiniKeyboard"
    assert merged["product"] == "MiniKeyboard"
    assert merged["serial"] == "abc"
    assert merged["interface_numbers"] == [3]
    assert merged["collections"] == [
        {"usage_page": 1, "usage": 1},
        {"usage_page": 1, "usage": 2},
    ]
