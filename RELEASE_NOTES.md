# Release Notes

## v0.0.2-beta (2026-02-27)

Beta update focused on write stability and project transparency docs.

### Highlights

- Improved HID write stability for programmed mappings:
  - Added small pacing delay between report writes.
  - Changed full config write flow to commit each key immediately (`AA AA`) for better firmware compatibility.
- Added `PROMPTS.md` documenting:
  - rough project origin
  - exact initial implementation prompt (verbatim)
  - generalized reusable process for similar agent-built local tools.

### Notes

- This remains a local-only beta utility and should not be exposed publicly.

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
- Added write-stability improvements in HID backend:
  - short pacing delay between report writes
  - per-key flash commit during full profile write for firmware compatibility

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
