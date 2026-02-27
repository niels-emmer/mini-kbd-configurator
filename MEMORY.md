# Project Memory

## Goal
Build a local macOS HID configurator for MiniKeyboard (3 buttons + knob actions) with FastAPI backend and localhost web UI, without WebHID.

## Constraints
- Python 3.11+
- `hid` package preferred
- FastAPI + Uvicorn
- Localhost UI on `http://localhost:8787`
- Protocol fidelity to `cho45/webhid-mini-keyboard-configurator` `KeyConfigurator.js`

## Source Repositories Used
- https://github.com/cho45/webhid-mini-keyboard-configurator
- https://github.com/emonkey/MiniKeyboard

## Protocol Facts Captured
- VID/PID: `0x1189:0x8890`
- Report-id probe order: `3, 0, 2`
- Probe payload: `00 00 00 00 00 00 00 00`
- 8-byte command payload format
- Key/media/mouse command layouts and flash/LED commands mapped from source
- hidapi write buffer must include leading report-id byte (including `0x00`)

## Design Decisions
- Use path token encoding (`hex:...`) for robust JSON-safe HID paths.
- Maintain single open device with lock-protected manager.
- Validate payload sizes/ranges on backend.
- Keep service local-only by binding to `127.0.0.1`.
- Implement `/api/config` read as shadow-state due no documented readback command in inspected reference JS.
- Add automatic USB interrupt-OUT fallback (`interface 1`, endpoint `0x02`) when hidapi report writes fail on macOS.
- Add one-command launcher `run-mac.sh` to standardize macOS setup/run from Terminal or iTerm.

## Implemented Files
- `backend/hid_device.py`
- `backend/main.py`
- `backend/__init__.py`
- `frontend/index.html`
- `frontend/app.js`
- `frontend/style.css`
- `requirements.txt`
- `run-mac.sh`
- `docs/screenshot.png`
- `media-presets.json`
- `README.md`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`

## Open Risks
- Different device firmware revisions may expose additional readback commands not covered by inspected sources.
- Some macOS setups may require installing native `hidapi` via Homebrew before pip install succeeds.
- macOS may block selected HID interfaces (`privilege violation` / `not permitted`) depending on system permissions and protected usage pages.

## Change Log Snapshot
- 2026-02-27: Complete initial implementation and docs.
- 2026-02-27: Runtime smoke-tested FastAPI startup and API status endpoint in local venv.
- 2026-02-27: Added one-command `run-mac.sh` and polished README with quick-run, screenshot, and local-security notes.
- 2026-02-27: Added `media-presets.json` sample import profile and linked it in README.
- 2026-02-27: Added paced HID report writes and per-key flash commit in `write_config` to improve firmware write stability (notably knob behavior).
- 2026-02-27: Added `PROMPTS.md` documenting project origin, exact first prompt, and reusable project process template.

## Release Notes Snapshot
- v0.1.0 drafted in `RELEASE_NOTES.md`.
- v0.1.1 drafted in `RELEASE_NOTES.md`.
- v0.0.2-beta drafted in `RELEASE_NOTES.md`.
