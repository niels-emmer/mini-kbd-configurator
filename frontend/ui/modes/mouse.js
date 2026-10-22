import { MOUSE_BUTTONS, MOUSE_WHEEL } from "../../lib/keys.js";
import { modifierFromCheckboxes, setModifierCheckboxes } from "../../lib/modifiers.js";

export function mouseActionOptionsHtml(selectedValue = "left") {
  const options = ["left", "right", "middle", "wheel-up", "wheel-down"]
    .map((action) => {
      const selected = action === selectedValue ? "selected" : "";
      return `<option value="${action}" ${selected}>${action}</option>`;
    })
    .join("");
  return options;
}

export function collectMouseMode(card, keyNum) {
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

  return {
    key_num: keyNum,
    type: "mouse",
    button,
    wheel,
    modifier,
  };
}

export function applyMouseMode(card, keyConfig) {
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
