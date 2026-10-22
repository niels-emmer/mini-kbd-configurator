const logPanel = document.getElementById("logPanel");
const seenHidEntries = new Set();

function timestamp() {
  return new Date().toLocaleTimeString();
}

export function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function log(message, type = "info") {
  const line = `[${timestamp()}] ${message}`;
  if (type === "error") {
    logPanel.innerHTML += `<span class="error">${escapeHtml(line)}</span>\n`;
  } else if (type === "success") {
    logPanel.innerHTML += `<span class="success">${escapeHtml(line)}</span>\n`;
  } else {
    logPanel.innerHTML += `${escapeHtml(line)}\n`;
  }
  logPanel.scrollTop = logPanel.scrollHeight;
}

export function logHidTail(hidLog) {
  for (const entry of hidLog.slice(-20)) {
    const key = `${entry.timestamp}|${entry.direction}|${entry.report_id}|${entry.hex}`;
    if (seenHidEntries.has(key)) {
      continue;
    }
    seenHidEntries.add(key);
    const rid = entry.report_id === null ? "-" : entry.report_id;
    log(`HID ${entry.direction.toUpperCase()} rid=${rid} [${entry.hex}]`);
  }
}

export async function api(path, { method = "GET", body } = {}) {
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
