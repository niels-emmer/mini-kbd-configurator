import { KEY_CODES, parseRawKeycode } from "../../lib/keys.js";
import { modifierFromCheckboxes, setModifierCheckboxes } from "../../lib/modifiers.js";
import { log } from "../../lib/api.js";

// Sentinel value for the "Other (raw HID code)" dropdown entry.
export const RAW_KEYCODE_OPTION = "raw";

const CATALOG_CODES = new Set(Object.values(KEY_CODES));

function isRawKeycode(selectedValue) {
  const num = Number(selectedValue);
  return Number.isInteger(num) && num > 0 && num <= 0xff && !CATALOG_CODES.has(num);
}

export function keyCodeOptionsHtml(selectedValue = 0x04) {
  const entries = Object.entries(KEY_CODES).sort((a, b) => a[0].localeCompare(b[0]));
  const options = entries
    .map(([name, code]) => {
      const selected = Number(selectedValue) === code ? "selected" : "";
      return `<option value="${code}" ${selected}>${name} (0x${code.toString(16).toUpperCase()})</option>`;
    })
    .join("");
  const rawSelected = isRawKeycode(selectedValue) ? "selected" : "";
  const rawOption = `<option value="${RAW_KEYCODE_OPTION}" ${rawSelected}>Other (raw HID code)…</option>`;
  return `<option value="0">-- Select Key --</option>${options}${rawOption}`;
}

export function createStrokeRow(stroke = { modifier: 0, keycode: 0x04 }) {
  const row = document.createElement("div");
  row.className = "stroke-row";
  row.innerHTML = `
    <select class="stroke-keycode">${keyCodeOptionsHtml(stroke.keycode)}</select>
    <label class="raw-keycode-field" hidden>Raw code
      <input class="stroke-raw-keycode" type="number" min="0" max="255" step="1" placeholder="0-255" />
    </label>
    <label><input class="mod-ctrl" type="checkbox" />Ctrl</label>
    <label><input class="mod-shift" type="checkbox" />Shift</label>
    <label><input class="mod-alt" type="checkbox" />Alt</label>
    <label><input class="mod-win" type="checkbox" />Win</label>
    <button type="button" class="remove-stroke">Remove</button>
  `;
  setModifierCheckboxes(row, Number(stroke.modifier) || 0, true);

  const keycodeSelect = row.querySelector(".stroke-keycode");
  const rawField = row.querySelector(".raw-keycode-field");
  const rawInput = row.querySelector(".stroke-raw-keycode");

  if (keycodeSelect.value === RAW_KEYCODE_OPTION) {
    const seeded = parseRawKeycode(stroke.keycode);
    rawInput.value = seeded !== null ? String(seeded) : "";
  }
  keycodeSelect.addEventListener("change", () => {
    const showRaw = keycodeSelect.value === RAW_KEYCODE_OPTION;
    rawField.hidden = !showRaw;
    if (!showRaw) {
      rawInput.value = "";
    }
  });

  row.querySelector(".remove-stroke").addEventListener("click", () => {
    const container = row.parentElement;
    if (container.children.length > 1) {
      row.remove();
    }
  });

  return row;
}

export function initKeyMode(card, keyNum) {
  const strokeList = card.querySelector(".stroke-list");
  strokeList.appendChild(createStrokeRow());

  const addStrokeBtn = card.querySelector(".add-stroke");
  addStrokeBtn.addEventListener("click", () => {
    if (strokeList.children.length >= 6) {
      log(`key ${keyNum}: max 6 keystrokes`, "error");
      return;
    }
    strokeList.appendChild(createStrokeRow());
  });
}

export function collectKeyMode(card, keyNum) {
  const strokes = [];
  const rows = card.querySelectorAll(".stroke-row");
  for (const row of rows) {
    const keycode = readRowKeycode(row, keyNum);
    const modifier = modifierFromCheckboxes(row, true);
    if (keycode === 0) {
      continue;
    }
    strokes.push({ modifier, keycode });
  }

  if (strokes.length < 1 || strokes.length > 6) {
    throw new Error(`key ${keyNum}: key type needs 1-6 keystrokes`);
  }

  return {
    key_num: keyNum,
    type: "key",
    keystrokes: strokes,
  };
}

function readRowKeycode(row, keyNum) {
  const select = row.querySelector(".stroke-keycode");
  if (select.value !== RAW_KEYCODE_OPTION) {
    return Number(select.value);
  }

  const parsed = parseRawKeycode(row.querySelector(".stroke-raw-keycode").value);
  if (parsed === null) {
    throw new Error(`key ${keyNum}: raw HID code must be an integer 0-255`);
  }
  return parsed;
}

export function applyKeyMode(card, keyConfig) {
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
}
