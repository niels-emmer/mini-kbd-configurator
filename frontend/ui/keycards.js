import { KEY_DEFINITIONS } from "../lib/keys.js";
import { readLayerFromUi, writeLayerToUi } from "../lib/layers.js";
import { mediaOptionsHtml, collectMediaMode, applyMediaMode } from "./modes/media.js";
import { mouseActionOptionsHtml, collectMouseMode, applyMouseMode } from "./modes/mouse.js";
import { initKeyMode, collectKeyMode, applyKeyMode } from "./modes/key.js";

const keyCards = document.getElementById("keyCards");
const layerInput = document.getElementById("layerInput");
const ledModeSelect = document.getElementById("ledModeSelect");

export function renderKeyCards() {
  keyCards.innerHTML = "";

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

    initKeyMode(card, def.key_num);

    const typeSelect = card.querySelector(".type-select");
    typeSelect.addEventListener("change", () => {
      card.querySelectorAll(".mode-section").forEach((el) => el.classList.remove("active"));
      card.querySelector(`.mode-${typeSelect.value}`).classList.add("active");
    });

    keyCards.appendChild(card);
  }
}

export function collectConfigFromUi() {
  const layer = readLayerFromUi(layerInput);
  const ledModeRaw = ledModeSelect.value;
  const ledMode = ledModeRaw === "" ? null : Number(ledModeRaw);

  const keys = [];
  const cards = keyCards.querySelectorAll(".key-card");

  for (const card of cards) {
    const keyNum = Number(card.dataset.keyNum);
    const type = card.querySelector(".type-select").value;

    if (type === "key") {
      keys.push(collectKeyMode(card, keyNum));
      continue;
    }

    if (type === "media") {
      keys.push(collectMediaMode(card, keyNum));
      continue;
    }

    if (type === "mouse") {
      keys.push(collectMouseMode(card, keyNum));
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

export function applyConfigToUi(config) {
  if (!config || typeof config !== "object") {
    return;
  }

  writeLayerToUi(layerInput, config.layer);
  ledModeSelect.value = config.led_mode === null || config.led_mode === undefined
    ? ""
    : String(Number(config.led_mode));
  const map = new Map((config.keys || []).map((k) => [Number(k.key_num), k]));

  for (const card of keyCards.querySelectorAll(".key-card")) {
    const keyNum = Number(card.dataset.keyNum);
    const keyConfig = map.get(keyNum);
    if (!keyConfig) {
      continue;
    }

    const typeSelect = card.querySelector(".type-select");
    typeSelect.value = keyConfig.type || "key";
    typeSelect.dispatchEvent(new Event("change"));

    if (typeSelect.value === "key") {
      applyKeyMode(card, keyConfig);
      continue;
    }

    if (typeSelect.value === "media") {
      applyMediaMode(card, keyConfig);
      continue;
    }

    if (typeSelect.value === "mouse") {
      applyMouseMode(card, keyConfig);
    }
  }
}
