export function readLayerFromUi(layerInput) {
  const layer = Number(layerInput.value || 1);
  if (!Number.isInteger(layer) || layer < 0 || layer > 15) {
    throw new Error("Layer must be an integer between 0 and 15");
  }
  return layer;
}

export function writeLayerToUi(layerInput, layer) {
  layerInput.value = String(Number(layer || 1));
}
