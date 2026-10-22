# Security Policy

## Scope and posture

This project is a **local-only utility**. It exists to configure a physically
attached USB HID device (the AliExpress "MiniKeyboard", VID `0x1189` /
PID `0x8890`) from the same machine.

Design choices that follow from that:

- The server binds to `127.0.0.1` only. It is not reachable from the network by
  default.
- There is **no authentication or authorization layer**. Anything that can reach
  the loopback port can read the in-process shadow config and write device
  configuration.
- There is no TLS; the traffic is loopback-only.

**Do not expose this service publicly**, and do not bind it to `0.0.0.0`, put it
behind a reverse proxy, or run it on a shared/multi-user host. Doing so turns a
local utility into an unauthenticated device-configuration endpoint.

## Data handling

- The service reads and writes only HID report frames to the selected device.
- It does not read or transmit files, credentials, or personal data.
- `GET /api/config` returns the last config written **by this process**, not a
  device readback (see `docs/decision-log.md`, ADR-0004).
- No telemetry, analytics, or outbound network calls are made.

## Input validation

The backend validates config payload shape and value ranges before writing:

- Report frames must be exactly 8 bytes with byte values in `0x00`–`0xFF`.
- `key_num` must be one of `1, 2, 3, 13, 14, 15`.
- Keystrokes must be 1–6 entries.
- LED mode must be `0`–`2`.

## Reporting a vulnerability

This is a small local tool maintained on a best-effort basis. If you find a
security issue, please open an issue describing the impact and a minimal
reproduction. Do not include secrets or personal data in the report.
