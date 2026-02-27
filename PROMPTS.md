# PROMPTS.md

## How This Project Started (Roughly)

This project started from a single, high-constraint implementation prompt: local-only, protocol-accurate, macOS-focused, and fully runnable for a real USB HID device.  

What made it workable was not just code generation, but an iterative loop:

1. Start with strict technical constraints and concrete deliverables.
2. Build a thin end-to-end version quickly.
3. Test on real hardware.
4. Use user feedback to fix actual behavior and UX issues.
5. Add packaging/docs so others can run it with one command.

That same loop works for many agent-built projects, even when the product idea is different.

## Exact First Prompt (Verbatim)

```text
You are building a working macOS solution to configure the AliExpress “MiniKeyboard” (3 buttons + 1 knob) referenced in https://github.com/emonkey/MiniKeyboard and the protocol used by https://github.com/cho45/webhid-mini-keyboard-configurator .

Goal:
- Do NOT use WebHID in the browser.
- Build a local macOS program that talks to the USB HID device directly, and exposes a local web UI usable from Safari/Chrome/Firefox.
- The UI runs at http://localhost:8787 and calls a local REST API.
- It must work when the device is plugged into the same Mac.

Tech choices:
- Use Python 3.11+.
- Use hidapi via the python package `hid` (preferred) or `hidapi` if needed.
- Use FastAPI + Uvicorn for the HTTP server.
- Serve a minimal static frontend (HTML + vanilla JS) from the same server (no React required).
- Package/run instructions must work with a standard venv on macOS.

Overal guardrails:
- Setup your own memory system before proceeding
- Keep enough information to push your work to github, incl. change and release notes
- Note this project is agenticly built and give credit to all repositories used in your work
- Although this project will not be public (internet) facing, keep security in mind in all decisions

Hard requirement:
- Reproduce the exact device protocol used by the webhid configurator:
  - Vendor ID: 0x1189
  - Product ID: 0x8890
  - Implement the same “detect report ID” behavior and the same 8-byte command frames used in KeyConfigurator.js (from the repo).
  - The device expects HID “report” writes similar to WebHID’s sendReport(reportId, data).
- You must fetch and inspect the reference repo’s KeyConfigurator.js and any related files locally via git (assume I can run git and pip).
- Base all HID report formats, command IDs, and payload layouts on that source. Do not guess.
- If macOS requires a leading 0x00 report-id byte in the write buffer for hidapi, handle it correctly.

Deliverables:
1) A repo-like folder layout with:
   - backend/main.py (FastAPI app)
   - backend/hid_device.py (HID protocol implementation)
   - frontend/index.html, frontend/app.js, frontend/style.css
   - requirements.txt
   - README.md with step-by-step instructions (create venv, install deps, run server, troubleshoot permissions)
2) REST API endpoints:
   - GET /api/devices -> list matching HID devices (path, manufacturer, product, serial if present)
   - POST /api/connect { "path": "..."} -> open device and keep handle (single device is fine)
   - POST /api/disconnect -> close handle
   - GET /api/config -> read current config from device (based on protocol)
   - POST /api/config -> write a full config to device (based on protocol)
   - POST /api/test -> send a test command (e.g., blink or no-op if available) for debugging
3) Frontend features:
   - “Find device” button -> calls /api/devices
   - “Connect” dropdown
   - Shows whether connected
   - “Read config” button
   - Form to edit each of the 3 buttons + knob action (whatever the protocol supports, derived from the reference code)
   - “Write config” button
   - Debug log panel showing requests/responses and HID transactions
4) Robustness:
   - Clear error messages if device not found, permission denied, or protocol mismatch.
   - Timeouts and retries consistent with the reference behavior.
   - Single-thread safety (FastAPI dependency or global with a lock is fine).

Work plan:
- Step 1: Clone the reference repo https://github.com/cho45/webhid-mini-keyboard-configurator into a temp folder and identify the protocol details in KeyConfigurator.js (report IDs, command bytes, config structure).
- Step 2: Implement hid_device.py with:
   - enumerate()
   - open(path)
   - close()
   - detect_report_id()
   - send_report(report_id, data8)
   - read_reports if needed (based on reference)
   - read_config(), write_config(cfg)
- Step 3: Implement FastAPI endpoints and static file serving.
- Step 4: Implement minimal frontend.

Constraints:
- Do not propose using Edge/WebHID.
- Do not propose VPS/remote USB.
- Build for local macOS only.
- Provide code in full (not pseudocode), ready to run.
- If you encounter ambiguity in protocol, add a “Protocol Notes” section in README describing exactly what you observed in the reference code and how you mapped it.
- Add a small “diagnostics” command in backend (e.g., `python -m backend.hid_device --dump`) that prints device info and tests a no-op write.

Start now by:
- Writing the folder structure, requirements.txt, and README skeleton.
- Then implement the HID protocol based strictly on the reference JS.
- Then implement the API and frontend.
- At each major step, show the exact file contents.
```

## Generalized Process You Can Reuse (For Different Ideas)

Use this as a template when building a different local tool with an AI coding agent.

### 1) Write a Constraint-First Prompt

- Define platform (`macOS`, `Linux`, etc.).
- Define runtime stack (language, framework, key libraries).
- Define non-negotiables (for example: no cloud services, no browser hardware APIs, local-only bind).
- Define exact deliverables (file tree, endpoints, CLI commands, docs).

### 2) Name a Source of Truth

- Point to official docs or reference repos.
- Require protocol/format implementation from those sources.
- Explicitly say “do not guess” when compatibility matters.

### 3) Force an End-to-End Vertical Slice Early

- Get a basic running app quickly.
- Ensure there is one user path that fully works (start app -> perform core action -> see result).
- Delay visual polish until that path is stable.

### 4) Add Diagnostics Before Feature Growth

- Add a local `--dump` or health command.
- Log transport-level events.
- Return actionable API errors.

This shortens debug loops dramatically once real users test.

### 5) Test on Real Target Environment

- Emulators and unit tests are useful, but hardware/software edge cases appear only in real usage.
- Keep testing loops short: small change -> run -> test on device -> observe.

### 6) Package for One-Command Run

- Add a launcher script that:
  - checks dependencies
  - creates/uses a venv
  - installs requirements
  - starts service
  - opens local UI
- This is the biggest adoption win for casual users.

### 7) Document Operational Reality

- Add clear setup and troubleshooting sections.
- Include security posture (especially local-only assumptions).
- State testing maturity honestly.
- Include credits for upstream references.

### 8) Keep Build Memory and Release Artifacts

- Maintain:
  - `MEMORY.md` for decisions and risks
  - `CHANGELOG.md` for chronological changes
  - `RELEASE_NOTES.md` for human-facing summary
- This makes handoffs and future iteration far easier.

### 9) Publish with Good Defaults

- Provide:
  - screenshot of real current UI
  - sample import/export data
  - quick-run instructions
- Remove private paths and personal machine references from docs.

### 10) Expect Post-Launch Behavior Fixes

- Initial versions often work functionally but need tuning (timing, retries, UX edge cases).
- Plan to iterate based on observed behavior, not assumptions.

## Reusable Prompt Skeleton (Copy/Paste)

```text
Build a local-only [platform] tool for [problem].

Goals:
- [goal 1]
- [goal 2]

Tech:
- [language/runtime]
- [framework]
- [libraries]

Hard requirements:
- Implement behavior from [source-of-truth docs/repos], do not guess.
- Provide [exact file layout].
- Provide [exact API/CLI].
- Include [diagnostics command].

Operational constraints:
- Local-only bind.
- Security considerations documented.
- One-command run script.

Deliverables:
1) [files]
2) [endpoints]
3) [frontend/UX]
4) [robustness/error handling]

Workflow:
1) Inspect sources and extract protocol/spec.
2) Implement transport/protocol module.
3) Implement API and minimal UI.
4) Add diagnostics, packaging, and docs.
5) Validate on target environment.
```
