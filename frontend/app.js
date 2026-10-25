import { api, log } from "./lib/api.js";
import {
  renderKeyCards,
  collectConfigFromUi,
  applyConfigToUi,
} from "./ui/keycards.js";

const state = {
  connected: false,
  reportId: null,
  readbackNoteShown: false,
};

const refs = {
  findDevicesBtn: document.getElementById("findDevicesBtn"),
  deviceSelect: document.getElementById("deviceSelect"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  statusLine: document.getElementById("statusLine"),
  readConfigBtn: document.getElementById("readConfigBtn"),
  writeConfigBtn: document.getElementById("writeConfigBtn"),
  testBtn: document.getElementById("testBtn"),
  exportProfileBtn: document.getElementById("exportProfileBtn"),
  importProfileBtn: document.getElementById("importProfileBtn"),
  importProfileInput: document.getElementById("importProfileInput"),
};

function setConnectedStatus(connected, reportId = null, transport = null) {
  state.connected = connected;
  state.reportId = reportId;
  if (connected) {
    const via = transport ? ` via ${transport}` : "";
    refs.statusLine.textContent = `Connected${via} (Report ID ${reportId})`;
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
  setConnectedStatus(true, data.report_id, data.transport);
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
    setConnectedStatus(Boolean(status.connected), status.report_id, status.transport);
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
