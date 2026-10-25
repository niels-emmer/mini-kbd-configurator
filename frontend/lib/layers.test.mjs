// Run with: node --test frontend/lib/layers.test.mjs
//
// Node 22+ can import the repo's `.js` ES modules directly (syntax detection),
// so no package.json / bundler is needed. `layers.js` only touches `document`
// when a status element exists, so most cases run without a DOM.

import test from "node:test";
import assert from "node:assert/strict";

import { MIN_LAYER, MAX_LAYER, readLayerFromUi, writeLayerToUi } from "./layers.js";

function fakeInput(value) {
  return { value };
}

function withStatusElement(run) {
  const status = { textContent: "" };
  globalThis.document = {
    getElementById: (id) => (id === "layerStatus" ? status : null),
  };
  try {
    return run(status);
  } finally {
    delete globalThis.document;
  }
}

test("layer bounds are the device's three slots", () => {
  assert.equal(MIN_LAYER, 1);
  assert.equal(MAX_LAYER, 3);
});

for (const layer of [1, 2, 3]) {
  test(`readLayerFromUi accepts layer ${layer}`, () => {
    withStatusElement((status) => {
      assert.equal(readLayerFromUi(fakeInput(String(layer))), layer);
      assert.match(status.textContent, new RegExp(`Layer ${layer}`));
    });
  });
}

for (const value of ["0", "4", "-1", "2.5", "1e1", "abc", ""]) {
  test(`readLayerFromUi rejects ${JSON.stringify(value)} and shows the error`, () => {
    withStatusElement((status) => {
      assert.throws(() => readLayerFromUi(fakeInput(value)), /Layer must be 1, 2 or 3/);
      assert.match(status.textContent, /Layer must be 1, 2 or 3/);
    });
  });
}

test("readLayerFromUi still parses a valid value with no status element", () => {
  assert.equal(readLayerFromUi(fakeInput("3")), 3);
});

for (const layer of [1, 2, 3]) {
  test(`writeLayerToUi writes layer ${layer} into the field`, () => {
    withStatusElement((status) => {
      const input = fakeInput("");
      writeLayerToUi(input, layer);
      assert.equal(input.value, String(layer));
      assert.match(status.textContent, new RegExp(`Layer ${layer}`));
    });
  });
}

test("writeLayerToUi clamps an out-of-range profile layer to 1 and warns", () => {
  withStatusElement((status) => {
    const input = fakeInput("2");
    writeLayerToUi(input, 7);
    assert.equal(input.value, "1");
    assert.match(status.textContent, /outside 1-3/);
  });
});

test("writeLayerToUi never writes NaN for a missing layer", () => {
  withStatusElement(() => {
    const input = fakeInput("2");
    writeLayerToUi(input, undefined);
    assert.equal(input.value, "1");
  });
});
