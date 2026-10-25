// Unit tests for the key catalogue in frontend/lib/keys.js.
//
// KEY_CODES values are HID keyboard usage IDs on usage page 0x07, taken from the
// USB HID Usage Tables (Keyboard/Keypad page). No build step and no dependencies
// are involved: run with `node --test frontend/tests/keys.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import { KEY_CODES, RAW_KEYCODE_MAX, parseRawKeycode } from "../lib/keys.js";

// The codes this task adds, spelled out against the HID usage tables rather than
// derived, so a typo in the source map fails the test.
const EXPECTED_NEW_CODES = {
  CapsLock: 0x39,
  PrintScreen: 0x46,
  ScrollLock: 0x47,
  "Pause/Break": 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  End: 0x4d,
  PageDown: 0x4e,
  Menu: 0x65,
  NumLock: 0x53,
  "KP /": 0x54,
  "KP *": 0x55,
  "KP -": 0x56,
  "KP +": 0x57,
  "KP Enter": 0x58,
  "KP 1": 0x59,
  "KP 2": 0x5a,
  "KP 3": 0x5b,
  "KP 4": 0x5c,
  "KP 5": 0x5d,
  "KP 6": 0x5e,
  "KP 7": 0x5f,
  "KP 8": 0x60,
  "KP 9": 0x61,
  "KP 0": 0x62,
  "KP .": 0x63,
  F13: 0x68,
  F14: 0x69,
  F15: 0x6a,
  F16: 0x6b,
  F17: 0x6c,
  F18: 0x6d,
  F19: 0x6e,
  F20: 0x6f,
  F21: 0x70,
  F22: 0x71,
  F23: 0x72,
  F24: 0x73,
};

test("new catalogue entries carry the standard HID usage codes", () => {
  for (const [name, code] of Object.entries(EXPECTED_NEW_CODES)) {
    assert.equal(KEY_CODES[name], code, `${name} should map to 0x${code.toString(16)}`);
  }
});

test("no two names map to the same usage code", () => {
  const byCode = new Map();
  for (const [name, code] of Object.entries(KEY_CODES)) {
    assert.ok(
      !byCode.has(code),
      `duplicate code 0x${code.toString(16).toUpperCase()}: ${byCode.get(code)} and ${name}`,
    );
    byCode.set(code, name);
  }
});

test("no duplicate names", () => {
  // An object literal collapses exact duplicate keys, so the meaningful check is
  // that no two entries differ only by case (the likely slip when hand-typing).
  const byName = new Map();
  for (const name of Object.keys(KEY_CODES)) {
    const folded = name.toLowerCase();
    assert.ok(!byName.has(folded), `duplicate name: ${byName.get(folded)} and ${name}`);
    byName.set(folded, name);
  }
});

test("every usage code fits in the single keycode byte", () => {
  for (const [name, code] of Object.entries(KEY_CODES)) {
    assert.ok(
      Number.isInteger(code) && code >= 0 && code <= RAW_KEYCODE_MAX,
      `${name} -> ${code} is not a 0x00-0xFF usage id`,
    );
  }
});

test("parseRawKeycode accepts 0-255 and rejects anything else", () => {
  assert.equal(parseRawKeycode(0), 0);
  assert.equal(parseRawKeycode("0"), 0);
  assert.equal(parseRawKeycode("255"), 255);
  assert.equal(parseRawKeycode(" 100 "), 100);
  assert.equal(parseRawKeycode(0x64), 0x64);

  assert.equal(parseRawKeycode(""), null);
  assert.equal(parseRawKeycode("   "), null);
  assert.equal(parseRawKeycode(null), null);
  assert.equal(parseRawKeycode(undefined), null);
  assert.equal(parseRawKeycode("256"), null);
  assert.equal(parseRawKeycode("-1"), null);
  assert.equal(parseRawKeycode("12.5"), null);
  assert.equal(parseRawKeycode("abc"), null);
});
