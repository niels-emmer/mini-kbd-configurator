# Contributing

Thanks for taking a look. This is a small local-only utility; keep changes
focused and protocol-faithful.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

On macOS the `hid` package loads the system `libhidapi` at import time, so the
native libraries must be present:

```bash
brew install hidapi libusb
```

## Run

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

or use the one-command launcher: `./run-mac.sh`.

## Tests

```bash
python -m pytest
```

The suite uses fake HID/USB handles, so it runs without hardware. It covers:

- 8-byte command framing for key/media/mouse/flash/LED operations
- the config write flow (per-key flash commit, LED sequence, shadow state)
- report-id detection order and the USB interrupt-OUT fallback
- HID enumeration merge behavior
- HTTP API status codes and error mapping

## Guidelines

- **Protocol changes must be derived from the reference implementation**
  (`cho45/webhid-mini-keyboard-configurator`, `KeyConfigurator.js`), not guessed.
  Update `tests/test_hid_device.py` to lock the framing you change.
- Keep the frontend DOM contract intact: `frontend/app.js` depends on specific
  element ids and CSS class names. If you rename one, update both.
- Record architectural decisions in `docs/decision-log.md`.
- Keep the service local-only. Do not add a network-reachable bind or an auth
  bypass; see `SECURITY.md`.
- Prefer the standard library over new dependencies. If you add one, justify it
  in the PR description.
- Keep commits focused and use conventional commit messages
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Verifying against real hardware

CI cannot test the device. Before merging behavior changes, run against a
physical MiniKeyboard:

```bash
python -m backend.hid_device --dump
```

and exercise connect → read → write from the UI.
