import { KEY_CODES } from "../../lib/keys.js";
import { modifierFromCheckboxes, setModifierCheckboxes } from "../../lib/modifiers.js";
import { log } from "../../lib/api.js";

export function keyCodeOptionsHtml(selectedValue = 0x04) {
  const entries = Object.entries(KEY_CODES).sort((a, b) => a[0].localeCompare(b[0]));
  const options = entries
    .map(([name, code]) => {
      const selected = Number(selectedValue) === code ? "selected" : "";
      return `<option value="${code}" ${selected}>${name} (0x${code.toString(16).toUpperCase()})</option>`;
    })
    .join("");
  return `<option value="0">-- Select Key --</option>${options}`;
}

export function createStrokeRow(stroke = { modifier: 0, keycode: 0x04 }) {
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

  return {
    key_num: keyNum,
    type: "key",
    keystrokes: strokes,
  };
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
