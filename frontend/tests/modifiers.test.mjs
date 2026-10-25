import test from "node:test";
import assert from "node:assert/strict";

import {
  modifierFromCheckboxes,
  normalizeMacroModifiers,
  setModifierCheckboxes,
} from "../lib/modifiers.js";

// Modifier class -> bit, mirroring frontend/lib/modifiers.js.
// Low nibble = left variants, high nibble = right variants.
const MODIFIER_BITS = [
  ["mod-ctrl", 0x01],
  ["mod-shift", 0x02],
  ["mod-alt", 0x04],
  ["mod-win", 0x08],
  ["mod-rctrl", 0x10],
  ["mod-rshift", 0x20],
  ["mod-ralt", 0x40],
  ["mod-rwin", 0x80],
];

// Minimal stand-in for a DOM wrapper: the modifiers helpers only ever call
// querySelector with one of the modifier class selectors above.
function fakeWrapper(classes = MODIFIER_BITS.map(([className]) => className)) {
  const boxes = new Map(classes.map((className) => [className, { checked: false }]));
  return {
    boxes,
    querySelector(selector) {
      return boxes.get(selector.replace(/^\./, "")) ?? null;
    },
  };
}

test("modifier bitmask round-trips across the full 0-255 range", () => {
  const wrapper = fakeWrapper();
  for (let value = 0; value <= 0xff; value += 1) {
    setModifierCheckboxes(wrapper, value);
    assert.equal(modifierFromCheckboxes(wrapper), value, `mask 0x${value.toString(16)}`);
  }
});

test("each modifier bit maps to exactly one checkbox", () => {
  for (const [className, bit] of MODIFIER_BITS) {
    const wrapper = fakeWrapper();
    setModifierCheckboxes(wrapper, bit);
    assert.equal(modifierFromCheckboxes(wrapper), bit, `${className} -> 0x${bit.toString(16)}`);
    for (const [otherClass, box] of wrapper.boxes) {
      assert.equal(
        box.checked,
        otherClass === className,
        `${otherClass} when only ${className} (0x${bit.toString(16)}) is set`
      );
    }
  }
});

test("right-side bits live in the high nibble and never alias the left bits", () => {
  const leftOnly = fakeWrapper();
  setModifierCheckboxes(leftOnly, 0x0f);
  assert.equal(modifierFromCheckboxes(leftOnly), 0x0f);

  const rightOnly = fakeWrapper();
  setModifierCheckboxes(rightOnly, 0xf0);
  assert.equal(modifierFromCheckboxes(rightOnly), 0xf0);
});

test("includeWin=false drops the Win bits but keeps the rest", () => {
  const wrapper = fakeWrapper();
  setModifierCheckboxes(wrapper, 0x0f | 0x80, false);
  assert.equal(wrapper.boxes.get("mod-ctrl").checked, true);
  assert.equal(wrapper.boxes.get("mod-win").checked, false);
  assert.equal(wrapper.boxes.get("mod-rwin").checked, false);
  assert.equal(modifierFromCheckboxes(wrapper, false), 0x07);
});

test("missing checkboxes are ignored (mouse modifier set, empty wrapper)", () => {
  const wrapper = fakeWrapper(["mod-ctrl", "mod-shift", "mod-alt"]);
  setModifierCheckboxes(wrapper, 0xff);
  assert.equal(modifierFromCheckboxes(wrapper, true), 0x07);
  setModifierCheckboxes(wrapper, 0xff, false);
  assert.equal(modifierFromCheckboxes(wrapper, false), 0x07);

  assert.equal(modifierFromCheckboxes(null), 0);
  setModifierCheckboxes(null, 0xff);
});

test("normalizeMacroModifiers applies the first keystroke's modifiers to the whole macro", () => {
  assert.deepEqual(normalizeMacroModifiers([]), []);
  assert.deepEqual(
    normalizeMacroModifiers([{ modifier: 0x05, keycode: 0x04 }]),
    [{ modifier: 0x05, keycode: 0x04 }]
  );
  assert.deepEqual(
    normalizeMacroModifiers([
      { modifier: 0x01, keycode: 0x04 },
      { modifier: 0x02, keycode: 0x05 },
      { modifier: 0x00, keycode: 0x06 },
    ]),
    [
      { modifier: 0x01, keycode: 0x04 },
      { modifier: 0x01, keycode: 0x05 },
      { modifier: 0x01, keycode: 0x06 },
    ]
  );
});
