import { MEDIA_CODES } from "../../lib/keys.js";

export function mediaOptionsHtml(selectedName = "") {
  const options = Object.keys(MEDIA_CODES)
    .map((name) => {
      const selected = name === selectedName ? "selected" : "";
      return `<option value="${name}" ${selected}>${name}</option>`;
    })
    .join("");
  return `<option value="">-- Select Media --</option>${options}`;
}

export function collectMediaMode(card, keyNum) {
  const mediaName = card.querySelector(".media-select").value;
  if (!mediaName || !MEDIA_CODES[mediaName]) {
    throw new Error(`key ${keyNum}: select a media key`);
  }
  const [code1, code2] = MEDIA_CODES[mediaName];
  return {
    key_num: keyNum,
    type: "media",
    code1,
    code2,
  };
}

export function applyMediaMode(card, keyConfig) {
  const mediaSelect = card.querySelector(".media-select");
  const name = Object.keys(MEDIA_CODES).find((k) => {
    const [a, b] = MEDIA_CODES[k];
    return a === Number(keyConfig.code1) && b === Number(keyConfig.code2);
  });
  mediaSelect.value = name || "";
}
