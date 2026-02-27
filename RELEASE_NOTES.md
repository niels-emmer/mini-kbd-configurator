# Release Notes

## v0.1.1 (2026-02-27)

Documentation and packaging polish for easier local use on macOS.

### Highlights

- Added `run-mac.sh` for one-command local setup and run:
  - checks for Python 3.11+
  - optionally installs Homebrew native HID deps (`hidapi`, `libusb`)
  - bootstraps `.venv` and installs requirements
  - starts the API/UI server and opens `http://localhost:8787`
- Updated `README.md` with:
  - screenshot section
  - `Quick Run On Your Mac` instructions
  - local-only security guidance and exposure warnings
  - project status note (agentically/vibe coded, lightly tested)
- Removed user-specific/private path references from setup docs.

## v0.1.0 (2026-02-27)

Initial working local configurator for MiniKeyboard on macOS.

### Highlights

- Local web UI at `http://localhost:8787` served by FastAPI.
- Direct USB HID communication via `hid` (hidapi), no browser WebHID.
- macOS compatibility fallback to USB interrupt-OUT transport when hidapi report writes are rejected.
- Protocol implementation aligned to `KeyConfigurator.js` reference behavior:
  - Report detection: `3 -> 0 -> 2`
  - 8-byte command payloads
  - Key/media/mouse/flash/LED command framing
- REST API for discovery/connect/config/test operations.
- Built-in diagnostics command for device enumeration and no-op write testing.

### Notes

- Full device config readback command is not documented in inspected reference sources; `GET /api/config` returns explicit in-process shadow state.
