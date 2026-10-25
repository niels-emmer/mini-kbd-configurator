/**
 * Layer helpers for the MiniKeyboard configurator.
 *
 * The device stores three configuration slots ("layers"). Which slot the keys
 * actually use is selected on the device itself with its physical side button;
 * the page can only choose the slot it reads, writes and exports. Because the
 * side button is invisible in the UI, `index.html` spells it out next to the
 * field -- this module keeps that field honest.
 *
 * Only slots 1..3 exist, so anything else is rejected with a message that is
 * shown next to the field *and* thrown, so the caller aborts the write/export
 * instead of sending a bogus layer.
 */

export const MIN_LAYER = 1;
export const MAX_LAYER = 3;

const LAYER_STATUS_ID = "layerStatus";

function setLayerStatus(message) {
  if (typeof document === "undefined") {
    return;
  }
  const status = document.getElementById(LAYER_STATUS_ID);
  if (status) {
    status.textContent = message;
  }
}

function outOfRangeMessage(rawValue) {
  const shown = String(rawValue ?? "").trim();
  return `Layer must be 1, 2 or 3 (got ${shown === "" ? "an empty value" : `"${shown}"`}).`;
}

export function readLayerFromUi(layerInput) {
  const rawValue = layerInput.value;
  const layer = String(rawValue).trim() === "" ? NaN : Number(rawValue);
  if (!Number.isInteger(layer) || layer < MIN_LAYER || layer > MAX_LAYER) {
    const message = outOfRangeMessage(rawValue);
    setLayerStatus(`Warning: ${message}`);
    throw new Error(message);
  }
  setLayerStatus(`Layer ${layer} — the slot a write or export uses.`);
  return layer;
}

export function writeLayerToUi(layerInput, layer) {
  const parsed = layer === null || layer === undefined || layer === "" ? NaN : Number(layer);
  if (Number.isInteger(parsed) && parsed >= MIN_LAYER && parsed <= MAX_LAYER) {
    layerInput.value = String(parsed);
    setLayerStatus(`Layer ${parsed} — the slot the read/imported profile uses.`);
    return;
  }
  layerInput.value = String(MIN_LAYER);
  setLayerStatus(`Warning: profile layer "${layer}" is outside 1-3; showing layer ${MIN_LAYER}.`);
}
