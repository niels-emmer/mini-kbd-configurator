export const KEY_DEFINITIONS = [
  { key_num: 1, label: "Button 1" },
  { key_num: 2, label: "Button 2" },
  { key_num: 3, label: "Button 3" },
  { key_num: 13, label: "Knob Left" },
  { key_num: 14, label: "Knob Press" },
  { key_num: 15, label: "Knob Right" },
];

export const KEY_CODES = {
  A: 0x04,
  B: 0x05,
  C: 0x06,
  D: 0x07,
  E: 0x08,
  F: 0x09,
  G: 0x0a,
  H: 0x0b,
  I: 0x0c,
  J: 0x0d,
  K: 0x0e,
  L: 0x0f,
  M: 0x10,
  N: 0x11,
  O: 0x12,
  P: 0x13,
  Q: 0x14,
  R: 0x15,
  S: 0x16,
  T: 0x17,
  U: 0x18,
  V: 0x19,
  W: 0x1a,
  X: 0x1b,
  Y: 0x1c,
  Z: 0x1d,
  1: 0x1e,
  2: 0x1f,
  3: 0x20,
  4: 0x21,
  5: 0x22,
  6: 0x23,
  7: 0x24,
  8: 0x25,
  9: 0x26,
  0: 0x27,
  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  "-": 0x2d,
  "=": 0x2e,
  "[": 0x2f,
  "]": 0x30,
  "\\": 0x31,
  ";": 0x33,
  "'": 0x34,
  "`": 0x35,
  ",": 0x36,
  ".": 0x37,
  "/": 0x38,
  F1: 0x3a,
  F2: 0x3b,
  F3: 0x3c,
  F4: 0x3d,
  F5: 0x3e,
  F6: 0x3f,
  F7: 0x40,
  F8: 0x41,
  F9: 0x42,
  F10: 0x43,
  F11: 0x44,
  F12: 0x45,
  Delete: 0x4c,
  Right: 0x4f,
  Left: 0x50,
  Down: 0x51,
  Up: 0x52,

  // Editing / navigation cluster (HID usage page 0x07)
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

  // Numeric keypad
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

  // Extended function keys
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

// Highest HID keyboard usage id that fits in the single keycode byte the
// firmware expects (see backend/hid_device.py set_single_key/set_keystroke).
export const RAW_KEYCODE_MAX = 0xff;

// Validate the "Other (raw HID code)" escape hatch. Returns the integer code
// for a usable 0-255 value, or null when the input is empty / out of range so
// callers can reject it instead of sending a bogus keycode.
export function parseRawKeycode(value) {
  const text = String(value ?? "").trim();
  if (text === "") {
    return null;
  }
  const num = Number(text);
  if (!Number.isInteger(num) || num < 0 || num > RAW_KEYCODE_MAX) {
    return null;
  }
  return num;
}

export const MEDIA_CODES = {
  "Play/Pause": [0xcd, 0x00],
  Next: [0xb5, 0x00],
  Previous: [0xb6, 0x00],
  Stop: [0xb7, 0x00],
  "Volume Up": [0xe9, 0x00],
  "Volume Down": [0xea, 0x00],
  Mute: [0xe2, 0x00],
};

export const MOUSE_BUTTONS = {
  left: 0x01,
  right: 0x02,
  middle: 0x04,
};

export const MOUSE_WHEEL = {
  "wheel-up": 0x01,
  "wheel-down": 0xff,
};
