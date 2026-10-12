// Draws the guest's ticket (name, group, reference, QR) to a PNG so it can be saved to the phone's photos or shared,
// even in browsers where printing does not work (in-app browsers inside WhatsApp, Facebook, etc.).
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error("QR image failed to load")); i.src = src; });
}

function fit(ctx, text, maxWidth, startPx, weight, family) {
  let px = startPx;
  while (px > 18) { ctx.font = `${weight} ${px}px ${family}`; if (ctx.measureText(text).width <= maxWidth) break; px -= 2; }
  return px;
}

export async function drawTicket({ name, ref, group, qr, eventLine }) {
  const W = 900, H = 1240, SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", MONO = "ui-monospace, Menlo, Consolas, monospace";
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#EEEBF5"; ctx.fillRect(0, 0, W, H);
  // dark header
  ctx.fillStyle = "#1B1535"; ctx.fillRect(0, 0, W, 330);
  ctx.fillStyle = "#F2B33D"; ctx.font = `700 30px ${SANS}`; ctx.fillText("Content Creator Contest", 60, 80);
  ctx.fillStyle = "#fff"; ctx.font = `800 84px ${SANS}`; ctx.fillText("Educata 2026", 60, 170);
  const npx = fit(ctx, name, W - 120, 50, 800, SANS); ctx.fillStyle = "#fff"; ctx.font = `800 ${npx}px ${SANS}`; ctx.fillText(name, 60, 250);
  const gpx = fit(ctx, group, W - 120, 30, 500, SANS); ctx.fillStyle = "#cfc8e8"; ctx.font = `500 ${gpx}px ${SANS}`; ctx.fillText(group, 60, 300);
  // white card with QR
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1B1535"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(60, 370, W - 120, 700, 28); ctx.fill(); ctx.stroke();
  const img = await loadImage(qr);
  const scale = Math.max(1, Math.floor(560 / img.width)); // whole-number scale keeps the squares crisp so cameras read it
  const size = img.width * scale, x = Math.round((W - size) / 2), y = 400;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#fff"; ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
  ctx.drawImage(img, x, y, size, size);
  ctx.fillStyle = "#1B1535"; const rpx = fit(ctx, ref, W - 160, 64, 800, MONO); ctx.font = `800 ${rpx}px ${MONO}`; ctx.textAlign = "center";
  ctx.fillText(ref, W / 2, y + size + 80);
  ctx.fillStyle = "#5B5675"; ctx.font = `500 28px ${SANS}`; ctx.fillText("Show this QR code at the door", W / 2, y + size + 130);
  ctx.textAlign = "left";
  if (eventLine) { ctx.fillStyle = "#1B1535"; ctx.font = `600 28px ${SANS}`; ctx.textAlign = "center"; ctx.fillText(eventLine, W / 2, 1130); ctx.textAlign = "left"; }
  ctx.fillStyle = "#5B5675"; ctx.font = `500 24px ${SANS}`; ctx.textAlign = "center"; ctx.fillText("AHK Ghana. Strictly by invitation. This ticket is personal.", W / 2, 1190); ctx.textAlign = "left";
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png"));
}
