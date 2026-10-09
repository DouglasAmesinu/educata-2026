// Thin wrapper around the vendored qrcode-generator library (MIT, Kazuhiko Arase).
import qrcode from "./qrcode-lib.js";

function build(text) {
  const q = qrcode(0, "M"); // error correction M: survives a scuffed or low-brightness screen
  q.addData(text);
  q.make();
  return q;
}

// GIF data URL for an <img src>.
export function qrDataUrl(text, cell = 6, margin = 4) {
  return build(text).createDataURL(cell, margin);
}

// Module matrix, used by tests to check the code decodes back to the text.
export function qrMatrix(text) {
  const q = build(text);
  const n = q.getModuleCount();
  return { n, isDark: (r, c) => q.isDark(r, c) };
}
