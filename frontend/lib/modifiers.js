// Modifier bitmask helpers.
//
// The device exposes eight modifier bits: the left variants occupy the low
// nibble and the right variants the high nibble.
//   0x01 LeftCtrl   0x10 RightCtrl
//   0x02 LeftShift  0x20 RightShift
//   0x04 LeftAlt    0x40 RightAlt
//   0x08 LeftWin    0x80 RightWin
//
// `includeWin` gates the Win bits, which the mouse modifier set does not offer.
const MODIFIER_CHECKBOXES = [
  { className: "mod-ctrl", bit: 0x01 },
  { className: "mod-shift", bit: 0x02 },
  { className: "mod-alt", bit: 0x04 },
  { className: "mod-win", bit: 0x08, win: true },
  { className: "mod-rctrl", bit: 0x10 },
  { className: "mod-rshift", bit: 0x20 },
  { className: "mod-ralt", bit: 0x40 },
  { className: "mod-rwin", bit: 0x80, win: true },
];

export function modifierFromCheckboxes(wrapper, includeWin = true) {
  if (!wrapper) {
    return 0;
  }
  let mask = 0;
  for (const { className, bit, win } of MODIFIER_CHECKBOXES) {
    if (win && !includeWin) {
      continue;
    }
    if (wrapper.querySelector(`.${className}`)?.checked) {
      mask |= bit;
    }
  }
  return mask;
}

export function setModifierCheckboxes(wrapper, value, includeWin = true) {
  if (!wrapper) {
    return;
  }
  const mask = Number(value) || 0;
  for (const { className, bit, win } of MODIFIER_CHECKBOXES) {
    if (win && !includeWin) {
      continue;
    }
    const checkbox = wrapper.querySelector(`.${className}`);
    if (checkbox) {
      checkbox.checked = (mask & bit) !== 0;
    }
  }
}

// The firmware applies a single modifier set to an entire macro: only the first
// keystroke's modifiers take effect and later ones are ignored. Collapse the
// per-stroke modifiers onto the first keystroke so the macro that is written
// matches the single modifier set the UI lets the user pick.
export function normalizeMacroModifiers(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return [];
  }
  const modifier = Number(strokes[0].modifier) || 0;
  return strokes.map(({ keycode }) => ({ modifier, keycode }));
}
