import { KEY_CODES } from "../../lib/keys.js";
import {
  modifierFromCheckboxes,
  normalizeMacroModifiers,
  setModifierCheckboxes,
} from "../../lib/modifiers.js";
import { log } from "../../lib/api.js";

const MACRO_MODIFIER_TOOLTIP =
  "The firmware applies one modifier set per macro: only the first keystroke's modifiers are written.";

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
    <div class="stroke-modifiers">
      <label><input class="mod-ctrl" type="checkbox" />Ctrl</label>
      <label><input class="mod-shift" type="checkbox" />Shift</label>
      <label><input class="mod-alt" type="checkbox" />Alt</label>
      <label><input class="mod-win" type="checkbox" />Win</label>
      <label title="Right Ctrl"><input class="mod-rctrl" type="checkbox" />R-Ctrl</label>
      <label title="Right Shift"><input class="mod-rshift" type="checkbox" />R-Shift</label>
      <label title="Right Alt"><input class="mod-ralt" type="checkbox" />R-Alt</label>
      <label title="Right Win"><input class="mod-rwin" type="checkbox" />R-Win</label>
    </div>
    <button type="button" class="remove-stroke">Remove</button>
  `;
  setModifierCheckboxes(row, Number(stroke.modifier) || 0, true);

  row.querySelector(".stroke-keycode").addEventListener("change", () => {
    syncMacroModifiers(row.parentElement);
  });

  row.querySelector(".remove-stroke").addEventListener("click", () => {
    const container = row.parentElement;
    if (container.children.length > 1) {
      row.remove();
      syncMacroModifiers(container);
    }
  });

  return row;
}

// The firmware only honours the first keystroke's modifiers, so let the user
// edit exactly one modifier set per macro: the first keystroke that produces a
// key. Every other row keeps its checkboxes visible but disabled.
function syncMacroModifiers(strokeList) {
  if (!strokeList) {
    return;
  }
  const rows = Array.from(strokeList.querySelectorAll(".stroke-row"));
  const anchor =
    rows.find((row) => Number(row.querySelector(".stroke-keycode").value) !== 0) || rows[0];

  for (const row of rows) {
    const group = row.querySelector(".stroke-modifiers");
    if (!group) {
      continue;
    }
    const isAnchor = row === anchor;
    group.classList.toggle("stroke-modifiers-inactive", !isAnchor);
    if (isAnchor) {
      group.removeAttribute("title");
    } else {
      group.title = MACRO_MODIFIER_TOOLTIP;
    }
    for (const checkbox of group.querySelectorAll("input")) {
      checkbox.disabled = !isAnchor;
      if (!isAnchor) {
        checkbox.checked = false;
      }
    }
  }
}

export function initKeyMode(card, keyNum) {
  const strokeList = card.querySelector(".stroke-list");
  strokeList.appendChild(createStrokeRow());
  syncMacroModifiers(strokeList);

  const addStrokeBtn = card.querySelector(".add-stroke");
  addStrokeBtn.addEventListener("click", () => {
    if (strokeList.children.length >= 6) {
      log(`key ${keyNum}: max 6 keystrokes`, "error");
      return;
    }
    strokeList.appendChild(createStrokeRow());
    syncMacroModifiers(strokeList);
  });
}

export function collectKeyMode(card, keyNum) {
  const strokes = [];
  const rows = card.querySelectorAll(".stroke-row");
  for (const row of rows) {
    const keycode = Number(row.querySelector(".stroke-keycode").value);
    if (keycode === 0) {
      continue;
    }
    strokes.push({ modifier: modifierFromCheckboxes(row, true), keycode });
  }

  if (strokes.length < 1 || strokes.length > 6) {
    throw new Error(`key ${keyNum}: key type needs 1-6 keystrokes`);
  }

  return {
    key_num: keyNum,
    type: "key",
    keystrokes: normalizeMacroModifiers(strokes),
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
  syncMacroModifiers(strokeList);
}
