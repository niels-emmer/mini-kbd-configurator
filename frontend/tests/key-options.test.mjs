// Renders the keycode dropdown (frontend/ui/modes/key.js) and checks the new
// catalogue entries and the "Other (raw HID code)" escape hatch appear.
//
// key.js imports ../../lib/api.js, which captures #logPanel at module load, so a
// minimal document stub lets it import under Node without a real DOM. Run with
// `node --test frontend/tests/key-options.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

globalThis.document = { getElementById: () => null };

const { keyCodeOptionsHtml, RAW_KEYCODE_OPTION } = await import("../ui/modes/key.js");

test("new keys render as options with their hex usage code", () => {
  const html = keyCodeOptionsHtml();
  const expected = [
    ["CapsLock", 0x39],
    ["Pause/Break", 0x48],
    ["Menu", 0x65],
    ["NumLock", 0x53],
    ["KP Enter", 0x58],
    ["KP .", 0x63],
    ["F13", 0x68],
    ["F24", 0x73],
  ];
  for (const [name, code] of expected) {
    const option = `>${name} (0x${code.toString(16).toUpperCase()})<`;
    assert.ok(html.includes(option), `missing dropdown option for ${name}`);
  }
});

test("the raw escape hatch is offered and selected for off-catalogue codes", () => {
  assert.ok(
    keyCodeOptionsHtml().includes(`value="${RAW_KEYCODE_OPTION}"`),
    "raw option missing from the dropdown",
  );

  // 0x64 (Non-US \) is not in KEY_CODES, so it must fall through to the raw path.
  assert.ok(
    keyCodeOptionsHtml(0x64).includes(`value="${RAW_KEYCODE_OPTION}" selected`),
    "raw option should be preselected for an off-catalogue code",
  );

  // A catalogue code must still select its own entry, not the raw option.
  const catalogue = keyCodeOptionsHtml(0x39);
  assert.ok(catalogue.includes(`value="${0x39}" selected`), "CapsLock option should be selected");
  assert.ok(
    !catalogue.includes(`value="${RAW_KEYCODE_OPTION}" selected`),
    "raw option should not be selected for a catalogue code",
  );
});
