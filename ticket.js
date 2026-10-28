import { EVENT_TITLE } from "./core.js";

// Draws the guest's ticket (banner, name, group, reference, QR) to a PNG so it can be saved to the phone's photos or shared,
// even in browsers where printing does not work (in-app browsers inside WhatsApp, Facebook, etc.).
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("Image failed to load: " + String(src).slice(0, 40))); i.src = src; });
}

function fit(ctx, text, maxWidth, startPx, weight, family) {
  let px = startPx;
  while (px > 18) { ctx.font = `${weight} ${px}px ${family}`; if (ctx.measureText(text).width <= maxWidth) break; px -= 2; }
  return px;
}

export async function drawTicket({ name, ref, group, qr, eventLine }) {
  const W = 900, H = 1240, SANS = "Montserrat, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", MONO = "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Consolas, 'Liberation Mono', 'Courier New', monospace";
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#F2F2F2"; ctx.fillRect(0, 0, W, H);
  // The official banner across the top (900 x 360, same 2.5 to 1 shape as the file), with a thin orange edge below it.
  // Navy behind it, and the title as text only if the image cannot load.
  ctx.fillStyle = "#0A2232"; ctx.fillRect(0, 0, W, 360);
  try { ctx.drawImage(await loadImage("assets/banner-source.jpg"), 0, 0, W, 360); }
  catch (e) { const px = fit(ctx, EVENT_TITLE, W - 120, 64, 800, SANS); ctx.fillStyle = "#fff"; ctx.font = `800 ${px}px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(EVENT_TITLE, W / 2, 200); ctx.textAlign = "left"; }
  ctx.fillStyle = "#EC8223"; ctx.fillRect(0, 360, W, 6);
  // White card: participant, group, QR, reference.
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(60, 392, W - 120, 748, 28); ctx.fill(); ctx.stroke();
  ctx.textAlign = "center";
  const npx = fit(ctx, name, W - 160, 44, 800, SANS); ctx.fillStyle = "#000000"; ctx.font = `800 ${npx}px ${SANS}`; ctx.fillText(name, W / 2, 452);
  const gpx = fit(ctx, group, W - 160, 26, 500, SANS); ctx.fillStyle = "#595959"; ctx.font = `500 ${gpx}px ${SANS}`; ctx.fillText(group, W / 2, 492);
  ctx.textAlign = "left";
  const img = await loadImage(qr);
  const scale = Math.max(1, Math.floor(492 / img.width)); // whole-number scale keeps the squares crisp so cameras read it
  const size = img.width * scale, x = Math.round((W - size) / 2), y = 514;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#fff"; ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
  ctx.drawImage(img, x, y, size, size);
  // reference in plain monospace with letter spacing (where the browser supports canvas letterSpacing)
  ctx.fillStyle = "#2A2A2A"; ctx.letterSpacing = "5px"; const rpx = fit(ctx, ref, W - 160, 52, 700, MONO); ctx.font = `700 ${rpx}px ${MONO}`; ctx.textAlign = "center";
  ctx.fillText(ref, W / 2, y + size + 56); ctx.letterSpacing = "0px";
  ctx.fillStyle = "#595959"; ctx.font = `500 24px ${SANS}`; ctx.fillText("Show this QR code at the door", W / 2, y + size + 94);
  if (eventLine) { const epx = fit(ctx, eventLine, W - 160, 22, 600, SANS); ctx.fillStyle = "#2A2A2A"; ctx.font = `600 ${epx}px ${SANS}`; ctx.fillText(eventLine, W / 2, y + size + 122); }
  ctx.textAlign = "left";
  // Footer: the organiser's full name on its own line, each line shrunk to fit the width.
  ctx.fillStyle = "#595959"; ctx.textAlign = "center";
  for (const [t, y] of [["Delegation of German Industry and Commerce in Ghana", 1186], ["Strictly by invitation. This ticket is personal.", 1220]]) { const px = fit(ctx, t, W - 120, 24, 500, SANS); ctx.font = `500 ${px}px ${SANS}`; ctx.fillText(t, W / 2, y); }
  ctx.textAlign = "left";
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png"));
}
