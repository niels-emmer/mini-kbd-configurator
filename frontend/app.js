const KEY_DEFINITIONS = [
  { key_num: 1, label: "Button 1" },
  { key_num: 2, label: "Button 2" },
  { key_num: 3, label: "Button 3" },
  { key_num: 13, label: "Knob Left" },
  { key_num: 14, label: "Knob Press" },
  { key_num: 15, label: "Knob Right" },
];

const KEY_CODES = {
  A: 0x04,
  B: 0x05,
  C: 0x06,
  D: 0x07,
  E: 0x08,
  F: 0x09,
  G: 0x0a,
  H: 0x0b,
  I: 0x0c,
  J: 0x0d,
  K: 0x0e,
  L: 0x0f,
  M: 0x10,
  N: 0x11,
  O: 0x12,
  P: 0x13,
  Q: 0x14,
  R: 0x15,
  S: 0x16,
  T: 0x17,
  U: 0x18,
  V: 0x19,
  W: 0x1a,
  X: 0x1b,
  Y: 0x1c,
  Z: 0x1d,
  1: 0x1e,
  2: 0x1f,
  3: 0x20,
  4: 0x21,
  5: 0x22,
  6: 0x23,
  7: 0x24,
  8: 0x25,
  9: 0x26,
  0: 0x27,
  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  "-": 0x2d,
  "=": 0x2e,
  "[": 0x2f,
  "]": 0x30,
  "\\": 0x31,
  ";": 0x33,
  "'": 0x34,
  "`": 0x35,
  ",": 0x36,
  ".": 0x37,
  "/": 0x38,
  F1: 0x3a,
  F2: 0x3b,
  F3: 0x3c,
  F4: 0x3d,
  F5: 0x3e,
  F6: 0x3f,
  F7: 0x40,
  F8: 0x41,
  F9: 0x42,
  F10: 0x43,
  F11: 0x44,
  F12: 0x45,
  Delete: 0x4c,
  Right: 0x4f,
  Left: 0x50,
  Down: 0x51,
  Up: 0x52,
};

const MEDIA_CODES = {
  "Play/Pause": [0xcd, 0x00],
  Next: [0xb5, 0x00],
  Previous: [0xb6, 0x00],
  Stop: [0xb7, 0x00],
  "Volume Up": [0xe9, 0x00],
  "Volume Down": [0xea, 0x00],
  Mute: [0xe2, 0x00],
};

const MOUSE_BUTTONS = {
  left: 0x01,
  right: 0x02,
  middle: 0x04,
};

const MOUSE_WHEEL = {
  "wheel-up": 0x01,
  "wheel-down": 0xff,
};

const state = {
  connected: false,
  reportId: null,
  seenHidEntries: new Set(),
  readbackNoteShown: false,
};

const refs = {
  findDevicesBtn: document.getElementById("findDevicesBtn"),
  deviceSelect: document.getElementById("deviceSelect"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  statusLine: document.getElementById("statusLine"),
  layerInput: document.getElementById("layerInput"),
  ledModeSelect: document.getElementById("ledModeSelect"),
  readConfigBtn: document.getElementById("readConfigBtn"),
  writeConfigBtn: document.getElementById("writeConfigBtn"),
  testBtn: document.getElementById("testBtn"),
  exportProfileBtn: document.getElementById("exportProfileBtn"),
  importProfileBtn: document.getElementById("importProfileBtn"),
  importProfileInput: document.getElementById("importProfileInput"),
  keyCards: document.getElementById("keyCards"),
  logPanel: document.getElementById("logPanel"),
};

function timestamp() {
  return new Date().toLocaleTimeString();
}

function log(message, type = "info") {
  const line = `[${timestamp()}] ${message}`;
  if (type === "error") {
    refs.logPanel.innerHTML += `<span class="error">${escapeHtml(line)}</span>\n`;
  } else if (type === "success") {
    refs.logPanel.innerHTML += `<span class="success">${escapeHtml(line)}</span>\n`;
  } else {
    refs.logPanel.innerHTML += `${escapeHtml(line)}\n`;
  }
  refs.logPanel.scrollTop = refs.logPanel.scrollHeight;
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, { method = "GET", body } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  log(`HTTP ${method} ${path}`);
  if (body !== undefined) {
    log(`payload: ${JSON.stringify(body)}`);
  }

  const res = await fetch(path, init);
  const raw = await res.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!res.ok) {
    const detail = data.detail || data.raw || `HTTP ${res.status}`;
    log(`HTTP ${res.status} ${path} -> ${detail}`, "error");
    throw new Error(detail);
  }

  log(`HTTP ${res.status} ${path} -> OK`, "success");
  if (Array.isArray(data.hid_log)) {
    logHidTail(data.hid_log);
  }
  return data;
}

function logHidTail(hidLog) {
  for (const entry of hidLog.slice(-20)) {
    const key = `${entry.timestamp}|${entry.direction}|${entry.report_id}|${entry.hex}`;
    if (state.seenHidEntries.has(key)) {
      continue;
    }
    state.seenHidEntries.add(key);
    const rid = entry.report_id === null ? "-" : entry.report_id;
    log(`HID ${entry.direction.toUpperCase()} rid=${rid} [${entry.hex}]`);
  }
}

function keyCodeOptionsHtml(selectedValue = 0x04) {
  const entries = Object.entries(KEY_CODES).sort((a, b) => a[0].localeCompare(b[0]));
  const options = entries
    .map(([name, code]) => {
      const selected = Number(selectedValue) === code ? "selected" : "";
      return `<option value="${code}" ${selected}>${name} (0x${code.toString(16).toUpperCase()})</option>`;
    })
    .join("");
  return `<option value="0">-- Select Key --</option>${options}`;
}

function mediaOptionsHtml(selectedName = "") {
  const options = Object.keys(MEDIA_CODES)
    .map((name) => {
      const selected = name === selectedName ? "selected" : "";
      return `<option value="${name}" ${selected}>${name}</option>`;
    })
    .join("");
  return `<option value="">-- Select Media --</option>${options}`;
}

function mouseActionOptionsHtml(selectedValue = "left") {
  const options = ["left", "right", "middle", "wheel-up", "wheel-down"]
    .map((action) => {
      const selected = action === selectedValue ? "selected" : "";
      return `<option value="${action}" ${selected}>${action}</option>`;
    })
    .join("");
  return options;
}

function modifierFromCheckboxes(wrapper, includeWin = true) {
  const ctrl = wrapper.querySelector(".mod-ctrl")?.checked ? 1 : 0;
  const shift = wrapper.querySelector(".mod-shift")?.checked ? 2 : 0;
  const alt = wrapper.querySelector(".mod-alt")?.checked ? 4 : 0;
  const win = includeWin && wrapper.querySelector(".mod-win")?.checked ? 8 : 0;
  return ctrl | shift | alt | win;
}

function setModifierCheckboxes(wrapper, value, includeWin = true) {
  wrapper.querySelector(".mod-ctrl").checked = (value & 1) !== 0;
  wrapper.querySelector(".mod-shift").checked = (value & 2) !== 0;
  wrapper.querySelector(".mod-alt").checked = (value & 4) !== 0;
  if (includeWin) {
    wrapper.querySelector(".mod-win").checked = (value & 8) !== 0;
  }
}

function createStrokeRow(stroke = { modifier: 0, keycode: 0x04 }) {
  const row = document.createElement("div");
  row.className = "stroke-row";
  row.innerHTML = `
    <select class="stroke-keycode">${keyCodeOptionsHtml(stroke.keycode)}</select>
    <label><input class="mod-ctrl" type="checkbox" />Ctrl</label>
    <label><input class="mod-shift" type="checkbox" />Shift</label>
    <label><input class="mod-alt" type="checkbox" />Alt</label>
    <label><input class="mod-win" type="checkbox" />Win</label>
    <button type="button" class="remove-stroke">Remove</button>
  `;
  setModifierCheckboxes(row, Number(stroke.modifier) || 0, true);

  row.querySelector(".remove-stroke").addEventListener("click", () => {
    const container = row.parentElement;
    if (container.children.length > 1) {
      row.remove();
    }
  });

  return row;
}

function renderKeyCards() {
  refs.keyCards.innerHTML = "";

  for (const def of KEY_DEFINITIONS) {
    const card = document.createElement("article");
    card.className = "key-card";
    card.dataset.keyNum = String(def.key_num);
    card.innerHTML = `
      <h3>${def.label} (key ${def.key_num})</h3>
      <div class="card-row">
        <label>Type
          <select class="type-select">
            <option value="key" selected>Key Input</option>
            <option value="media">Media Key</option>
            <option value="mouse">Mouse</option>
          </select>
        </label>
      </div>

      <section class="mode-section mode-key active">
        <div class="stroke-list"></div>
        <button type="button" class="add-stroke">Add Keystroke</button>
      </section>

      <section class="mode-section mode-media">
        <div class="card-row">
          <label>Media
            <select class="media-select">${mediaOptionsHtml()}</select>
          </label>
        </div>
      </section>

      <section class="mode-section mode-mouse">
        <div class="card-row">
          <label>Mouse Action
            <select class="mouse-action">${mouseActionOptionsHtml()}</select>
          </label>
        </div>
        <div class="card-row mouse-modifiers">
          <label><input class="mod-ctrl" type="checkbox" />Ctrl</label>
          <label><input class="mod-shift" type="checkbox" />Shift</label>
          <label><input class="mod-alt" type="checkbox" />Alt</label>
        </div>
      </section>
    `;

    const strokeList = card.querySelector(".stroke-list");
    strokeList.appendChild(createStrokeRow());

    const addStrokeBtn = card.querySelector(".add-stroke");
    addStrokeBtn.addEventListener("click", () => {
      if (strokeList.children.length >= 6) {
        log(`key ${def.key_num}: max 6 keystrokes`, "error");
        return;
      }
      strokeList.appendChild(createStrokeRow());
    });

    const typeSelect = card.querySelector(".type-select");
    typeSelect.addEventListener("change", () => {
      card.querySelectorAll(".mode-section").forEach((el) => el.classList.remove("active"));
      card.querySelector(`.mode-${typeSelect.value}`).classList.add("active");
    });

    refs.keyCards.appendChild(card);
  }
}

function collectConfigFromUi() {
  const layer = Number(refs.layerInput.value || 1);
  if (!Number.isInteger(layer) || layer < 0 || layer > 15) {
    throw new Error("Layer must be an integer between 0 and 15");
  }
  const ledModeRaw = refs.ledModeSelect.value;
  const ledMode = ledModeRaw === "" ? null : Number(ledModeRaw);

  const keys = [];
  const cards = refs.keyCards.querySelectorAll(".key-card");

  for (const card of cards) {
    const keyNum = Number(card.dataset.keyNum);
    const type = card.querySelector(".type-select").value;

    if (type === "key") {
      const strokes = [];
      const rows = card.querySelectorAll(".stroke-row");
      for (const row of rows) {
        const keycode = Number(row.querySelector(".stroke-keycode").value);
        const modifier = modifierFromCheckboxes(row, true);
        if (keycode === 0) {
          continue;
        }
        strokes.push({ modifier, keycode });
      }

      if (strokes.length < 1 || strokes.length > 6) {
        throw new Error(`key ${keyNum}: key type needs 1-6 keystrokes`);
      }

      keys.push({
        key_num: keyNum,
        type: "key",
        keystrokes: strokes,
      });
      continue;
    }

    if (type === "media") {
      const mediaName = card.querySelector(".media-select").value;
      if (!mediaName || !MEDIA_CODES[mediaName]) {
        throw new Error(`key ${keyNum}: select a media key`);
      }
      const [code1, code2] = MEDIA_CODES[mediaName];
      keys.push({
        key_num: keyNum,
        type: "media",
        code1,
        code2,
      });
      continue;
    }

    if (type === "mouse") {
      const action = card.querySelector(".mouse-action").value;
      const mods = card.querySelector(".mouse-modifiers");
      const modifier = modifierFromCheckboxes(mods, false);

      let button = 0;
      let wheel = 0;
      if (action in MOUSE_WHEEL) {
        wheel = MOUSE_WHEEL[action];
      } else {
        button = MOUSE_BUTTONS[action] || 0;
      }

      keys.push({
        key_num: keyNum,
        type: "mouse",
        button,
        wheel,
        modifier,
      });
      continue;
    }

    throw new Error(`key ${keyNum}: unsupported type '${type}'`);
  }

  return {
    layer,
    keys,
    led_mode: ledMode,
  };
}

function applyConfigToUi(config) {
  if (!config || typeof config !== "object") {
    return;
  }

  refs.layerInput.value = String(Number(config.layer || 1));
  refs.ledModeSelect.value = config.led_mode === null || config.led_mode === undefined
    ? ""
    : String(Number(config.led_mode));
  const map = new Map((config.keys || []).map((k) => [Number(k.key_num), k]));

  for (const card of refs.keyCards.querySelectorAll(".key-card")) {
    const keyNum = Number(card.dataset.keyNum);
    const keyConfig = map.get(keyNum);
    if (!keyConfig) {
      continue;
    }

    const typeSelect = card.querySelector(".type-select");
    typeSelect.value = keyConfig.type || "key";
    typeSelect.dispatchEvent(new Event("change"));

    if (typeSelect.value === "key") {
      const strokeList = card.querySelector(".stroke-list");
      strokeList.innerHTML = "";
      const sourceStrokes = Array.isArray(keyConfig.keystrokes) ? keyConfig.keystrokes : [];
      if (sourceStrokes.length === 0) {
        strokeList.appendChild(createStrokeRow());
      } else {
        for (const stroke of sourceStrokes.slice(0, 6)) {
          strokeList.appendChild(createStrokeRow(stroke));
        }
      }
      continue;
    }

    if (typeSelect.value === "media") {
      const mediaSelect = card.querySelector(".media-select");
      const name = Object.keys(MEDIA_CODES).find((k) => {
        const [a, b] = MEDIA_CODES[k];
        return a === Number(keyConfig.code1) && b === Number(keyConfig.code2);
      });
      mediaSelect.value = name || "";
      continue;
    }

    if (typeSelect.value === "mouse") {
      const actionSelect = card.querySelector(".mouse-action");
      if (Number(keyConfig.wheel) === MOUSE_WHEEL["wheel-up"]) {
        actionSelect.value = "wheel-up";
      } else if (Number(keyConfig.wheel) === MOUSE_WHEEL["wheel-down"]) {
        actionSelect.value = "wheel-down";
      } else {
        const action = Object.keys(MOUSE_BUTTONS).find(
          (k) => MOUSE_BUTTONS[k] === Number(keyConfig.button)
        );
        actionSelect.value = action || "left";
      }
      const mods = card.querySelector(".mouse-modifiers");
      setModifierCheckboxes(mods, Number(keyConfig.modifier) || 0, false);
    }
  }
}

function setConnectedStatus(connected, reportId = null) {
  state.connected = connected;
  state.reportId = reportId;
  if (connected) {
    refs.statusLine.textContent = `Connected (Report ID ${reportId})`;
    refs.statusLine.className = "status status-online";
  } else {
    refs.statusLine.textContent = "Disconnected";
    refs.statusLine.className = "status status-offline";
  }
}

async function refreshDevices() {
  const data = await api("/api/devices");
  refs.deviceSelect.innerHTML = "";

  for (const dev of data.devices) {
    const option = document.createElement("option");
    option.value = dev.path;
    const name = dev.product && dev.product.trim() ? dev.product : "MiniKeyboard";
    const mfg = dev.manufacturer && dev.manufacturer.trim() ? dev.manufacturer : "unknown mfg";
    const ifaces = Array.isArray(dev.interface_numbers) ? dev.interface_numbers.join(",") : "?";
    const collections = Array.isArray(dev.collections)
      ? dev.collections.map((c) => `${c.usage_page}:${c.usage}`).join("|")
      : "?";
    option.textContent = `${name} / ${mfg} / if:${ifaces} / col:${collections} / ${dev.path_display}`;
    refs.deviceSelect.appendChild(option);
  }

  if (data.devices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No matching devices found";
    refs.deviceSelect.appendChild(option);
  }

  log(`found ${data.count} matching device(s)`);
}

async function connectDevice() {
  const path = refs.deviceSelect.value;
  if (!path) {
    throw new Error("No device selected");
  }

  const data = await api("/api/connect", { method: "POST", body: { path } });
  setConnectedStatus(true, data.report_id);
}

async function disconnectDevice() {
  await api("/api/disconnect", { method: "POST" });
  setConnectedStatus(false, null);
}

async function readConfig() {
  const data = await api("/api/config");
  applyConfigToUi(data.config);
  if (!data.supports_device_readback && !state.readbackNoteShown) {
    log(`read note: ${data.note}`);
    state.readbackNoteShown = true;
  }
}

async function writeConfig() {
  const config = collectConfigFromUi();
  await api("/api/config", { method: "POST", body: config });
}

function exportProfile() {
  const profile = collectConfigFromUi();
  const payload = JSON.stringify(profile, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const stamp = new Date().toISOString().replaceAll(":", "-");
  link.download = `mini-keyboard-profile-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  log("profile exported", "success");
}

async function importProfileFile(file) {
  if (!file) {
    return;
  }
  const text = await file.text();
  let profile;
  try {
    profile = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON profile file");
  }

  if (!profile || typeof profile !== "object" || !Array.isArray(profile.keys)) {
    throw new Error("Profile format invalid: expected object with keys[]");
  }

  applyConfigToUi(profile);
  log(`profile imported from ${file.name}`, "success");
}

async function testCommand() {
  await api("/api/test", { method: "POST" });
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    setConnectedStatus(Boolean(status.connected), status.report_id);
  } catch (err) {
    log(`status check failed: ${err.message}`, "error");
  }
}

function wireEvents() {
  refs.findDevicesBtn.addEventListener("click", () => wrapUi(refreshDevices));
  refs.connectBtn.addEventListener("click", () => wrapUi(connectDevice));
  refs.disconnectBtn.addEventListener("click", () => wrapUi(disconnectDevice));
  refs.readConfigBtn.addEventListener("click", () => wrapUi(readConfig));
  refs.writeConfigBtn.addEventListener("click", () => wrapUi(writeConfig));
  refs.testBtn.addEventListener("click", () => wrapUi(testCommand));
  refs.exportProfileBtn.addEventListener("click", () => wrapUi(async () => exportProfile()));
  refs.importProfileBtn.addEventListener("click", () => refs.importProfileInput.click());
  refs.importProfileInput.addEventListener("change", () =>
    wrapUi(async () => {
      await importProfileFile(refs.importProfileInput.files?.[0] || null);
      refs.importProfileInput.value = "";
    })
  );
}

async function wrapUi(fn) {
  try {
    setButtonsDisabled(true);
    await fn();
  } catch (err) {
    log(err.message || String(err), "error");
  } finally {
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  refs.findDevicesBtn.disabled = disabled;
  refs.connectBtn.disabled = disabled;
  refs.disconnectBtn.disabled = disabled;
  refs.readConfigBtn.disabled = disabled;
  refs.writeConfigBtn.disabled = disabled;
  refs.testBtn.disabled = disabled;
  refs.exportProfileBtn.disabled = disabled;
  refs.importProfileBtn.disabled = disabled;
}

function init() {
  renderKeyCards();
  wireEvents();
  loadStatus();
  refreshDevices().catch((err) => log(`device scan failed: ${err.message}`, "error"));
  log("UI ready");
}

init();
