# Decision Log

Architecture decisions for the MiniKeyboard configurator. Newest decisions are
appended at the end of their section. Each entry records the context, the
decision, and the consequences so future work does not re-litigate settled
choices.

---

## ADR-0001 — Local Python backend instead of browser WebHID

**Date:** 2026-02-27
**Status:** Accepted

**Context.** Browsers only expose the device through WebHID, which requires a
Chromium-based browser, a user gesture, and per-origin permission grants. The
goal was a configurator usable from any local browser (including Safari/Firefox)
without WebHID.

**Decision.** Talk to the USB HID device directly from a local Python process and
expose a REST API plus a static frontend on `http://localhost:8787`.

**Consequences.**
- Works from any browser; no WebHID, no browser permission prompts.
- Requires a local Python runtime and native `hidapi`/`libusb` libraries.
- The service is inherently machine-local, which shapes the security posture
  (see ADR-0005).

---

## ADR-0002 — Protocol fidelity to the reference WebHID configurator

**Date:** 2026-02-27
**Status:** Accepted

**Context.** The device firmware expects a specific command framing. Guessing it
risks silently corrupting the stored key configuration.

**Decision.** Mirror `cho45/webhid-mini-keyboard-configurator`
(`KeyConfigurator.js`) exactly:
- VID/PID `0x1189:0x8890`.
- Report-id detection probe order `3, 0, 2`, probing with an all-zero 8-byte frame.
- 8-byte command payloads for key/media/mouse/flash/LED operations.
- hidapi write buffers include a leading report-id byte (including `0x00` for
  report-id-0 devices).

**Consequences.**
- Framing is asserted byte-for-byte in `tests/test_hid_device.py`.
- Any firmware divergence must be re-derived from the reference source, not
  invented.

---

## ADR-0003 — hidapi primary transport with a USB interrupt-OUT fallback

**Date:** 2026-02-27
**Status:** Accepted

**Context.** On macOS, hidapi report writes are rejected (`privilege violation` /
`not permitted`) for keyboard-collection interfaces.

**Decision.** Try hidapi first; if every report-id probe is rejected, fall back to
a direct pyusb interrupt-OUT write on interface `1`, endpoint `0x02`, padding the
packet to the 64-byte endpoint size.

**Consequences.**
- The configurator works on stock macOS without disabling system protections.
- Two transports exist, so tests cover both write paths.
- The fallback is a compatibility shim, not a replacement protocol.

---

## ADR-0004 — Config readback returns explicit in-process shadow state

**Date:** 2026-02-27
**Status:** Accepted

**Context.** The inspected reference implementation only documents write
commands; no config-read command was found.

**Decision.** `GET /api/config` returns the last config written by this process
and labels it clearly (`supports_device_readback: false`, `source: "shadow"`).

**Consequences.**
- No fabricated readback is presented as device truth.
- The UI surfaces the limitation in the debug log on first read.
- If a readback command is ever documented, this endpoint is the single place to
  change.

---

## ADR-0005 — Local-only bind, no authentication

**Date:** 2026-02-27
**Status:** Accepted

**Context.** The tool exists to configure a physically attached USB device.

**Decision.** Bind Uvicorn to `127.0.0.1` only and ship no auth layer.

**Consequences.**
- Anything that can reach the loopback port can write device config; this is
  acceptable because the device is local and the process is user-owned.
- The README documents that the service must not be exposed publicly. See
  `SECURITY.md`.

---

## ADR-0006 — Refresh: tests, CI, and a UI pass

**Date:** 2026-10-22
**Status:** Accepted

**Context.** The project shipped as a lightly-tested beta with no automated
checks. Verification depended on manual runs against hardware, and the UI was
functional but dated.

**Decision.**
- Add a pytest suite covering protocol framing, the write/read config flow,
  report-id detection, USB fallback, enumeration merge, and the HTTP API. Tests
  use fake HID/USB handles so they never require hardware.
- Add a GitHub Actions CI workflow that installs native HID libraries and runs
  the suite on every push/PR.
- Restyle the frontend (same API and DOM contract) and regenerate
  `docs/screenshot.png`.

**Consequences.**
- Regressions in framing or API error mapping are caught without a device.
- Hardware behavior is still verified manually; CI cannot substitute for a real
  device test.
