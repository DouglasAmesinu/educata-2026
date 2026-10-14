// Draws the guest's ticket (name, group, reference, QR) to a PNG so it can be saved to the phone's photos or shared,
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
  // black header (brand colours from assets/brand.css): logo, big white title, small orange line, then the participant
  ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, 330);
  try { const logo = await loadImage("assets/educata-logo-light.png"); ctx.drawImage(logo, 60, 28, 150, Math.round(150 * logo.naturalHeight / logo.naturalWidth)); } catch (e) { /* no logo: the title still says it all */ }
  const TITLE = "Content Creator Contest";
  let tpx = fit(ctx, TITLE, W - 120, 64, 800, SANS), y0 = 150;
  ctx.fillStyle = "#fff";
  if (tpx >= 46) { ctx.font = `800 ${tpx}px ${SANS}`; ctx.fillText(TITLE, 60, y0); }
  else { tpx = 50; ctx.font = `800 ${tpx}px ${SANS}`; ctx.fillText("Content Creator", 60, 140); ctx.fillText("Contest", 60, 194); y0 = 194; } // two lines if needed
  ctx.fillStyle = "#EC8223"; ctx.font = `700 24px ${SANS}`; ctx.fillText("educataGhana 2026", 60, y0 + 36);
  const npx = fit(ctx, name, W - 120, y0 > 150 ? 36 : 42, 800, SANS); ctx.fillStyle = "#fff"; ctx.font = `800 ${npx}px ${SANS}`; ctx.fillText(name, 60, y0 + (y0 > 150 ? 82 : 92));
  const gpx = fit(ctx, group, W - 120, 26, 500, SANS); ctx.fillStyle = "#DBDBDB"; ctx.font = `500 ${gpx}px ${SANS}`; ctx.fillText(group, 60, y0 + (y0 > 150 ? 118 : 132));
  // white card with QR
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(60, 370, W - 120, 700, 28); ctx.fill(); ctx.stroke();
  const img = await loadImage(qr);
  const scale = Math.max(1, Math.floor(560 / img.width)); // whole-number scale keeps the squares crisp so cameras read it
  const size = img.width * scale, x = Math.round((W - size) / 2), y = 400;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#fff"; ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
  ctx.drawImage(img, x, y, size, size);
  // reference in plain monospace with letter spacing (where the browser supports canvas letterSpacing)
  ctx.fillStyle = "#2A2A2A"; ctx.letterSpacing = "5px"; const rpx = fit(ctx, ref, W - 160, 60, 700, MONO); ctx.font = `700 ${rpx}px ${MONO}`; ctx.textAlign = "center";
  ctx.fillText(ref, W / 2, y + size + 80); ctx.letterSpacing = "0px";
  ctx.fillStyle = "#595959"; ctx.font = `500 28px ${SANS}`; ctx.fillText("Show this QR code at the door", W / 2, y + size + 130);
  ctx.textAlign = "left";
  if (eventLine) { ctx.fillStyle = "#2A2A2A"; ctx.font = `600 28px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(eventLine, W / 2, 1130); ctx.textAlign = "left"; }
  // Footer: the organiser's full name on its own line, each line shrunk to fit the width.
  ctx.fillStyle = "#595959"; ctx.textAlign = "center";
  for (const [t, y] of [["Delegation of German Industry and Commerce in Ghana", 1180], ["Strictly by invitation. This ticket is personal.", 1216]]) { const px = fit(ctx, t, W - 120, 24, 500, SANS); ctx.font = `500 ${px}px ${SANS}`; ctx.fillText(t, W / 2, y); }
  ctx.textAlign = "left";
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png"));
}
