export function modifierFromCheckboxes(wrapper, includeWin = true) {
  const ctrl = wrapper.querySelector(".mod-ctrl")?.checked ? 1 : 0;
  const shift = wrapper.querySelector(".mod-shift")?.checked ? 2 : 0;
  const alt = wrapper.querySelector(".mod-alt")?.checked ? 4 : 0;
  const win = includeWin && wrapper.querySelector(".mod-win")?.checked ? 8 : 0;
  return ctrl | shift | alt | win;
}

export function setModifierCheckboxes(wrapper, value, includeWin = true) {
  wrapper.querySelector(".mod-ctrl").checked = (value & 1) !== 0;
  wrapper.querySelector(".mod-shift").checked = (value & 2) !== 0;
  wrapper.querySelector(".mod-alt").checked = (value & 4) !== 0;
  if (includeWin) {
    wrapper.querySelector(".mod-win").checked = (value & 8) !== 0;
  }
}
