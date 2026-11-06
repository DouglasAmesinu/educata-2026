// Real-browser tests of the pages, run against stand-ins for Firebase (see mocks/).
// Run:  npm run test:browser      (needs Chrome or Edge installed; set CHROME_PATH if it is not found)
// The stand-ins mimic what the security rules allow, but they are NOT the real rules: run `npm run test:rules` too.
import fs from "node:fs";
import nodePath from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";
import { writeEmailPreview } from "../preview-email.mjs";

const HERE = nodePath.dirname(fileURLToPath(import.meta.url));
const ROOT = nodePath.resolve(HERE, "../..");
const OUT = nodePath.join(HERE, "out");
// Start clean so only this run's screenshots are there. Empties the folder rather than deleting it, because Windows refuses to
// delete a folder that is open in File Explorer (retries cope with a viewer briefly holding a file).
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(nodePath.join(OUT, f), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
const written = [];
// The last committed index.html, served at /__before/ to measure registration before and after a change (null without git).
let BEFORE_INDEX = null;
try { BEFORE_INDEX = (await import("node:child_process")).execFileSync("git", ["show", "HEAD:index.html"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { /* no git: the comparison is skipped */ }
const require = createRequire(nodePath.join(ROOT, "package.json"));
const jsQR = require("jsqr");
const { GifReader } = require("omggif");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".txt": "text/plain" };

async function findBrowser() {
  const candidates = [process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return { executablePath: c, args: ["--no-sandbox"] };
  try { const m = (await import("@sparticuz/chromium")).default; return { executablePath: await m.executablePath(), args: m.args }; } catch (e) {}
  throw new Error("No Chrome or Edge found. Install one, or set CHROME_PATH to its chrome.exe / msedge.exe.");
}
const server = http.createServer(async (q, r) => { if (q.headers["x-slow-banner"] && q.url.includes("banner-source.jpg")) await new Promise((res) => setTimeout(res, 1500)); if (q.url.startsWith("/__before/")) { const rest = q.url.split("?")[0].slice("/__before/".length); if (rest === "index.html" && BEFORE_INDEX) { r.writeHead(200, { "content-type": "text/html" }); return r.end(BEFORE_INDEX); } q.url = "/" + rest; } const p = nodePath.join(ROOT, q.url.split("?")[0] === "/" ? "index.html" : q.url.split("?")[0]); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[p.slice(p.lastIndexOf("."))] || "text/plain" }); r.end(fs.readFileSync(p)); }).listen(8765);
const B = "http://localhost:8765";
// The QR points at PUBLIC_BASE_URL from config.js when it is set (the live site), otherwise at the page's own address.
const { PUBLIC_BASE_URL } = await import("../../config.js");
const { EVENT_TITLE } = await import("../../core.js");
const SCAN_BASE = PUBLIC_BASE_URL ? PUBLIC_BASE_URL.trim().replace(/\/?$/, "/") : B + "/";
const mocks = { "firebase-app.js": "mock-app.js", "firebase-auth.js": "mock-auth.js", "firebase-firestore.js": "mock-firestore.js", "firebase-firestore-lite.js": "mock-firestore.js" };
const found = await findBrowser();
const browser = await puppeteer.launch({ args: found.args, executablePath: found.executablePath, headless: true });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// Each page gets its own window: recent headless Chrome freezes background tabs, which hung these tests.
async function win(br = browser) { const s = await br.target().createCDPSession(); const { targetId } = await s.send("Target.createTarget", { url: "about:blank", newWindow: true }); const t = await br.waitForTarget((t) => t._targetId === targetId); return t.page(); }
// opts.init: a function run in the page before its own scripts (stand-ins); opts.browser: another browser (fake camera).
async function open(path, seed = {}, w = 390, opts = {}) {
  const p = await win(opts.browser); await p.setViewport({ width: w, height: 1400 });
  p.on("pageerror", (e) => { console.log("PAGEERROR", e.message); fails++; });
  await p.setRequestInterception(true);
  p.on("request", (r) => { const u = r.url(); const m = Object.keys(mocks).find(k => u.includes("gstatic.com/firebasejs") && u.endsWith(k));
    if (m) return r.respond({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(nodePath.join(HERE, "mocks", mocks[m])) });
    if (opts.block && opts.block.test(u)) return r.abort(); // opts.block: a pattern of URLs to refuse (missing files)
    if (opts.config && u.split("?")[0] === B + "/config.js") return r.respond({ status: 200, contentType: "text/javascript", body: fs.readFileSync(nodePath.join(ROOT, "config.js"), "utf8").replace('export const RELAY_URL = "";', () => `export const RELAY_URL = ${JSON.stringify(opts.config.relay)};`).replace('export const ENROLL_URL = "";', () => `export const ENROLL_URL = ${JSON.stringify(opts.config.enroll)};`) });
    if (u.startsWith(B)) return r.continue(); r.abort(); });
  await p.evaluateOnNewDocument((s) => { window.__db = s.db || JSON.parse(localStorage.getItem("__db") || "null") || {}; window.__user = s.user || null; window.__asGuest = !s.user; window.__staff = !!(s.user && s.user.staff); window.addEventListener("pagehide", () => localStorage.setItem("__db", JSON.stringify(window.__db))); }, seed);
  if (opts.init) await p.evaluateOnNewDocument(opts.init, opts.initArg ?? null);
  if (opts.expose) for (const [name, fn] of Object.entries(opts.expose)) await p.exposeFunction(name, fn);
  await p.goto(B + path); return p;
}
// Screenshots are written with retries: on Windows, antivirus or an open image viewer can lock a new PNG for a moment.
const snap = async (pg, file, opts = {}) => { const buf = await pg.screenshot(opts); for (let i = 0; ; i++) { try { fs.writeFileSync(file, buf); written.push(nodePath.basename(file)); return; } catch (e) { if (i >= 10) throw e; await new Promise((r) => setTimeout(r, 200)); } } };
const dump = (p) => p.evaluate(() => window.__db);
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
const vis = (p, sel) => p.$eval(sel, (e) => !e.classList.contains("hidden"));
const group = (n, c, open = true) => JSON.stringify({ name: "Premium Partners", cap: c, count: n, open, lastReg: "" });
const baseDb = () => ({ "invites/CODEOK0001": JSON.stringify({ gid: "g1" }), "groups/g1": group(1, 3), "invites/FULLCODE01": JSON.stringify({ gid: "g2" }), "groups/g2": group(3, 3), "admins/adm": JSON.stringify({ ok: true }) });
const decodeGifDataUrl = (du) => { const g = new GifReader(Buffer.from(du.split(",")[1], "base64")); const px = new Uint8ClampedArray(g.width * g.height * 4); g.decodeAndBlitFrameRGBA(0, px); return jsQR(px, g.width, g.height); };

// ---- A: register, see ticket with QR ----
let p = await open("/index.html?c=CODEOK0001", { db: baseDb() });
await p.waitForFunction(() => document.getElementById("seatsline").textContent.startsWith("2 of 3"), { timeout: 5000 });
ok((await text(p, "#seatsline")).startsWith("2 of 3 seats left"), "form shows seats left (2 of 3)");
ok(await p.$eval("#submit", (b) => !b.disabled), "submit button enabled once the invitation is verified");
await p.type("#name", "Ama Mensah"); await p.type("#org", "Acme Ltd"); await p.type("#email", "Ama@Example.com");
await p.click("#consent"); await p.click("#submit");
await p.waitForSelector("#done:not(.hidden)");
const ref = await text(p, "#doneref");
ok(/^EDU26-[A-Z0-9]{6}$/.test(ref), "confirmation shows a reference " + ref);
const db1 = await dump(p);
ok(!!db1["registrations/ama@example.com"], "registration stored under lower-cased email");
ok(JSON.parse(db1["groups/g1"]).count === 2, "group count incremented to 2");
await p.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif"), { timeout: 5000 });
const src = await p.$eval("#doneqr", (i) => i.src);
const dec = decodeGifDataUrl(src);
ok(dec && dec.data === `${SCAN_BASE}scan.html?ref=${ref}`, "QR on ticket decodes to the phone scan link for " + ref);
await snap(p, nodePath.join(OUT, "ticket_390.png"), { fullPage: true });
await p.evaluate(() => localStorage.setItem("__db", JSON.stringify(window.__db)));
// ---- B: duplicate ----
let p2 = await open("/index.html?c=CODEOK0001");
await p2.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
await p2.type("#name", "Someone Else"); await p2.type("#org", "Other Co"); await p2.type("#email", "ama@example.com"); await p2.click("#consent"); await p2.click("#submit");
await p2.waitForSelector("#formerror:not(.hidden)");
ok((await text(p2, "#formerror")).includes("may already be registered"), "duplicate email shows the already-registered message");
ok(JSON.parse((await dump(p2))["groups/g1"]).count === 2, "duplicate did not consume a seat");
// ---- C: required org ----
await p2.reload(); await p2.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
await p2.type("#name", "No Org"); await p2.type("#email", "noorg@example.com"); await p2.click("#consent"); await p2.click("#submit");
ok((await text(p2, "#err-org")).length > 0, "missing organisation is rejected on the form");
// ---- D: full / bad code ----
let p3 = await open("/index.html?c=FULLCODE01", { db: baseDb() });
await p3.waitForSelector("#unavailable:not(.hidden)");
ok((await text(p3, "#unavailable-title")).includes("taken"), "full group shows seats-taken screen");
let p4 = await open("/index.html?c=NOPE234567", { db: baseDb() });
await p4.waitForSelector("#badcode:not(.hidden)"); ok(true, "unknown code shows invitation-not-verified");
// ---- Stand-in scan relay for scan.html: window.fetch answers like functions/relay.js (tested on its own in test/relay.test.mjs).
// Token "tok-ok" is a valid phone; code "123456" enrols. A relayed scan is written into every open page's stand-in database
// (BroadcastChannel), so the gate laptop sees it. Options: token, status (force an HTTP status), netFail (first n calls fail),
// fast (timers 50 times faster), ua (user agent), noStorage (localStorage refuses writes), enroll ({status, body}).
const relayInit = (o) => {
  o = o || {};
  if (!sessionStorage.getItem("__relayfresh")) { sessionStorage.setItem("__relayfresh", "1"); localStorage.removeItem("educata-scan-token"); localStorage.removeItem("educata-scan-label"); if (o.token) { localStorage.setItem("educata-scan-token", o.token); localStorage.setItem("educata-scan-label", "Gate 1"); } }
  if (o.fast) { const st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => st(fn, (ms || 0) / 50, ...a); }
  if (o.ua) Object.defineProperty(navigator, "userAgent", { get: () => o.ua });
  if (o.noStorage) { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "__db") return set.call(this, k, v); throw new DOMException("blocked", "QuotaExceededError"); }; }
  window.__calls = [];
  const chan = new BroadcastChannel("mockdb");
  chan.onmessage = (m) => { if (!window.__db) return; if (m.data.raw === undefined) delete window.__db[m.data.path]; else window.__db[m.data.path] = m.data.raw; };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  window.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null };
    window.__calls.push(call);
    if (o.netFail && window.__calls.length <= o.netFail) throw new TypeError("Failed to fetch");
    if (call.url === "https://relay.test/enroll") {
      if (o.enroll) return reply(o.enroll.status, o.enroll.body);
      return call.body.code === "123456" ? reply(200, { ok: true, token: "tok-ok", label: call.body.label, expiresAt: new Date(Date.now() + 48 * 3600e3).toISOString() }) : reply(400, { ok: false, error: "This code is wrong, expired or already used. Ask the gate lead for a new code." });
    }
    if (call.url === "https://relay.test/relay") {
      if (o.status) return reply(o.status, { ok: false });
      if (call.headers.Authorization !== "Bearer tok-ok") return reply(401, { ok: false });
      const ref = call.body.ref, hit = Object.entries(window.__db || {}).find(([k, v]) => k.startsWith("registrations/") && JSON.parse(v).ref === ref);
      if (!hit) return reply(404, { ok: false });
      const reg = JSON.parse(hit[1]), path = "scans/r" + Math.random().toString(36).slice(2, 10), raw = JSON.stringify({ ref, at: { __date: new Date().toISOString() }, by: "dev1" });
      window.__db[path] = raw; chan.postMessage({ path, raw });
      if (!reg.checkedIn) return reply(200, { ok: true, status: "new" });
      const at = reg.checkedInAt && reg.checkedInAt.__date ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(reg.checkedInAt.__date)) : undefined;
      return reply(200, { ok: true, status: "checked_in", at });
    }
    throw new TypeError("unexpected fetch " + url);
  };
};
const RELAY = { relay: "https://relay.test/relay", enroll: "https://relay.test/enroll" };
const phone = (path, o = {}, db, w = 390) => open(path, { db: db || mkdb() }, w, { init: relayInit, initArg: o, config: o.noConfig ? null : RELAY });
const phoneSays = (pg, t) => pg.waitForFunction((t) => document.getElementById("title").textContent.includes(t), { timeout: 8000 }, t);
const phoneState = (pg) => pg.evaluate(() => ({ cls: document.getElementById("box").className, title: document.getElementById("title").textContent, msg: document.getElementById("msg").textContent, ref: document.getElementById("ref").textContent, setup: !document.getElementById("setup").classList.contains("hidden"), warn: !document.getElementById("warn").classList.contains("hidden") && document.getElementById("warn").textContent, token: localStorage.getItem("educata-scan-token"), calls: window.__calls, bg: getComputedStyle(document.getElementById("box")).backgroundColor, body: document.body.innerText }));
// A write from "outside" (the relay function, another device): every open page's stand-in database receives it.
const extWrite = (pg, path, data) => pg.evaluate((path, raw) => new BroadcastChannel("mockdb").postMessage({ path, raw }), path, data === undefined ? undefined : JSON.stringify(data));
const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const PRIVATE = /Ama|Kofi|Mensah|Boateng|example\.com|Acme|Zed|0244000000/;

// ---- E: door.html (gate laptop): live participant list, search, scan cards, check-in ----
const regRef = "EDU26-AAAAAA";
// Kofi is stored before Ama on purpose, so the "sorted by name" check means something.
const mkdb = (extra = {}) => ({ ...baseDb(), "staff/staff1": JSON.stringify({ ok: true }),
  "registrations/kofi@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Kofi Boateng", email: "kofi@example.com", org: "Zed Corp", ref: "EDU26-BBBBBB", phone: "0244000000" }),
  "registrations/ama@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Ama Mensah", email: "ama@example.com", org: "Acme Ltd", ref: regRef }),
  "scans/old1": JSON.stringify({ ref: "EDU26-BBBBBB", at: { __date: new Date(Date.now() - 3600e3).toISOString() }, by: "old@x.com" }), ...extra });
const admin = { uid: "adm", email: "gate@x.com" };
const staff = { uid: "staff1", email: "phone1@x.com", staff: true };
const names = (pg) => pg.$$eval("#list button .rname", (a) => a.map((e) => e.textContent));
const search = async (pg, t) => { await pg.$eval("#search", (e) => { e.value = ""; e.dispatchEvent(new Event("input")); }); if (t) await pg.type("#search", t); return (await names(pg)).join("|"); };
const cardText = (pg) => pg.$eval("#cards .gcard", (e) => e.textContent);
let g = await open("/door.html", { db: mkdb(), user: admin }, 1200);
await g.waitForSelector("#live:not(.hidden)");
await g.waitForFunction(() => document.querySelectorAll("#list button").length === 2, { timeout: 5000 }); await new Promise(r => setTimeout(r, 300));
ok(await g.$eval("#wait", e => !e.classList.contains("ghidden")) && (await g.$$("#cards .gcard")).length === 0, "gate starts empty: old backlog scans are NOT replayed");
ok((await text(g, "#count")) === "In: 0 / 2", "gate counter shows In: 0 / 2 (from the live list)");
ok(!(await g.$("#loadall")) && !(await g.$("#go")) && !(await g.$("#q")), "door has no Load guest list button and no separate lookup box");
ok((await names(g)).join("|") === "Ama Mensah|Kofi Boateng", "door lists all participants automatically, sorted by name");
const row0 = await g.$eval("#list button", (b) => ({ org: b.querySelector(".rorg").textContent, grp: b.querySelector(".rgroup").textContent }));
ok(row0.org === "Acme Ltd" && row0.grp === "Premium Partners", "each row shows name, organisation and group");
const listText = await g.$eval("#list", (e) => e.textContent);
ok(!listText.includes("@") && !listText.includes("example.com") && !listText.includes("0244000000"), "participant list shows no email and no phone");
ok((await search(g, "ama m")) === "Ama Mensah", "search matches name");
ok((await search(g, "zed")) === "Kofi Boateng", "search matches organisation");
ok((await search(g, "kofi@exa")) === "Kofi Boateng", "search matches email");
ok((await search(g, "edu26-aaaa")) === "Ama Mensah", "search matches reference, any case");
ok((await search(g, "")) === "Ama Mensah|Kofi Boateng", "clearing the search shows everyone again");
await g.click("#hidelist");
ok(!(await g.evaluate(() => document.body.innerText.includes("Kofi Boateng") || document.body.innerText.includes("Ama Mensah"))) && (await text(g, "#hidelist")) === "Show list", "Hide list hides the names");
await g.click("#hidelist");
ok(await g.evaluate(() => document.body.innerText.includes("Kofi Boateng")), "Show list brings the names back (list is shown by default)");
// click a row: card with email, phone, reference and Check in
await (await g.$$("#list button"))[1].click(); await g.waitForSelector("#cards .gcard");
const kc = await cardText(g);
ok(kc.includes("Kofi Boateng") && kc.includes("kofi@example.com") && kc.includes("0244000000") && kc.includes("EDU26-BBBBBB") && kc.includes("Not checked in") && !!(await g.$("#cards .gcard button.bigbtn")), "clicking a row opens the card with email, phone, reference, status and Check in");
// failed save: button comes back with the error, nothing saved
await g.evaluate(() => { window.__failNext = true; });
await g.click("#cards .gcard button.bigbtn"); await g.waitForSelector("#cards .gcard .gerr", { timeout: 5000 });
ok(!!(await g.$("#cards .gcard button.bigbtn")) && (await text(g, "#cards .gcard .gerr")).includes("Check-in failed"), "a failed save brings the Check in button back and shows the error");
ok(!JSON.parse((await dump(g))["registrations/kofi@example.com"]).checkedIn, "a failed save does not check the participant in");
// slow save: the button must be gone before the save finishes
await g.evaluate(() => { window.__delayTx = 800; });
await g.click("#cards .gcard button.bigbtn");
ok((await g.$$("#cards .gcard button.bigbtn")).length === 0 && !(await g.$("#cards .gcard .gstatus.done")), "Check in button disappears at once, before the save finishes (no double clicks)");
await g.waitForSelector("#cards .gcard .gstatus.done", { timeout: 5000 });
ok((await text(g, "#cards .gcard .gstatus.done")) === "Checked in. Welcome.", "card shows green Checked in. Welcome.");
await g.evaluate(() => { window.__delayTx = 0; });
const kreg = JSON.parse((await dump(g))["registrations/kofi@example.com"]);
ok(kreg.checkedIn === true && kreg.checkedInBy === "gate@x.com" && !!kreg.checkedInAt, "check-in captured: flag, time and operator saved");
await new Promise(r => setTimeout(r, 1500));
ok(!!(await g.$("#cards .gcard .gstatus.done")), "confirmation is still showing after 1.5 seconds");
await g.waitForFunction(() => document.querySelectorAll("#cards .gcard").length === 0, { timeout: 4000 });
ok(await g.$eval("#wait", e => !e.classList.contains("ghidden")), "card clears itself after about 3 seconds, ready for the next scan");
ok((await text(g, "#count")) === "In: 1 / 2", "counter updates to In: 1 / 2 from the live list");
ok(await g.$$eval("#list button", (bs) => bs.find((b) => b.textContent.includes("Kofi")).querySelector(".badge")?.textContent === "In" && !bs.find((b) => b.textContent.includes("Ama")).querySelector(".badge")), "list shows an In badge only for the participant already checked in");
// phone scans Ama's QR link with the Camera app: scan.html posts it to the relay (stand-in), which hands it to the gate
let ph = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok" }, await dump(g));
await phoneSays(ph, "Sent to the gate laptop");
const ps1 = await phoneState(ph);
ok(ps1.cls === "box sent" && ps1.ref === regRef && ps1.bg === "rgb(31, 122, 77)", "phone shows the green 'Sent to the gate laptop' with the reference");
const c1 = ps1.calls[0];
ok(ps1.calls.length === 1 && c1.url === RELAY.relay && c1.method === "POST" && c1.headers.Authorization === "Bearer tok-ok" && c1.headers["Content-Type"] === "application/json" && JSON.stringify(c1.body) === JSON.stringify({ ref: regRef }), "phone posts {ref} as JSON to RELAY_URL once, with its token as Bearer");
await snap(ph, nodePath.join(OUT, "phone_390.png"));
await g.waitForSelector("#cards .gcard", { timeout: 5000 }); await new Promise(r => setTimeout(r, 300));
ok((await text(g, "#cards .gcard .gname")) === "Ama Mensah", "phone scan shows the participant's card on the door automatically");
ok((await text(g, "#cards .gcard .gstatus")).includes("Not checked in"), "gate shows not-checked-in status");
await snap(g, nodePath.join(OUT, "gate_new_1200.png"));
await g.click("#cards .gcard button.bigbtn"); await g.waitForSelector("#cards .gcard .gstatus.done");
await g.waitForFunction(() => document.querySelectorAll("#cards .gcard").length === 0, { timeout: 5000 });
ok(JSON.parse((await dump(g))["registrations/ama@example.com"]).checkedIn === true, "scanned participant checked in, card cleared");
// same QR scanned again later by another phone: red panel on the phone, red card on the gate. A rescan within 20 seconds of
// check-in is only a grey notice (section E5), so the check-in is moved 10 minutes back first, as if Ama came back later.
for (const who of ["ama", "kofi"]) { const a = JSON.parse((await dump(g))[`registrations/${who}@example.com`]); if (!a.checkedIn) continue; a.checkedInAt = { __date: new Date(Date.now() - 600e3).toISOString() }; await extWrite(g, `registrations/${who}@example.com`, a); }
await new Promise(r => setTimeout(r, 300));
let ph2 = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok" }, await dump(g));
await phoneSays(ph2, "ALREADY CHECKED IN");
const ps2 = await phoneState(ph2);
ok(ps2.cls === "box dup" && /^ALREADY CHECKED IN at \d{2}:\d{2}$/.test(ps2.title) && ps2.msg === "Check ID. The gate screen has this participant." && ps2.ref === regRef && ps2.bg === "rgb(179, 38, 30)", `phone shows the red '${ps2.title}' panel with the reference and 'Check ID. The gate screen has this participant.'`);
ok(!PRIVATE.test(ps2.body), "red panel shows no name or other participant details");
await snap(ph2, nodePath.join(OUT, "scan_already_390.png"));
await g.waitForFunction(() => document.querySelector("#cards .gcard .gstatus.dup"), { timeout: 5000 });
ok((await text(g, "#cards .gcard .gstatus")).includes("ALREADY CHECKED IN"), "the scan still reaches the gate: red ALREADY CHECKED IN card there too");
ok((await g.$$("#cards .gcard")).length === 1, "same participant is not duplicated in the cards");
ok(!!(await g.$("#cards .gcard button.dismiss")) && !!(await g.$("#cards .gcard button.undo")) && !(await g.$("#cards .gcard button.bigbtn")), "already-checked-in card has Dismiss and Undo check-in, and no Check in");
await snap(g, nodePath.join(OUT, "gate_dup_1200.png"));
await new Promise(r => setTimeout(r, 3800));
ok((await g.$$("#cards .gcard .gstatus.dup")).length === 1, "already-checked-in card stays after 3.8 seconds (until dismissed)");
// another participant scanned: shows on top, earlier card kept below
let ph3 = await phone(`/scan.html?ref=EDU26-BBBBBB`, { token: "tok-ok" }, await dump(g));
await phoneSays(ph3, "ALREADY CHECKED IN");
await g.waitForFunction(() => document.querySelector("#cards .gcard .gname")?.textContent === "Kofi Boateng", { timeout: 5000 });
ok((await g.$$("#cards .gcard")).length === 2, "second participant shows on top, first card kept below");
await g.click("#cards .gcard button.dismiss");
ok((await g.$$("#cards .gcard")).length === 1 && (await text(g, "#cards .gcard .gname")) === "Ama Mensah", "Dismiss removes only that card");
// unknown reference: the relay refuses it (404), nothing reaches the gate, the phone says so
let ph4 = await phone(`/scan.html?ref=EDU26-ZZZZZZ`, { token: "tok-ok" }, await dump(g));
await phoneSays(ph4, "not recognised"); await new Promise(r => setTimeout(r, 500));
ok((await text(ph4, "#title")) === "This QR code is not recognised. Ask the participant for their reference." && (await g.$$("#cards .gcard")).length === 1, "unknown reference: phone says not recognised, the gate gets nothing");
{ const gz = await open("/door.html?ref=EDU26-ZZZZZZ", { db: mkdb(), user: admin }, 1200); await gz.waitForFunction(() => document.querySelector("#cards .gcard .gstatus.missing"), { timeout: 5000 });
  ok((await text(gz, "#cards .gcard .gstatus")).includes("No registration found"), "unknown ref opened on the gate shows No registration found"); await gz.close(); }
ok(![ph, ph2, ph3, ph4].length || !(await Promise.all([ph, ph2, ph3, ph4].map((p) => p.evaluate(() => document.body.innerText)))).some((t) => PRIVATE.test(t)), "phone pages show no participant personal details");
// gate guards
let gl = await open("/door.html", { db: mkdb(), user: null }, 1200); await gl.waitForSelector("#login:not(.hidden)"); ok(!(await gl.$eval("#live", e => !e.classList.contains("hidden"))), "signed-out gate shows only sign-in");
let gs = await open("/door.html", { db: mkdb(), user: staff }, 1200); await gs.waitForFunction(() => document.getElementById("loginerr").textContent.includes("not on the admin list"), { timeout: 5000 }); ok(true, "staff-only account cannot open the gate screen");
await g.close();

// ---- E2: scan.html on a staff phone: every state (stand-in relay; no Firebase on the phone) ----
{
  const src = fs.readFileSync(nodePath.join(ROOT, "scan.html"), "utf8");
  console.log(`  scan.html is ${src.length} bytes (${(src.length / 1024).toFixed(1)} KB, limit 15 KB)`);
  ok(Buffer.byteLength(src) < 15 * 1024, `scan.html is under 15 KB (${Buffer.byteLength(src)} bytes)`);
  ok(!/gstatic.com|firebasejs|firebase-|jsqr.js|<script[^>]+src=/i.test(src) && [...src.matchAll(/import [^;]+ from "([^"]+)"/g)].map((m) => m[1]).join() === "./config.js,./core.js", "scan.html: no Firebase SDK and no libraries (imports only ./config.js and ./core.js)");
  // (a) no token: set up; a wrong code is refused; the right code stores the token
  const pa = await phone("/scan.html", {});
  await phoneSays(pa, "Set up this phone");
  let st = await phoneState(pa);
  ok(st.setup && (await pa.$eval("#label", (e) => e.placeholder)) === "Gate 1" && (await pa.$eval("#go", (e) => e.textContent)) === "Set up this phone" && st.calls.length === 0, "no token: 'Set up this phone' with a code box and a name box (Gate 1), nothing sent");
  await pa.type("#code", "12345"); await pa.type("#label", "Gate 1"); await pa.click("#go");
  ok((await text(pa, "#err")) === "Type the 6-digit code shown on the gate laptop." && (await phoneState(pa)).calls.length === 0, "a 5-digit code is refused on the phone, nothing sent");
  await pa.type("#code", "9"); await pa.click("#go");
  await pa.waitForFunction(() => document.getElementById("err").textContent.includes("wrong, expired"), { timeout: 5000 });
  ok((await phoneState(pa)).token === null, "wrong code: the relay's message is shown, no token stored");
  await pa.$eval("#code", (e) => { e.value = ""; }); await pa.type("#code", "123456"); await pa.click("#go");
  await phoneSays(pa, "Phone ready");
  st = await phoneState(pa);
  const ec = st.calls[st.calls.length - 1];
  ok(st.token === "tok-ok" && (await pa.evaluate(() => localStorage.getItem("educata-scan-label"))) === "Gate 1" && st.title === "Phone ready" && ec.url === RELAY.enroll && JSON.stringify(ec.body) === JSON.stringify({ code: "123456", label: "Gate 1" }) && !ec.headers.Authorization, "right code: token stored in localStorage (educata-scan-token), 'Phone ready'");
  ok((await text(pa, "#foot")) === "This phone: Gate 1", "footer names the phone");
  await snap(pa, nodePath.join(OUT, "scan_ready_390.png"));
  // (d) token, no reference
  await pa.reload(); await phoneSays(pa, "Phone ready. Scan");
  ok((await text(pa, "#title")) === "Phone ready. Scan a participant's QR code with the Camera app." && !(await phoneState(pa)).setup, "token and no reference: 'Phone ready. Scan a participant's QR code with the Camera app.'");
  // (c) a valid reference but no token: nothing is sent
  const pc = await phone(`/scan.html?ref=${regRef}`, {});
  await phoneSays(pc, "for gate staff"); st = await phoneState(pc);
  ok(st.title === "This QR code is for gate staff. Show it at the gate." && st.calls.length === 0 && !st.setup && !st.ref, "valid reference without a token: 'This QR code is for gate staff. Show it at the gate.', nothing sent");
  await snap(pc, nodePath.join(OUT, "scan_guest_390.png"));
  // a broken reference with a token: not sent
  const pg2 = await phone("/scan.html?ref=garbage", { token: "tok-ok" }); await phoneSays(pg2, "not recognised");
  ok((await phoneState(pg2)).calls.length === 0, "broken reference: 'not recognised', nothing sent");
  // 401: the token is deleted
  const pr = await phone(`/scan.html?ref=${regRef}`, { token: "tok-revoked" }); await phoneSays(pr, "no longer set up"); st = await phoneState(pr);
  ok(st.title === "This phone is no longer set up. Ask the gate lead for a new code." && st.token === null && (await pr.evaluate(() => localStorage.getItem("educata-scan-label"))) === null, "401: 'This phone is no longer set up. Ask the gate lead for a new code.' and the stored token is deleted");
  // 429
  const pq = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok", status: 429 }); await phoneSays(pq, "too quickly");
  ok((await text(pq, "#title")) === "Scanned too quickly. Wait a moment." && (await text(pq, "#ref")) === regRef, "429: 'Scanned too quickly. Wait a moment.'");
  // network errors: 5 retries with backoff, then Not sent; a network that comes back on the 3rd try sends
  const pn = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok", netFail: 99, fast: true }); await phoneSays(pn, "Not sent");
  st = await phoneState(pn);
  ok(st.title === "Not sent. Check your connection and scan again." && st.calls.length === 6, `network down: ${st.calls.length - 1} retries, then 'Not sent. Check your connection and scan again.'`);
  const pn5 = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok", status: 503, fast: true }); await phoneSays(pn5, "Not sent");
  ok((await phoneState(pn5)).calls.length === 6, "server error 503: retried 5 times too");
  const pn2 = await phone("/scan.html?ref=EDU26-BBBBBB", { token: "tok-ok", netFail: 2, fast: true }); await phoneSays(pn2, "Sent to the gate laptop");
  ok((await phoneState(pn2)).calls.length === 3, "network back on the 3rd try: the scan is sent (3 attempts)");
  // not configured
  const pnc = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok", noConfig: true }); await phoneSays(pnc, "Scanner not configured");
  ok((await phoneState(pnc)).calls.length === 0, "RELAY_URL or ENROLL_URL empty: 'Scanner not configured', nothing sent");
  // in-app browsers and blocked storage
  for (const [label, ua] of [["Facebook", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0]"], ["Instagram", "Mozilla/5.0 (iPhone) Instagram 300.0"], ["WhatsApp", "Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile Safari/537.36 WhatsApp/2.24"], ["LINE", "Mozilla/5.0 (iPhone) Line/13.0.0"], ["Google app", "Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile Safari/537.36 GSA/15.18.38"]]) {
    const ia = await phone("/scan.html", { ua }); await phoneSays(ia, "Set up this phone");
    ok((await phoneState(ia)).warn === "Open this link in Chrome or Safari so this phone stays set up.", `${label} in-app browser: 'Open this link in Chrome or Safari so this phone stays set up.'`);
    if (label === "Facebook") await snap(ia, nodePath.join(OUT, "scan_inapp_390.png"));
    await ia.close();
  }
  ok(!(await phoneState(pa)).warn, "Chrome: no warning");
  const pm = await phone("/scan.html", { noStorage: true }); await phoneSays(pm, "Set up this phone"); st = await phoneState(pm);
  ok(st.warn === "Open this link in Chrome or Safari so this phone stays set up." && !st.setup && st.msg === "This browser cannot keep the setup.", "storage blocked (private mode): warning, no setup form (a code would be wasted)");
  const all = [pa, pc, pg2, pr, pq, pn, pn5, pn2, pnc, pm];
  ok(!(await Promise.all(all.map((p) => p.evaluate(() => document.body.innerText)))).some((t) => PRIVATE.test(t)), "no phone state shows any participant detail");
  for (const p of all) await p.close();
}

// ---- E3: gate laptop: Scanning phones panel (code, live list, revoke) ----
{
  const later = (h) => ({ __date: new Date(Date.now() + h * 3600e3).toISOString() });
  const dev = (label, over = {}) => ({ tokenHash: "f".repeat(64), label, createdAt: later(-1), expiresAt: later(47), revoked: false, lastSeen: later(-2 / 60), ...over });
  const gp = await open("/door.html", { db: mkdb({ "devices/dev1": JSON.stringify(dev("Gate 1")), "devices/dev0": JSON.stringify(dev("Old phone", { revoked: true })), "devices/devx": JSON.stringify(dev("<img src=x onerror=window.__xss=1>", { lastSeen: null })) }), user: admin }, 1200);
  await gp.waitForSelector("#live:not(.hidden)");
  await gp.waitForFunction(() => document.querySelectorAll("#devices .dev").length === 2, { timeout: 5000 });
  const rows = () => gp.$$eval("#devices .dev", (r) => r.map((e) => e.textContent));
  let rs = await rows();
  ok(rs.some((t) => t.startsWith("Gate 1") && t.includes("last seen 2 min ago") && t.includes("expires")) && !rs.some((t) => t.includes("Old phone")), "phone list: label, last seen as time ago, expiry; revoked phones are not listed " + JSON.stringify(rs));
  ok(rs.some((t) => t.startsWith("<img src=x")) && !(await gp.evaluate(() => window.__xss)) && !(await gp.$("#devices img")), "a hostile phone name is shown as text, never as HTML");
  ok((await text(gp, "#phonenote")) === "(2 active)" && (await text(gp, "#phonehelp")).includes("participants"), "panel 'Scanning phones (2 active)' with help text for participants' QR codes");
  // Add scanning phone: a random 6-digit code, stored only as its SHA-256 hash, 5 minutes
  await gp.click("#addphone"); await gp.waitForFunction(() => /^\d{6}$/.test(document.getElementById("enrollcode").textContent), { timeout: 5000 });
  const code = await text(gp, "#enrollcode"); let db = await dump(gp);
  const codes = Object.keys(db).filter((k) => k.startsWith("enrollCodes/"));
  const cd = JSON.parse(db["enrollCodes/" + sha256(code)] || "null");
  ok(codes.length === 1 && cd && cd.used === false && Math.abs(new Date(cd.expiresAt.__date) - Date.now() - 5 * 60e3) < 15e3 && !!cd.createdAt && Object.keys(cd).sort().join() === "createdAt,expiresAt,used", "Add scanning phone writes enrollCodes/<sha256 of the code> {createdAt, expiresAt now + 5 minutes, used:false}");
  ok(!JSON.stringify(Object.entries(db).filter(([k]) => !k.startsWith("registrations/"))).includes(code), "the code itself is not stored anywhere");
  ok((await gp.$eval("#enrollcode", (e) => parseFloat(getComputedStyle(e).fontSize))) >= 48, "the code is shown large");
  const t1 = await text(gp, "#codetime"); await new Promise((r) => setTimeout(r, 1300)); const t2 = await text(gp, "#codetime");
  ok(/^Type this code on the phone\. It works once, for [45]:\d\d more\.$/.test(t1) && t1 !== t2, `5-minute countdown runs (${t1} then ${t2})`);
  await snap(gp, nodePath.join(OUT, "gate_phones_code_1200.png"), { fullPage: true });
  // the phone enrols: the function creates the device; the list updates live and the code box says so
  await extWrite(gp, "devices/dev2", dev("Gate 2", { lastSeen: later(0) }));
  await gp.waitForFunction(() => document.querySelectorAll("#devices .dev").length === 3, { timeout: 5000 });
  await gp.waitForFunction(() => document.getElementById("codetime").textContent.startsWith("Phone added: Gate 2"), { timeout: 5000 });
  ok((await text(gp, "#enrollcode")) === "" && (await text(gp, "#phonenote")) === "(3 active)", "new phone appears live; the code is hidden and 'Phone added: Gate 2' shown");
  // a second code is a new random code with its own document
  await gp.click("#addphone"); await gp.waitForFunction((c) => /^\d{6}$/.test(document.getElementById("enrollcode").textContent), { timeout: 5000 }, code);
  ok(Object.keys(await dump(gp)).filter((k) => k.startsWith("enrollCodes/")).length === 2, "each Add scanning phone creates a new code");
  // Revoke one
  await gp.$$eval("#devices .dev", (r) => r.find((e) => e.textContent.startsWith("Gate 1")).querySelector("button").click());
  await gp.waitForFunction(() => document.querySelectorAll("#devices .dev").length === 2, { timeout: 5000 });
  db = await dump(gp);
  ok(JSON.parse(db["devices/dev1"]).revoked === true && JSON.parse(db["devices/dev2"]).revoked === false && !(await rows()).some((t) => t.startsWith("Gate 1")), "Revoke sets revoked:true and the phone disappears from the list");
  // Revoke all phones: asks first; Cancel does nothing
  gp.once("dialog", (d) => d.dismiss()); await gp.click("#revokeall"); await new Promise((r) => setTimeout(r, 300));
  ok((await gp.$$("#devices .dev")).length === 2, "Revoke all phones, Cancel: nothing revoked");
  let msg = ""; gp.once("dialog", (d) => { msg = d.message(); d.accept(); }); await gp.click("#revokeall");
  await gp.waitForFunction(() => document.querySelectorAll("#devices .dev").length === 0, { timeout: 5000 });
  db = await dump(gp);
  ok(msg === "Revoke all 2 phones? Each will need a new code." && ["dev0", "dev1", "dev2", "devx"].every((id) => JSON.parse(db["devices/" + id]).revoked === true) && (await text(gp, "#devices")) === "No phones set up yet." && (await gp.$eval("#revokeall", (e) => e.classList.contains("ghidden"))), "Revoke all phones: asks, revokes every phone, list empty");
  await gp.close();
}

// ---- E4: Undo check-in on the gate (door.html only) ----
{
  const ama = JSON.parse(mkdb()["registrations/ama@example.com"]);
  const udb = mkdb({ "registrations/ama@example.com": JSON.stringify({ ...ama, checkedIn: true, checkedInAt: { __date: new Date(Date.now() - 600e3).toISOString() }, checkedInBy: "gate@x.com" }) });
  const u1 = await open("/door.html", { db: udb, user: admin }, 1200), u2 = await open("/door.html", { db: udb, user: { uid: "adm", email: "second@x.com" } }, 1200);
  for (const u of [u1, u2]) await u.waitForFunction(() => document.querySelectorAll("#list button").length === 2 && document.getElementById("count").textContent === "In: 1 / 2", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 300));
  await extWrite(u1, "scans/rep1", { ref: regRef, at: { __date: new Date().toISOString() }, by: "dev1" });
  for (const u of [u1, u2]) await u.waitForSelector("#cards .gcard .gstatus.dup", { timeout: 5000 });
  ok(!!(await u1.$("#cards .gcard button.undo")) && (await text(u1, "#cards .gcard button.undo")) === "Undo check-in", "repeat scan: red card with Undo check-in on both admin laptops");
  // Cancel does nothing
  let asked = ""; u1.once("dialog", (d) => { asked = d.message(); d.dismiss(); }); await u1.click("#cards .gcard button.undo"); await new Promise((r) => setTimeout(r, 400));
  let reg = JSON.parse((await dump(u1))["registrations/ama@example.com"]);
  ok(asked === "Undo check-in for Ama Mensah?" && reg.checkedIn === true && !!reg.checkedInAt && !!(await u1.$("#cards .gcard .gstatus.dup")) && (await text(u1, "#count")) === "In: 1 / 2", "Undo asks 'Undo check-in for Ama Mensah?'; Cancel changes nothing");
  // Confirm: one transaction; the card says Check-in undone and Check in returns
  u1.once("dialog", (d) => d.accept()); await u1.click("#cards .gcard button.undo");
  await u1.waitForSelector("#cards .gcard .gstatus.undone", { timeout: 5000 });
  reg = JSON.parse((await dump(u1))["registrations/ama@example.com"]);
  ok(reg.checkedIn === false && !("checkedInAt" in reg) && reg.undoneBy === "gate@x.com" && !!reg.undoneAt, "undo saved: checkedIn false, checkedInAt cleared, undoneBy (admin email) and undoneAt recorded");
  ok((await text(u1, "#cards .gcard .gstatus")).startsWith("Check-in undone") && !!(await u1.$("#cards .gcard button.bigbtn")) && !(await u1.$("#cards .gcard button.undo")), "card shows 'Check-in undone' and the normal Check in button returns");
  await u1.waitForFunction(() => document.getElementById("count").textContent === "In: 0 / 2", { timeout: 5000 });
  ok(!(await u1.$$eval("#list button", (bs) => bs.find((b) => b.textContent.includes("Ama")).querySelector(".badge"))), "counter In: 0 / 2 and the In badge is gone");
  await snap(u1, nodePath.join(OUT, "gate_undone_1200.png"));
  // the second admin sees it live, without refresh, and can check the participant in again
  await u2.waitForFunction(() => document.getElementById("count").textContent === "In: 0 / 2" && document.querySelector("#cards .gcard .gstatus.undone") && document.querySelector("#cards .gcard button.bigbtn"), { timeout: 5000 });
  ok(true, "second admin laptop: counter and card change live (Check-in undone, Check in button back)");
  await u2.click("#cards .gcard button.bigbtn"); await u2.waitForSelector("#cards .gcard .gstatus.done", { timeout: 5000 });
  reg = JSON.parse((await dump(u2))["registrations/ama@example.com"]);
  ok(reg.checkedIn === true && reg.checkedInBy === "second@x.com" && !!reg.checkedInAt, "the participant can be checked in again afterwards");
  await u1.waitForFunction(() => document.getElementById("count").textContent === "In: 1 / 2" && document.querySelector("#cards .gcard .gstatus.dup"), { timeout: 5000 });
  ok(true, "first laptop follows live: In: 1 / 2 and the card is ALREADY CHECKED IN again");
  await u1.close(); await u2.close();
}

// ---- E5: repeat scans of one reference on the gate (several phones, or a QR held in view) ----
{
  const ama = JSON.parse(mkdb()["registrations/ama@example.com"]);
  const gr = await open("/door.html", { db: mkdb({ "registrations/old@example.com": JSON.stringify({ ...ama, email: "old@example.com", name: "Olu Old", ref: "EDU26-OLDOLD", checkedIn: true, checkedInAt: { __date: new Date(Date.now() - 25e3).toISOString() }, checkedInBy: "gate@x.com" }) }), user: admin }, 1200);
  await gr.waitForFunction(() => document.querySelectorAll("#list button").length === 3, { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
  // count beeps: sound on, AudioContext replaced by a counter
  await gr.evaluate(() => { window.__beeps = 0; window.AudioContext = class { constructor() { window.__beeps++; } createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; } close() {} }; const s = document.getElementById("sound"); if (!s.checked) s.click(); });
  let n = 0; const scan = (ref) => extWrite(gr, "scans/e5_" + (++n), { ref, at: { __date: new Date().toISOString() }, by: "dev" + n });
  const cards = () => gr.$$eval("#cards .gcard", (cs) => cs.map((c) => ({ name: c.querySelector(".gname").textContent, st: c.querySelector(".gstatus").className, text: c.querySelector(".gstatus").textContent })));
  // (1) three phones send the same not-checked-in reference at once: one card, one beep
  await Promise.all([scan(regRef), scan(regRef), scan(regRef)]);
  await gr.waitForSelector("#cards .gcard .gstatus.new", { timeout: 5000 }); await new Promise((r) => setTimeout(r, 600));
  let cs = await cards(), beeps = await gr.evaluate(() => window.__beeps);
  ok(cs.length === 1 && cs[0].name === "Ama Mensah" && beeps === 1, `three phones, same reference at once: one card, one beep (${cs.length} card, ${beeps} beep)`);
  await scan(regRef); await new Promise((r) => setTimeout(r, 600));
  cs = await cards(); beeps = await gr.evaluate(() => window.__beeps);
  ok(cs.length === 1 && cs[0].st === "gstatus new" && beeps === 1 && !!(await gr.$("#cards .gcard button.bigbtn")), "a later scan of an open not-checked-in card: card refreshed, no second beep, Check in still there");
  // (2) checked in, then scanned again within 20 seconds (two phones): calm grey notice for 5 seconds, not the red card
  await gr.click("#cards .gcard button.bigbtn"); await gr.waitForSelector("#cards .gcard .gstatus.done", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1000));
  await Promise.all([scan(regRef), scan(regRef)]);
  await gr.waitForSelector("#cards .gcard .gstatus.recent", { timeout: 5000 }); await new Promise((r) => setTimeout(r, 400));
  cs = await cards();
  const grey = await gr.$eval("#cards .gcard .gstatus", (e) => getComputedStyle(e).backgroundColor);
  ok(cs.length === 1 && /^Just checked in at \d{2}:\d{2}:\d{2}$/.test(cs[0].text) && grey === "rgb(230, 230, 230)" && !(await gr.$("#cards .gstatus.dup")) && !(await gr.$("#cards button.undo")), `rescan within 20 s of check-in: one grey '${cs[0].text}', no red card, no Undo`);
  await snap(gr, nodePath.join(OUT, "gate_recent_1200.png"));
  await new Promise((r) => setTimeout(r, 2500));
  ok((await gr.$$("#cards .gcard .gstatus.recent")).length === 1, "grey notice still showing after 3 seconds");
  await gr.waitForFunction(() => !document.querySelector("#cards .gcard"), { timeout: 4000 });
  ok(true, "grey notice clears itself after about 5 seconds");
  // (3) checked in more than 20 seconds ago: red card as before, with Dismiss and Undo
  const b0 = await gr.evaluate(() => window.__beeps);
  await scan("EDU26-OLDOLD");
  await gr.waitForSelector("#cards .gcard .gstatus.dup", { timeout: 5000 });
  ok((await text(gr, "#cards .gcard .gstatus")).startsWith("ALREADY CHECKED IN at") && !!(await gr.$("#cards .gcard button.undo")) && !!(await gr.$("#cards .gcard button.dismiss")) && (await gr.evaluate(() => window.__beeps)) === b0 + 1, "rescan 25 s after check-in: red ALREADY CHECKED IN card with Dismiss and Undo, and the beep");
  await new Promise((r) => setTimeout(r, 5500));
  ok((await gr.$$("#cards .gcard .gstatus.dup")).length === 1, "red card stays until dismissed");
  await gr.close();
}
// ---- F: admin.html: no check-in controls, live updates from door.html in a separate window ----
const fdb = () => mkdb({ "registrations/zed@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Zed Other", email: "zed@example.com", org: "Zed Co", ref: "EDU26-CCCCCC" }) });
let ad = await open("/admin.html", { db: fdb(), user: admin }, 1200);
await ad.waitForSelector("#app:not(.hidden)");
await ad.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 3, { timeout: 5000 });
ok(true, "admin page lists all 3 registrations");
ok(!(await ad.$("#gate")) && !(await ad.$("#cards")) && !(await ad.evaluate(() => document.body.innerText.toLowerCase().includes("live gate"))), "admin has no Live gate panel");
ok(!(await ad.evaluate(() => [...document.querySelectorAll("button")].some((b) => /check in/i.test(b.textContent)))), "admin has no Check in button anywhere");
ok(!(await ad.evaluate(() => [...document.querySelectorAll("button")].some((b) => /undo/i.test(b.textContent)))), "admin has no Undo check-in button");
ok(!(await ad.$('a[href*="door"]')) && !(await ad.evaluate(() => [...document.scripts].some((s) => s.textContent.includes("gate.js") || (s.src || "").includes("gate.js")))), "admin has no gate link and does not import gate.js");
const zedRow = () => ad.$$eval("#regs tbody tr", (trs) => trs.find((t) => t.textContent.includes("Zed Other"))?.textContent || "");
ok(!(await zedRow()).includes("Checked in"), "admin shows Zed as not checked in (blank)");
// check Zed in on a SEPARATE door window: admin must update without refresh
let d2 = await open("/door.html", { db: fdb(), user: admin }, 1200);
await d2.waitForFunction(() => document.querySelectorAll("#list button").length === 3, { timeout: 5000 });
await search(d2, "zed other"); await d2.click("#list button"); await d2.waitForSelector("#cards .gcard button.bigbtn");
await d2.click("#cards .gcard button.bigbtn"); await d2.waitForSelector("#cards .gcard .gstatus.done");
await ad.waitForFunction(() => [...document.querySelectorAll("#regs tbody tr")].some((t) => t.textContent.includes("Zed Other") && /Checked in \d/.test(t.textContent)), { timeout: 5000 });
ok(true, "check-in on door.html appears in a separate admin window without refresh, as read-only text with the time");
await snap(ad, nodePath.join(OUT, "admin_1200.png"));
// new registration on the public page appears live, with the seat count
const seats = () => ad.$eval("#groups tbody tr td:nth-child(2)", (e) => e.textContent);
ok((await seats()) === "1 / 3", "admin seat count starts at 1 / 3");
let nr = await open("/index.html?c=CODEOK0001", { db: fdb() });
await nr.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
await nr.type("#name", "Yaw Live"); await nr.type("#org", "New Co"); await nr.type("#email", "yaw@example.com"); await nr.click("#consent"); await nr.click("#submit");
await nr.waitForSelector("#done:not(.hidden)");
await ad.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 4 && document.querySelector("#groups tbody tr td:nth-child(2)").textContent === "2 / 3", { timeout: 5000 });
ok(true, "new registration and its seat count appear on admin without refresh");
await d2.waitForFunction(() => document.getElementById("count").textContent === "In: 1 / 4", { timeout: 5000 });
ok(true, "door counter follows the live list (In: 1 / 4)");
// Remove frees the seat; admin and door update live
ad.on("dialog", (dl) => dl.accept());
await ad.$$eval("#regs tbody tr", (trs) => trs.find((t) => t.textContent.includes("Yaw Live")).querySelector("button.danger").click());
await ad.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 3 && document.querySelector("#groups tbody tr td:nth-child(2)").textContent === "1 / 3", { timeout: 5000 });
ok(true, "Remove frees the seat and the admin table updates without refresh");
await d2.waitForFunction(() => document.getElementById("count").textContent === "In: 1 / 3" && !document.getElementById("list").textContent.includes("Yaw Live"), { timeout: 5000 });
ok(true, "removed participant disappears from the door list live");

// ---- H: Save ticket image works and the saved QR decodes ----
let tk = await open("/index.html?c=CODEOK0001", { db: baseDb() });
await tk.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
await tk.type("#name", "Efua Owusu-Ansah"); await tk.type("#org", "Acme Ltd"); await tk.type("#email", "efua@example.com"); await tk.click("#consent"); await tk.click("#submit");
await tk.waitForSelector("#done:not(.hidden)"); await tk.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif"), { timeout: 5000 });
const tref = await text(tk, "#doneref");
// The share sheet cannot be driven here, so force the download path.
await tk.evaluate(() => { window.__dl = null; Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }); HTMLAnchorElement.prototype.click = function () { window.__dl = { name: this.download, href: this.href }; }; });
await tk.click("#save"); await tk.waitForFunction(() => window.__dl, { timeout: 8000 });
const dl = await tk.evaluate(() => window.__dl);
ok(dl.name === `educata-2026-ticket-${tref}.png`, "Save ticket image downloads " + dl.name);
const px = await tk.evaluate(async (href) => { const b = await (await fetch(href)).blob(); const bmp = await createImageBitmap(b); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const x = c.getContext("2d"); x.drawImage(bmp, 0, 0); const d = x.getImageData(100, 360, 700, 720); return { w: bmp.width, h: bmp.height, data: Array.from(d.data) }; }, dl.href);
ok(px.w === 900 && px.h === 1240, "saved ticket image is 900 x 1240");
const top = await tk.evaluate(async (href) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const grab = (img, x, y, w, h, dw = img.width, dh = img.height) => { const c = document.createElement("canvas"); c.width = dw; c.height = dh; const g = c.getContext("2d"); g.drawImage(img, 0, 0, dw, dh); return g.getImageData(x, y, w, h).data; };
  const ticket = await createImageBitmap(await (await fetch(href)).blob()), banner = await load("assets/banner-source.jpg");
  const a = grab(ticket, 0, 0, 900, 360), b = grab(banner, 0, 0, 900, 360, 900, 360); let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  const edge = grab(ticket, 450, 362, 1, 1); return { diff: diff / (900 * 360 * 3), edge: [...edge].slice(0, 3) };
}, dl.href);
ok(top.diff < 4 && top.edge.join() === "236,130,35", `saved ticket: the official banner fills the top 900 x 360 (average difference ${top.diff.toFixed(2)} of 255), orange edge below it`);
const q = jsQR(new Uint8ClampedArray(px.data), 700, 720);
ok(q && q.data === `${SCAN_BASE}scan.html?ref=${tref}`, "QR inside the saved ticket image decodes to the scan link");
// Footer text (the organiser's full name) must sit inside the 60 px side margins, not run off the image.
const foot = await tk.evaluate(async (href) => { const bmp = await createImageBitmap(await (await fetch(href)).blob()); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const x = c.getContext("2d"); x.drawImage(bmp, 0, 0); const d = x.getImageData(0, 1150, bmp.width, 80).data; let min = 1e9, max = -1; for (let i = 0; i < d.length; i += 4) if (d[i] < 180) { const col = (i / 4) % bmp.width; min = Math.min(min, col); max = Math.max(max, col); } return { min, max }; }, dl.href);
ok(foot.max > 0 && foot.min >= 55 && foot.max <= 845, `saved ticket footer fits inside the image (text from x=${foot.min} to x=${foot.max} of 900)`);
const dataUrl = await tk.evaluate(async (href) => { const b = await (await fetch(href)).blob(); return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }, dl.href);
const vp = await browser.newPage(); await vp.setViewport({ width: 450, height: 620 }); await vp.setContent(`<body style="margin:0"><img src="${dataUrl}" style="width:450px"></body>`); await new Promise(r => setTimeout(r, 300)); await snap(vp, nodePath.join(OUT, "saved_ticket.png"));

// ---- I: print layout ----
let pr = await open("/index.html?c=CODEOK0001", { db: baseDb() });
await pr.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
await pr.type("#name", "Efua Owusu-Ansah"); await pr.type("#org", "Acme Ltd"); await pr.type("#email", "efua2@example.com"); await pr.click("#consent"); await pr.click("#submit");
await pr.waitForSelector("#done:not(.hidden)"); await new Promise(r => setTimeout(r, 400));
await pr.emulateMediaType("print");
const lay = await pr.evaluate(() => { const vis = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).display !== "none" : false; }; const r = document.querySelector("#done .ticket").getBoundingClientRect(); return { hero: vis(".hero"), steps: vis(".steps"), buttons: vis("#save") || vis("#print"), ticket: r.width > 200 && r.height > 200, stubBg: getComputedStyle(document.querySelector("#done .stub")).backgroundColor, stubAdjust: getComputedStyle(document.querySelector("#done .stub")).printColorAdjust || getComputedStyle(document.querySelector("#done .stub")).webkitPrintColorAdjust }; });
ok(!lay.hero && !lay.steps && !lay.buttons && lay.ticket, "print layout: only the ticket shows (no hero, steps or buttons)");
ok(lay.stubAdjust === "exact", "print layout: dark header keeps its colours (print-color-adjust exact)");
await snap(pr, nodePath.join(OUT, "print_390.png"), { fullPage: true });
let printed = false; await pr.emulateMediaType("screen"); await pr.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
await pr.click("#print"); ok((await pr.evaluate(() => window.__printed)) === 1, "Print button calls window.print()");

// ---- K: brand design evidence: screenshots, fonts, rendered contrast ----
// Measures every visible piece of text as drawn: 4.5 for body text, 3 for large text (24px, or 18.66px bold) and buttons.
const contrastFails = (pg) => pg.evaluate(() => {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3); } return [255, 255, 255]; };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.visibility === "hidden" || r.width === 0 || r.height === 0 || el.closest("[hidden], .hidden, .ghidden")) continue;
    const a = lum(rgb(cs.color)), b = lum(bgOf(el)), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700) || !!el.closest("button");
    if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" ${cs.color} on rgb(${bgOf(el)}) = ${ratio.toFixed(2)}`);
  }
  return out;
});
const shots = [];
const shot = async (pg, name, full = true) => { await snap(pg, nodePath.join(OUT, name), { fullPage: full }); shots.push(name); };
const brandFonts = (pg) => pg.evaluate(async () => { await document.fonts.ready; return { body: document.fonts.check('16px "Montserrat"'), head: document.fonts.check('800 16px "Montserrat"') }; });
let ix = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 390);
const external = []; ix.on("request", (r) => { if (!r.url().startsWith(B) && !r.url().startsWith("data:") && !r.url().includes("gstatic.com/firebasejs")) external.push(r.url()); });
await ix.reload();
await ix.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
const hero = await ix.evaluate(async () => { const h1 = document.querySelector("h1"), img = h1.querySelector("img"); await img.decode().catch(() => {}); const r = h1.getBoundingClientRect(), cs = getComputedStyle(h1), inner = document.querySelector(".hero-inner");
  return { alt: img.alt, loaded: img.complete && img.naturalWidth > 0, w: r.width, h: img.getBoundingClientRect().height, left: r.left, right: window.innerWidth - r.right, radius: cs.borderTopLeftRadius, edge: cs.borderBottomColor, edgeW: cs.borderBottomWidth, h1bg: cs.backgroundColor, heroBg: getComputedStyle(document.querySelector(".hero")).backgroundImage,
    order: [...inner.children].filter((e) => getComputedStyle(e).display !== "none").map((e) => e.tagName === "IMG" ? "logo" : e.className || e.tagName.toLowerCase()).join(","), oldArt: !!document.querySelector(".hero-art, .frame"), presenter: document.querySelector(".presenter").textContent.trim(), sub: document.querySelector(".sub").textContent.trim(), logo: document.querySelector(".hero img.logo").naturalWidth > 0, links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")) }; });
ok(hero.loaded && hero.alt === EVENT_TITLE && !hero.oldArt, `index: banner image loaded, alt "${EVENT_TITLE}", no text headline, viewfinder or spotlight artwork`);
ok(hero.radius === "16px" && hero.edge === "rgb(236, 130, 35)" && parseFloat(hero.edgeW) >= 2 && parseFloat(hero.edgeW) <= 4 && hero.h1bg === "rgb(10, 34, 50)", `index: banner frame has 16 px corners, a thin orange bottom border (${hero.edgeW}) and a navy background`);
ok(Math.abs(hero.w - (390 - 32)) <= 1 && Math.abs(hero.left - hero.right) <= 1 && Math.abs(hero.h - hero.w * 0.4) <= 1, `index at 390 px: banner ${Math.round(hero.w)} x ${Math.round(hero.h)} px, full width, centred, 2.5 to 1`);
ok(hero.order === "logo,presenter,h1,sub,lede,chips", "index hero order: logo, presenter line, banner, educataGhana 2026, tagline, chip (" + hero.order + ")");
ok(/rgb\(10, 34, 50\).*rgb\(0, 0, 0\)/.test(hero.heroBg), "index: hero background is a gradient from navy #0A2232 to black");
ok(hero.presenter === "Delegation of German Industry and Commerce in Ghana presents" && hero.sub === "educataGhana 2026" && hero.logo, "index: logo, presenter line and educataGhana 2026 line shown");
ok(hero.presenter === "Delegation of German Industry and Commerce in Ghana presents" && hero.sub === "educataGhana 2026" && hero.logo, "index: logo, presenter line and educataGhana 2026 line shown");
ok(!hero.links.some((h) => /admin|door|scan/.test(h)), "index: no link to admin, door or scan pages");
let ix360 = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 360);
await ix360.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
const n360 = await ix360.evaluate(() => { const over = [...document.querySelectorAll("body *")].filter((e) => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + "." + e.className); return { scroll: document.documentElement.scrollWidth, over, footer: document.querySelector("footer span").getBoundingClientRect().height > 30 }; });
ok(n360.scroll <= 360 && n360.over.length === 0 && n360.footer, "index at 360 px: no sideways scrolling, the long organiser name wraps " + n360.over.join(","));
await shot(ix360, "design_index_form_360.png");
const ixFonts = await brandFonts(ix); ok(ixFonts.body && ixFonts.head, "index: self-hosted Montserrat loads (regular and 800 weight)");
let cf = await contrastFails(ix); ok(cf.length === 0, "index form: all text passes contrast " + cf.join("; "));
await shot(ix, "design_index_form_390.png");
await ix.type("#name", "Abena Owusu"); await ix.type("#org", "Acme Ltd"); await ix.type("#email", "abena@example.com"); await ix.click("#consent"); await ix.click("#submit");
await ix.waitForSelector("#done:not(.hidden)"); await ix.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif"), { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
cf = await contrastFails(ix); ok(cf.length === 0, "index confirmation: all text passes contrast " + cf.join("; "));
await shot(ix, "design_index_ticket_390.png");
{ const ix1 = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 1280); await ix1.setViewport({ width: 1280, height: 720 });
  await ix1.waitForFunction(() => { const b = document.getElementById("submit"), i = document.querySelector("h1 img"); return b && !b.disabled && i.complete && i.naturalWidth > 0; }, { timeout: 5000 }); await ix1.evaluate(() => document.fonts.ready);
  cf = await contrastFails(ix1); ok(cf.length === 0, "index form at 1280 px: all text passes contrast, including the white and orange hero lines on navy " + cf.join("; "));
  await shot(ix1, "design_index_form_1280.png");
  await ix1.type("#name", "Abena Owusu"); await ix1.type("#org", "Acme Ltd"); await ix1.type("#email", "abena1280@example.com"); await ix1.click("#consent"); await ix1.click("#submit");
  await ix1.waitForSelector("#done:not(.hidden)"); await ix1.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif"), { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
  cf = await contrastFails(ix1); ok(cf.length === 0, "index confirmation at 1280 px: all text passes contrast " + cf.join("; "));
  await shot(ix1, "design_index_ticket_1280.png"); await ix1.close(); }
ok(external.length === 0, "index: no third-party requests besides Firebase " + external.join(", "));
let dd = await open("/door.html", { db: fdb(), user: admin }, 1280);
await dd.waitForFunction(() => document.querySelectorAll("#list button").length === 3, { timeout: 5000 });
await (await dd.$$("#list button"))[0].click(); await dd.waitForSelector("#cards .gcard button.bigbtn"); await new Promise((r) => setTimeout(r, 300));
const door = await dd.evaluate(() => { const px = (s) => parseFloat(getComputedStyle(document.querySelector(s)).fontSize); const small = [...document.querySelectorAll("#live button, #live input, header button, header input")].filter((e) => e.offsetParent && e.type !== "checkbox").map((e) => e.getBoundingClientRect()).filter((r) => r.height < 48 || r.width < 48).length; const big = document.querySelector("#cards .gcard button.bigbtn"); return { count: getComputedStyle(document.getElementById("count")).color, countPx: px("#count"), name: px("#cards .gcard .gname"), btnBg: getComputedStyle(big).backgroundColor, btnFg: getComputedStyle(big).color, btnH: big.getBoundingClientRect().height, rowH: document.querySelector("#list button").getBoundingClientRect().height, small }; });
ok(door.count === "rgb(236, 130, 35)" && door.countPx >= 32, `door: In counter large (${door.countPx}px) and orange`);
ok(door.name >= 48 && door.rowH >= 64, `door: card name huge (${door.name}px), list rows tall (${door.rowH}px)`);
ok(door.btnBg === "rgb(236, 130, 35)" && door.btnFg === "rgb(0, 0, 0)" && door.btnH >= 72, `door: Check in button orange with black text, ${door.btnH}px tall`);
ok(door.small === 0, "door: every button and input is at least 48 pixels");
const ddFonts = await brandFonts(dd); ok(ddFonts.body && ddFonts.head, "door: brand fonts load");
cf = await contrastFails(dd); ok(cf.length === 0, "door: all text passes contrast " + cf.join("; "));
await shot(dd, "design_door_1280.png");
await dd.click("#cards .gcard button.bigbtn"); await dd.waitForSelector("#cards .gcard .gstatus.done");
cf = await contrastFails(dd); ok(cf.length === 0, "door Checked in panel: text passes contrast " + cf.join("; "));
await shot(dd, "design_door_checkedin_1280.png", false);
let da = await open("/admin.html", { db: { ...fdb(), "groups/g2": JSON.stringify({ name: "Media", cap: 2, count: 2, open: true, lastReg: "" }), "groups/g3": JSON.stringify({ name: "Speakers", cap: 4, count: 0, open: false, lastReg: "" }) }, user: admin }, 1280);
await da.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length >= 3 && document.querySelectorAll("#groups tbody tr").length === 3, { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
const adm = await da.evaluate(() => ({ title: document.querySelector(".top h1").textContent, logo: document.querySelector(".top img").naturalWidth > 0, status: [...document.querySelectorAll("#groups tbody tr td:nth-child(3)")].map((t) => t.textContent), remove: getComputedStyle(document.querySelector("#regs button.danger")).backgroundColor }));
ok(adm.title === "Admin" && adm.logo, "admin: black top bar with logo and title Admin");
ok(["Open", "Full", "Closed by admin"].every((w) => adm.status.includes(w)), "admin: group status in words (Open, Full, Closed by admin), not colour alone");
ok(adm.remove === "rgb(179, 38, 30)", "admin: Remove button is red");
cf = await contrastFails(da); ok(cf.length === 0, "admin: all text passes contrast " + cf.join("; "));
await shot(da, "design_admin_1280.png");
await da.evaluate(() => { const p = document.createElement("p"); p.id = "probe"; p.textContent = "orange probe"; p.style.cssText = "color:#EC8223;font-size:15px"; document.querySelector("main").append(p); });
cf = await contrastFails(da); await da.evaluate(() => document.getElementById("probe").remove());
ok(cf.length === 1 && cf[0].includes("orange probe"), "contrast checker catches small orange text on white (self-test)");
console.log("Design screenshots in test/browser/out/: " + shots.join(", "));

// ---- L: hero background contrast proof: hide the text, read the real pixels behind it ----
// Pixels are decoded in the browser itself (createImageBitmap), so no PNG library is needed.
const minContrastVsWhite = (pg, b64, fg = [255, 255, 255]) => pg.evaluate(async (b64, fg) => {
  const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, bmp.width, bmp.height).data; let maxL = 0;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const Lf = 0.2126 * f(fg[0]) + 0.7152 * f(fg[1]) + 0.0722 * f(fg[2]);
  for (let i = 0; i < d.length; i += 4) { const L = 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]); if (L > maxL) maxL = L; }
  return { ratio: (Lf + 0.05) / (Math.min(maxL, Lf) + 0.05), pixels: bmp.width * bmp.height };
}, b64, fg);
for (const w of [390, 1280]) {
  const hp = await open("/index.html?c=CODEOK0001", { db: baseDb() }, w);
  await hp.waitForFunction(() => { const i = document.querySelector("h1 img"); return i && i.complete && i.naturalWidth > 0; }, { timeout: 5000 });
  await hp.evaluate(() => document.fonts.ready);
  const art = await hp.evaluate(() => { const i = document.querySelector("h1 img"); return { src: i.getAttribute("src"), loaded: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) }; });
  ok(art.src === "assets/banner-source.jpg" && art.loaded, `hero at ${w} px: banner loaded, shown ${art.w} x ${art.h} px`);
  await hp.evaluate(() => { for (const e of document.querySelectorAll(".presenter, .sub, .lede, .chips li")) { e.style.color = "transparent"; e.style.textShadow = "none"; } });
  await new Promise((r) => setTimeout(r, 100));
  for (const [sel, label, fg] of [[".presenter", "presenter line"], [".sub", "orange educataGhana 2026 line", [236, 130, 35]], [".lede", "Evening Event Registration line"], [".chips", "chips"]]) {
    const box = await hp.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top + window.scrollY), width: Math.ceil(r.width), height: Math.ceil(r.height) }; });
    const b64 = await hp.screenshot({ clip: box, encoding: "base64" });
    const res = await minContrastVsWhite(hp, b64, fg);
    ok(res.ratio >= 4.5, `hero at ${w} px: every one of ${res.pixels} pixels behind the ${label} gives its ${fg ? "orange" : "white"} text at least ${res.ratio.toFixed(2)} contrast (needs 4.5)`);
  }
  if (w === 390) { // self-test: an orange background behind the presenter line must fail the check
    await hp.evaluate(() => { document.querySelector(".presenter").style.background = "#EC8223"; });
    const box = await hp.$eval(".presenter", (e) => { const r = e.getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top + window.scrollY), width: Math.ceil(r.width), height: Math.ceil(r.height) }; });
    const bad = await minContrastVsWhite(hp, await hp.screenshot({ clip: box, encoding: "base64" }));
    ok(bad.ratio < 4.5, `pixel contrast check catches an orange background (self-test: ${bad.ratio.toFixed(2)})`);
    await hp.evaluate(() => { document.querySelector(".presenter").style.background = ""; });
  }
  await hp.evaluate(() => { for (const e of document.querySelectorAll(".presenter, .sub, .lede, .chips li")) e.style.color = ""; });
  await snap(hp, nodePath.join(OUT, `design_hero_${w}.png`), { clip: await hp.$eval(".hero", (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height) }; }) });
  shots.push(`design_hero_${w}.png`);
}
for (const w of [390, 1280]) { // the banner space is reserved and navy before the image arrives (server holds it back 1.5 s)
  const sl = await open("/index.html?c=CODEOK0001", { db: baseDb() }, w); await sl.setViewport({ width: w, height: 720 }); await sl.setCacheEnabled(false); await sl.setExtraHTTPHeaders({ "x-slow-banner": "1" });
  await sl.reload({ waitUntil: "domcontentloaded" });
  const pos = () => sl.evaluate(() => { const i = document.querySelector("h1 img"), r = i.getBoundingClientRect(); return { loaded: i.complete && i.naturalWidth > 0, w: Math.round(r.width), h: Math.round(r.height), sub: Math.round(document.querySelector(".sub").getBoundingClientRect().top), bg: getComputedStyle(document.querySelector("h1")).backgroundColor }; });
  const before = await pos();
  await sl.waitForFunction(() => { const i = document.querySelector("h1 img"); return i.complete && i.naturalWidth > 0; }, { timeout: 8000 });
  const after = await pos();
  ok(!before.loaded && before.h > 0 && before.h === after.h && before.sub === after.sub && before.bg === "rgb(10, 34, 50)", `banner at ${w} px: navy ${before.w} x ${before.h} px space shown before the image loads, nothing moves when it arrives (educataGhana 2026 line at ${before.sub} then ${after.sub} px)`);
  await sl.close();
}
// The hero must stay dark and readable when the styles it could depend on are missing: brand.css blocked, every file
// under assets/ blocked, or every CSS variable undefined. (On the live site an out-of-date brand.css once left white text on grey.)
{ const names = [...new Set([...fs.readFileSync(nodePath.join(ROOT, "index.html"), "utf8").matchAll(/--[a-z][a-z0-9-]*/g), ...fs.readFileSync(nodePath.join(ROOT, "assets/brand.css"), "utf8").matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]))];
  const noVars = (css) => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = css; document.head.append(st); });
  const cases = [["assets/brand.css blocked", { block: /\/assets\/brand\.css/ }], ["every file under assets/ blocked", { block: /\/assets\// }], ["CSS variables undefined", { init: noVars, initArg: ":root:root,*{" + names.map((n) => n + ":initial").join(";") + "}" }]];
  for (const [label, opts] of cases) for (const w of [390, 1280]) {
    const hb = await open("/index.html?c=CODEOK0001", { db: baseDb() }, w, opts); await hb.setViewport({ width: w, height: 900 });
    await hb.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
    const g = await hb.evaluate((label) => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number), f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const hero = document.querySelector(".hero"), cs = getComputedStyle(hero), c = rgb(cs.backgroundColor), r = hero.getBoundingClientRect();
      const chips = document.querySelector(".chips").getBoundingClientRect(), card = [...document.querySelectorAll("main .ticket")].find((t) => t.offsetParent).getBoundingClientRect();
      return { bg: cs.backgroundColor, lum: c.length >= 3 && (c.length === 3 || c[3] === 1) ? 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) : 1, full: r.left === 0 && Math.round(r.width) === document.documentElement.clientWidth, behind: r.bottom > chips.bottom && card.top > chips.bottom && card.top < r.bottom,
        brandCss: [...document.styleSheets].some((x) => x.href && x.href.endsWith("brand.css") && (() => { try { return x.cssRules.length > 0; } catch (e) { return false; } })()) };
    }, label);
    ok(g.lum < 0.1 && g.full && g.behind, `${label} at ${w} px: hero background ${g.bg} is dark (luminance ${g.lum.toFixed(3)}, needs under 0.1), full width, and runs behind the chip to the invitation card (brand.css applied: ${g.brandCss})`);
    const lines = [[".presenter", "presenter line"], [".sub", "educataGhana 2026"], [".lede", "tagline"], [".chips li:not(.hidden)", "chip"]];
    const fgs = await hb.evaluate((sels) => sels.map((s) => (getComputedStyle(document.querySelector(s)).color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)), lines.map((l) => l[0]));
    await hb.evaluate(() => { for (const e of document.querySelectorAll(".hero *")) { e.style.color = "transparent"; e.style.textShadow = "none"; } });
    await new Promise((r) => setTimeout(r, 100));
    const res = [];
    for (const [i, [sel, name]] of lines.entries()) {
      const box = await hb.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top + window.scrollY), width: Math.ceil(r.width), height: Math.ceil(r.height) }; });
      res.push([name, (await minContrastVsWhite(hb, await hb.screenshot({ clip: box, encoding: "base64" }), fgs[i])).ratio]);
    }
    ok(res.every(([, x]) => x >= 4.5), `${label} at ${w} px: hero text contrast against the real pixels behind it: ${res.map(([n, x]) => `${n} ${x.toFixed(2)}`).join(", ")} (each needs 4.5)`);
    await hb.close();
  }
}
{ const one = await open("/index.html?c=ONESEAT001", { db: { ...baseDb(), "invites/ONESEAT001": JSON.stringify({ gid: "g9" }), "groups/g9": JSON.stringify({ name: "Jury Member 1", cap: 1, count: 0, open: true, lastReg: "" }) } }, 390);
  await one.waitForFunction(() => document.getElementById("seatsline").textContent.length > 0, { timeout: 5000 });
  const t = await text(one, "#seatsline"); ok(t === "1 of 1 seat left for your group", `one seat left reads '${t}' (seat, not seats)`); await one.close(); }
await (async () => { const pp = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 390); await pp.emulateMediaType("print"); ok(await pp.$eval(".hero", (e) => getComputedStyle(e).display === "none"), "print still hides the hero and its artwork"); })();
console.log("Hero screenshots in test/browser/out/: design_hero_390.png, design_hero_1280.png (form and ticket states: design_index_form_390.png, design_index_ticket_390.png, design_index_form_1280.png, design_index_ticket_1280.png)");

// ---- M: polish checks and layout stress tests ----
// Fails on horizontal scroll, on content running out of its box, on elements outside the screen (unless inside a
// scroll container), and on normal-flow siblings that overlap.
const layoutProblems = (pg) => pg.evaluate(() => {
  const out = [], W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W + 1) out.push(`horizontal scroll (${document.documentElement.scrollWidth} > ${W})`);
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; };
  const name = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).join(".") : "");
  const flow = (e) => !["absolute", "fixed"].includes(getComputedStyle(e).position);
  const all = [...document.querySelectorAll("body *")].filter((e) => !["SCRIPT", "STYLE", "BR"].includes(e.tagName) && vis(e));
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (!flow(e) || cs.display === "inline" || ["INPUT", "SELECT", "TEXTAREA", "IMG"].includes(e.tagName)) continue;
    if (cs.overflowX === "visible" && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) out.push(`runs out of its box: ${name(e)} (${e.scrollWidth} > ${e.clientWidth})`);
    const r = e.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !inScroller(e.parentElement)) out.push("outside the screen: " + name(e));
  }
  for (const p of all) {
    const kids = [...p.children].filter((k) => vis(k) && flow(k) && getComputedStyle(k).display !== "inline" && !k.matches(".hero"));
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push(`overlap: ${name(kids[i])} and ${name(kids[j])}`);
    }
  }
  return [...new Set(out)].slice(0, 10);
});
const mono = (pg, sel) => pg.$eval(sel, (e) => { const cs = getComputedStyle(e); return /monospace|Consolas|Courier|Mono/i.test(cs.fontFamily) && parseFloat(cs.letterSpacing) > 0; });
const noAlternates = (pg) => pg.evaluate(() => [...document.querySelectorAll("h1, h2, .gname, b, .gate .gname")].every((e) => { const cs = getComputedStyle(e); return !/Alternates/i.test(cs.fontFamily) && cs.fontFeatureSettings === "normal" && cs.fontVariantAlternates === "normal"; }));

// 2: phone fit at 390 x 844: the first field and the QR are visible without scrolling
let ph844 = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 390); await ph844.setViewport({ width: 390, height: 844 });
await ph844.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 }); await ph844.evaluate(() => document.fonts.ready);
const nameBox = await ph844.$eval("#name", (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scrollY }; });
ok(nameBox.scrollY === 0 && nameBox.top >= 0 && nameBox.bottom <= 844, `390x844 form: Full name input fully visible without scrolling (bottom at ${Math.round(nameBox.bottom)} px of 844)`);
ok(await noAlternates(ph844), "headings use regular Montserrat: no Alternates family, no stylistic glyph features");
const bw844 = await ph844.$eval("h1 img", (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
ok(bw844.w === 358 && bw844.h === Math.round(358 * 0.4), `390x844: banner fills the width inside the 16 px margins (${bw844.w} x ${bw844.h} px)`);
const card = await ph844.$eval(".ticket", (e) => { const cs = getComputedStyle(e); return { w: cs.borderTopWidth, c: cs.borderTopColor }; });
ok(card.w === "3px" && card.c === "rgb(236, 130, 35)", "invitation card has a 3 px orange top edge against the black hero");
const chips = await ph844.$$eval(".chips li:not(.hidden)", (l) => l.map((e) => e.textContent));
ok(chips.join("|") === "One seat per invited participant", "chips: only 'One seat per invited participant' (Evening event is in the tagline)");
await snap(ph844, nodePath.join(OUT, "polish_index_form_390x844.png"));
await ph844.type("#name", "Abena Owusu"); await ph844.type("#org", "Acme Ltd"); await ph844.type("#email", "abena844@example.com"); await ph844.click("#consent"); await ph844.click("#submit");
await ph844.waitForSelector("#done:not(.hidden)"); await ph844.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif") && document.getElementById("doneqr").complete, { timeout: 5000 }); await new Promise((r) => setTimeout(r, 200));
const qrBox = await ph844.$eval("#doneqr", (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scrollY }; });
ok(qrBox.scrollY === 0 && qrBox.top >= 0 && qrBox.bottom <= 844, `390x844 confirmation: QR code fully visible without scrolling (bottom at ${Math.round(qrBox.bottom)} px of 844)`);
ok((await text(ph844, "#done .stub small")) === "Admit one. Content Creators Contest", "ticket header reads 'Admit one. Content Creators Contest'");
ok(await mono(ph844, "#doneref"), "confirmation ticket: reference in monospace with letter spacing");
await snap(ph844, nodePath.join(OUT, "polish_index_ticket_390x844.png"));

// 1 and 6: scan page in the brand, reference in monospace
let sc = await phone(`/scan.html?ref=${regRef}`, { token: "tok-ok" }, mkdb(), 390);
await phoneSays(sc, "Sent");
const scs = await sc.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, logo: document.querySelector("img.logo").naturalWidth > 0 }));
ok(scs.bg === "rgb(0, 0, 0)" && scs.logo, "scan page: black background and logo");
ok(await mono(sc, "#ref"), "scan page: reference in monospace with letter spacing");
const scw = await sc.evaluate(() => ({ h1: document.querySelector("h1").textContent, title: document.title }));
ok(scw.h1 === "Content Creators Contest scanner" && scw.title === "Content Creators Contest scanner", "scan page: title 'Content Creators Contest scanner'");
await snap(sc, nodePath.join(OUT, "polish_scan_390.png"));

// 7: door has ONE black header with logo, title, counter, sound toggle and Hide list
let dm = await open("/door.html", { db: fdb(), user: admin }, 1280);
await dm.waitForFunction(() => document.querySelectorAll("#list button").length === 3, { timeout: 5000 });
const hdr = await dm.evaluate(() => { const h = document.querySelector("header"); const blackBars = [...document.querySelectorAll("body *")].filter((e) => e.offsetParent && getComputedStyle(e).backgroundColor === "rgb(0, 0, 0)" && e.getBoundingClientRect().width > 600).length; return { inHeader: ["count", "sound", "hidelist"].every((id) => h.contains(document.getElementById(id))), logo: !!h.querySelector("img"), title: h.textContent.includes("Gate"), blackBars, note: document.querySelector("#listpanel b").textContent }; });
ok(hdr.inHeader && hdr.logo && hdr.title && hdr.blackBars === 1, `door: one black header holds logo, title, counter, sound toggle and Hide list (${hdr.blackBars} black bar)`);
ok(hdr.note === "Participants (3)", "door: list heading reads 'Participants (3)' (" + hdr.note + ")");
for (const w of [1280, 1200, 390]) {
  await dm.setViewport({ width: w, height: 1000 }); await new Promise((r) => setTimeout(r, 150));
  const pos = await dm.evaluate(() => { const h = document.querySelector("header"), c = document.getElementById("count").getBoundingClientRect(); const others = [...h.querySelectorAll("img, b, label, button")].map((e) => e.getBoundingClientRect()).filter((r) => r.width && Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > 0); const link = document.querySelector('a[href="admin.html"]'); return { right: others.every((r) => r.right <= c.left + 1), gap: Math.round(document.documentElement.clientWidth - c.right), inHeader: !!h.querySelector("a"), link: link && link.closest("main > p.foot") && link.textContent === "Admin page" && link.getBoundingClientRect().top > document.getElementById("live").getBoundingClientRect().bottom }; });
  ok(pos.right && pos.gap <= 40 && !pos.inHeader && !!pos.link, `door at ${w} px: In counter is the right-most item in the header (${pos.gap} px from the edge), Admin page is a small link below the list, not in the header`);
}
await dm.setViewport({ width: 1280, height: 1400 });
await (await dm.$$("#list button"))[0].click(); await dm.waitForSelector("#cards .gcard dd.mono");
ok(await mono(dm, "#cards .gcard dd.mono"), "door card: reference in monospace with letter spacing");
await snap(dm, nodePath.join(OUT, "polish_door_1280.png"));

// 8: admin polish
let am = await open("/admin.html", { db: { ...fdb(), "groups/g2": JSON.stringify({ name: "Media", cap: 2, count: 2, open: true, lastReg: "" }), "groups/g3": JSON.stringify({ name: "Speakers", cap: 4, count: 0, open: false, lastReg: "" }), "invites/CODEG20001": JSON.stringify({ gid: "g2" }), "invites/CODEG30001": JSON.stringify({ gid: "g3" }) }, user: admin }, 1200);
await am.waitForFunction(() => document.querySelectorAll("#groups tbody tr").length === 3 && document.querySelectorAll("#regs tbody tr").length >= 3, { timeout: 5000 });
ok(!(await am.$eval("#msg", (e) => e.classList.contains("hidden"))), "admin: 'Signed in.' shows first");
await new Promise((r) => setTimeout(r, 3300));
ok(await am.$eval("#msg", (e) => e.classList.contains("hidden")), "admin: 'Signed in.' hides after 3 seconds");
am.once("dialog", (d) => d.accept("0")); await am.$$eval("#groups tbody tr", (trs) => [...trs[0].querySelectorAll("button")].find((b) => b.textContent === "Set cap").click());
await am.waitForFunction(() => !document.getElementById("msg").classList.contains("hidden") && document.getElementById("msg").classList.contains("bad"), { timeout: 3000 });
await new Promise((r) => setTimeout(r, 3300));
ok(!(await am.$eval("#msg", (e) => e.classList.contains("hidden"))), "admin: an error message stays visible after 3 seconds");
const st = await am.$$eval("#groups tbody tr td:nth-child(3)", (tds) => tds.map((t) => ({ t: t.textContent, c: getComputedStyle(t).color })));
ok(st.some((s) => s.t === "Full" && s.c === "rgb(179, 38, 30)") && st.some((s) => s.t.includes("Closed") && s.c === "rgb(89, 89, 89)"), "admin: Full in red, Closed by admin in grey");
ok(await mono(am, "#regs tbody td:first-child"), "admin: reference column in monospace with letter spacing");
for (const w of [1200, 1280]) {
  await am.setViewport({ width: w, height: 1000 }); await new Promise((r) => setTimeout(r, 200));
  const lines = await am.$$eval("#groups tbody tr", (trs) => trs.map((tr) => { const tops = (sel) => [...tr.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)); const link = tops("td:nth-child(4) input, td:nth-child(4) button"), acts = tops("td:nth-child(5) button"); return { link: Math.max(...link) - Math.min(...link), acts: Math.max(...acts) - Math.min(...acts) }; }));
  ok(lines.every((l) => l.link <= 2 && l.acts <= 2), `admin at ${w} px: each invite link and its Copy button, and each row's actions, stay on one line`);
}
await snap(am, nodePath.join(OUT, "polish_admin_1280.png"));

// 9: stress data at 360, 390 and 1280
const LONG_NAME = "Nana Akosua Adomako-Ampofo Boatemaa Owusu-Ansah Mensah Kwaku";      // 60 characters
const LONG_ORG = "Ghana National Association of Independent Digital Content Creator and Publishers"; // 80 characters
const LONG_GROUP = "Regional Media, Creative Industry & Press Partners";                 // 50 characters
const LONG_EMAIL = "nana.akosua.adomako-ampofo.boatemaa@communications-department.example-organisation.com.gh";
ok(LONG_NAME.length === 60 && LONG_ORG.length === 80 && LONG_GROUP.length === 50 && LONG_EMAIL.length > 80, "stress data lengths: name 60, organisation 80, group 50, email " + LONG_EMAIL.length);
const stressDb = () => { const d = { ...baseDb(), "staff/staff1": JSON.stringify({ ok: true }), "invites/LONGGROUP1": JSON.stringify({ gid: "glong" }), "groups/glong": JSON.stringify({ name: LONG_GROUP, cap: 10, count: 1, open: true, lastReg: "" }),
  [`registrations/${LONG_EMAIL}`]: JSON.stringify({ gid: "glong", code: "LONGGROUP1", name: LONG_NAME, email: LONG_EMAIL, org: LONG_ORG, ref: "EDU26-LONGAA", phone: "+233 24 000 0000" }) };
  for (let i = 0; i < 300; i++) d[`registrations/p${i}@example.com`] = JSON.stringify({ gid: i % 2 ? "g1" : "glong", code: "CODEOK0001", name: `Participant ${String(i).padStart(3, "0")} ${["Mensah", "Boateng", "Owusu", "Asante"][i % 4]}`, email: `p${i}@example.com`, org: ["Acme Ltd", "Zed Corp", "Media House Ghana", "Creative Hub"][i % 4], ref: "EDU26-" + String(i).padStart(6, "0").replace(/0/g, "A"), ...(i % 7 === 0 ? { checkedIn: true } : {}) });
  return d; };
for (const w of [360, 390, 1280]) {
  // index form with a 50-character group name, then confirmation with the long name, organisation and email
  const sf = await open("/index.html?c=LONGGROUP1", { db: stressDb() }, w);
  await sf.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 }); await sf.evaluate(() => document.fonts.ready);
  let lp = await layoutProblems(sf); ok(lp.length === 0, `stress index form at ${w} px: no overflow, overlap or sideways scroll ` + lp.join("; "));
  await snap(sf, nodePath.join(OUT, `stress_index_form_${w}.png`), { fullPage: true });
  await sf.evaluate((n, o, e) => { document.getElementById("name").value = n; document.getElementById("org").value = o; document.getElementById("email").value = e.replace("nana.", "nana" + Math.random().toString(36).slice(2, 6) + "."); document.getElementById("consent").checked = true; }, LONG_NAME, LONG_ORG, LONG_EMAIL);
  await sf.click("#submit"); await sf.waitForSelector("#done:not(.hidden)", { timeout: 5000 }); await new Promise((r) => setTimeout(r, 300));
  lp = await layoutProblems(sf); ok(lp.length === 0, `stress confirmation at ${w} px: no overflow, overlap or sideways scroll ` + lp.join("; "));
  await snap(sf, nodePath.join(OUT, `stress_index_ticket_${w}.png`), { fullPage: true });
  // door with 300 participants and the long one opened
  const sd = await open("/door.html", { db: stressDb(), user: admin }, w);
  await sd.waitForFunction(() => document.querySelectorAll("#list button").length === 50, { timeout: 8000 }); await sd.evaluate(() => document.fonts.ready);
  await sd.$$eval("#list button", (bs) => bs.find((b) => b.textContent.includes("Nana Akosua")).click()); await sd.waitForSelector("#cards .gcard");
  lp = await layoutProblems(sd); ok(lp.length === 0, `stress door at ${w} px (301 participants, long card): no overflow, overlap or sideways scroll ` + lp.join("; "));
  await snap(sd, nodePath.join(OUT, `stress_door_${w}.png`));
  if (w === 1280) {
    const perf = await sd.evaluate(() => new Promise((res) => { const s = document.getElementById("search"), list = document.getElementById("list"); let renders = 0; const orig = list.replaceChildren.bind(list); list.replaceChildren = (...a) => { renders++; return orig(...a); }; const mo = { disconnect() { list.replaceChildren = orig; } }; // count redraws (each redraw clears the list once)
      const times = []; for (const ch of "particip") { const t = performance.now(); s.value += ch; s.dispatchEvent(new Event("input")); times.push(performance.now() - t); }
      setTimeout(() => { mo.disconnect(); res({ max: Math.max(...times), avg: times.reduce((a, b) => a + b, 0) / times.length, renders, rows: list.children.length }); }, 100); }));
    ok(perf.max < 50, `door search with 301 participants stays fast: slowest keystroke ${perf.max.toFixed(1)} ms, average ${perf.avg.toFixed(1)} ms (limit 50 ms)`);
    ok(perf.renders === 8, `door list redraws once per keystroke and no more (${perf.renders} redraws for 8 keystrokes)`);
  }
  // admin with the long data
  const sa = await open("/admin.html", { db: stressDb(), user: admin }, w);
  await sa.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 301, { timeout: 8000 }); await sa.evaluate(() => document.fonts.ready);
  lp = await layoutProblems(sa); ok(lp.length === 0, `stress admin at ${w} px: no overflow, overlap or sideways scroll (tables may scroll inside their frame) ` + lp.join("; "));
  await snap(sa, nodePath.join(OUT, `stress_admin_${w}.png`));
  // scan page
  const ss = await phone("/scan.html?ref=EDU26-LONGAA", { token: "tok-ok" }, stressDb(), w);
  await phoneSays(ss, "Sent");
  lp = await layoutProblems(ss); ok(lp.length === 0, `stress scan page at ${w} px: no overflow, overlap or sideways scroll ` + lp.join("; "));
  await snap(ss, nodePath.join(OUT, `stress_scan_${w}.png`));
  for (const pg of [sf, sd, sa, ss]) await pg.close();
}

// ---- N: third polish pass ----
const viewTop = (pg, sel) => pg.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), scrollY: window.scrollY, vh: window.innerHeight }; });
const fitsFirstScreen = (b) => b.scrollY === 0 && b.top >= 0 && b.bottom <= b.vh;
// Words (split at spaces, a hyphen stays with the part before it) whose letters land on more than one line.
const splitWords = (pg, sel) => pg.$eval(sel, (p) => { const t = p.firstChild, out = [], re = /[^\s-]+-?/g; let m;
  while ((m = re.exec(t.textContent))) { const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length); if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) out.push(m[0]); }
  return out; });
const register = async (pg, email) => { await pg.type("#name", "Abena Owusu"); await pg.type("#org", "Acme Ltd"); await pg.type("#email", email); await pg.click("#consent"); await pg.click("#submit");
  await pg.waitForSelector("#done:not(.hidden)"); await pg.waitForFunction(() => document.getElementById("doneqr").src.startsWith("data:image/gif") && document.getElementById("doneqr").complete, { timeout: 5000 }); await new Promise((r) => setTimeout(r, 200)); };

// 1: door on narrow screens: names never break inside a word, size follows length, header in two clean rows
for (const w of [360, 390, 820]) {
  const nd = await open("/door.html", { db: stressDb(), user: admin }, w); await nd.setViewport({ width: w, height: 900 });
  await nd.waitForFunction(() => document.querySelectorAll("#list button").length === 50, { timeout: 8000 }); await nd.evaluate(() => document.fonts.ready);
  await nd.$$eval("#list button", (bs) => bs.find((b) => b.textContent.includes("Nana Akosua")).click()); await nd.waitForSelector("#cards .gcard");
  const split = await splitWords(nd, "#cards .gcard .gname");
  const nm = await nd.$eval("#cards .gcard .gname", (e) => ({ px: parseFloat(getComputedStyle(e).fontSize), anywhere: e.classList.contains("anywhere") }));
  ok(split.length === 0 && nm.px === 24 && !nm.anywhere, `door at ${w} px: 60-character name at ${nm.px}px, no word broken inside ${split.join(", ")}`);
  const hd = await nd.evaluate(() => { const c = document.getElementById("count"), cs = getComputedStyle(c), logo = document.querySelector("header img").getBoundingClientRect(), bar = document.getElementById("gatebar").getBoundingClientRect(), h = document.querySelector("header").getBoundingClientRect();
    return { oneLine: c.getBoundingClientRect().height < parseFloat(cs.fontSize) * 1.5, rows: logo.bottom <= bar.top + 1, right: Math.round(h.right - c.getBoundingClientRect().right), hide: document.getElementById("hidelist").getBoundingClientRect().height }; });
  ok(hd.oneLine && hd.rows && hd.right <= 20 && hd.hide >= 48, `door at ${w} px: header in two clean rows (logo above the controls), In counter on one line at the right (${hd.right} px from the edge), Hide list on one line`);
  const lp = await layoutProblems(nd); ok(lp.length === 0, `door at ${w} px with the long card: no overflow, overlap or sideways scroll ` + lp.join("; "));
  await snap(nd, nodePath.join(OUT, `polish3_door_name_${w}.png`));
  const sn = await open("/door.html", { db: fdb(), user: admin }, w);
  await sn.waitForFunction(() => document.querySelectorAll("#list button").length === 3, { timeout: 5000 }); await sn.evaluate(() => document.fonts.ready);
  await (await sn.$$("#list button"))[0].click(); await sn.waitForSelector("#cards .gcard");
  const sh = await sn.$eval("#cards .gcard .gname", (e) => ({ t: e.textContent, px: parseFloat(getComputedStyle(e).fontSize) }));
  ok(sh.px === 44 && (await splitWords(sn, "#cards .gcard .gname")).length === 0, `door at ${w} px: short name '${sh.t}' at ${sh.px}px (44 for up to 20 characters)`);
  if (w === 390) { await nd.$eval("#cards .gcard .gname", (e) => { e.style.fontSize = "64px"; e.classList.add("anywhere"); });
    ok((await splitWords(nd, "#cards .gcard .gname")).length > 0, "word-break checker catches a name broken inside a word (self-test)"); }
  await nd.close(); await sn.close();
}

// 2 and 3: index hero: full in the form state, compact after registration
for (const [w, h] of [[1280, 720], [390, 844]]) {
  const hx = await open("/index.html?c=CODEOK0001", { db: baseDb() }, w); await hx.setViewport({ width: w, height: h });
  await hx.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 }); await hx.evaluate(() => document.fonts.ready);
  await hx.waitForFunction(() => { const i = document.querySelector("h1 img"); return i.complete && i.naturalWidth > 0; }, { timeout: 5000 });
  const form = await hx.evaluate(() => ({ hero: document.querySelector(".hero").getBoundingClientRect().height, banner: Math.round(document.querySelector("h1 img").getBoundingClientRect().width), bannerH: Math.round(document.querySelector("h1 img").getBoundingClientRect().height), full: [".lede", ".chips", ".presenter", ".sub"].every((s) => getComputedStyle(document.querySelector(s)).display !== "none") }));
  const nb = await viewTop(hx, "#name");
  ok(fitsFirstScreen(nb) && form.full && form.bannerH > 0, `index ${w}x${h} form: banner (${form.banner} x ${form.bannerH} px), tagline and chip shown, Full name input fully visible without scrolling (bottom at ${nb.bottom} of ${h})`);
  if (w === 1280) ok(form.banner >= 360, `index 1280x720 form: banner still a usable size on a short laptop screen (${form.banner} px wide; up to 1000 on taller screens)`);
  await snap(hx, nodePath.join(OUT, `polish3_index_form_${w}x${h}.png`));
  await register(hx, `hero${w}@example.com`);
  const done = await hx.evaluate(() => ({ banner: Math.round(document.querySelector("h1 img").getBoundingClientRect().height), hidden: [".lede", ".chips"].every((s) => getComputedStyle(document.querySelector(s)).display === "none") }));
  const qb = await viewTop(hx, "#doneqr");
  ok(fitsFirstScreen(qb) && done.hidden && done.banner > 0, `index ${w}x${h} confirmation: banner kept (${done.banner} px tall), tagline and chip hidden, QR code fully visible without scrolling (bottom at ${qb.bottom} of ${h})`);
  await snap(hx, nodePath.join(OUT, `polish3_index_ticket_${w}x${h}.png`));
  console.log(`Invite page screenshots in test/browser/out/: polish3_index_form_${w}x${h}.png, polish3_index_ticket_${w}x${h}.png`);
  await hx.close();
}

// 7: a 50-seat group shows a seat bar, not 50 dots, and the form stays on the first screen
const seatDb = (cap, count) => ({ ...baseDb(), "invites/BIGGROUP01": JSON.stringify({ gid: "gbig" }), "groups/gbig": JSON.stringify({ name: "Media and Press Partners", cap, count, open: true, lastReg: "" }) });
for (const [w, h] of [[390, 844], [1280, 720], [360, 800]]) {
  const bg = await open("/index.html?c=BIGGROUP01", { db: seatDb(50, 12) }, w); await bg.setViewport({ width: w, height: h });
  await bg.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 }); await bg.evaluate(() => document.fonts.ready);
  const m = await bg.evaluate(() => ({ dots: document.querySelectorAll("#meter .dot").length, bar: !!document.querySelector("#meter .seatbar"), taken: document.querySelector("#meter .seatbar")?.style.getPropertyValue("--taken"), line: document.getElementById("seatsline").textContent, label: document.getElementById("meter").getAttribute("aria-label") }));
  const nb = await viewTop(bg, "#name");
  ok(m.dots === 0 && m.bar && m.taken === "24%" && m.line === "38 of 50 seats left for your group" && m.label === "12 of 50 seats taken" && fitsFirstScreen(nb), `50-seat group at ${w}x${h}: seat bar (24% taken) and '${m.line}', no dots, Full name visible without scrolling (bottom at ${nb.bottom} of ${h})`);
  await snap(bg, nodePath.join(OUT, `polish3_index_50seats_${w}x${h}.png`));
  await bg.close();
}
{ const sm = await open("/index.html?c=BIGGROUP01", { db: seatDb(20, 5) }, 390);
  await sm.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
  ok((await sm.$$("#meter .dot")).length === 20 && !(await sm.$("#meter .seatbar")), "20-seat group still shows 20 seat dots"); await sm.close(); }

// 4: admin check-in text with and without a time
{ const at = new Date(2026, 9, 14, 18, 5);
  const ca = await open("/admin.html", { db: { ...baseDb(),
    "registrations/timed@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Timed Person", email: "timed@example.com", org: "A", ref: "EDU26-TTTTTT", checkedIn: true, checkedInAt: { __date: at.toISOString() }, checkedInBy: "gate@x.com" }),
    "registrations/untimed@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Untimed Person", email: "untimed@example.com", org: "B", ref: "EDU26-UUUUUU", checkedIn: true }),
    "registrations/notin@example.com": JSON.stringify({ gid: "g1", code: "CODEOK0001", name: "Not In", email: "notin@example.com", org: "C", ref: "EDU26-NNNNNN" }) }, user: admin }, 1280);
  await ca.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 3, { timeout: 5000 });
  const ci = await ca.$$eval("#regs tbody tr", (trs) => Object.fromEntries(trs.map((t) => [t.children[1].textContent, t.children[6].textContent])));
  const hhmm = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  ok(ci["Timed Person"] === "Checked in " + hhmm, `admin: checked in with a time shows '${ci["Timed Person"]}'`);
  ok(ci["Untimed Person"] === "Checked in" && ci["Not In"] === "", `admin: checked in without a time shows only '${ci["Untimed Person"]}', not checked in stays blank`);
  await snap(ca, nodePath.join(OUT, "polish3_admin_checkedin_1280.png")); await ca.close(); }

// 5: door list with 301 participants draws at most 50 rows; typing latency measured to the next painted frame
{ const dl5 = await open("/door.html", { db: stressDb(), user: admin }, 1280);
  await dl5.waitForFunction(() => document.querySelectorAll("#list button").length === 50, { timeout: 8000 }); await dl5.evaluate(() => document.fonts.ready);
  const first = await dl5.evaluate(() => ({ note: document.getElementById("listmore").textContent, badges: document.querySelectorAll("#list .badge").length, head: document.getElementById("listnote").textContent }));
  ok(first.note === "Showing 50 of 301. Keep typing to narrow the list." && first.badges > 0 && first.head === "(301)", `door with 301 participants: draws 50 rows with In badges (${first.badges}) and says '${first.note}'`);
  await snap(dl5, nodePath.join(OUT, "polish3_door_list_1280.png"));
  await dl5.evaluate(() => { window.__lat = []; document.getElementById("search").addEventListener("keydown", () => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t0), 0)); }); });
  await dl5.type("#search", "participant 1", { delay: 60 }); await new Promise((r) => setTimeout(r, 300));
  const lat = await dl5.evaluate(() => window.__lat);
  const after = await dl5.evaluate(() => ({ rows: document.querySelectorAll("#list button").length, note: document.getElementById("listmore").textContent }));
  const maxLat = Math.max(...lat), avgLat = lat.reduce((a, b) => a + b, 0) / lat.length;
  console.log(`  door typing latency with 301 participants (${lat.length} keystrokes, key press to painted list): max ${maxLat.toFixed(1)} ms, average ${avgLat.toFixed(1)} ms`);
  ok(lat.length === 13 && maxLat <= 150, `door typing with 301 participants: list updates within ${maxLat.toFixed(1)} ms of each key press (limit 150 ms)`);
  ok(after.rows === 50 && after.note === "Showing 50 of 100. Keep typing to narrow the list.", `door search 'participant 1': ${after.note}`);
  await dl5.$eval("#search", (e) => { e.value = ""; e.dispatchEvent(new Event("input")); }); await dl5.type("#search", "nana ak");
  ok((await dl5.$$("#list button")).length === 1 && (await text(dl5, "#listmore")) === "", "door search narrowed to one participant: the Showing line disappears");
  await dl5.close(); }

// 6: admin below 700 px: tables scroll with a hint, the first column stays in place
{ const an = await open("/admin.html", { db: stressDb(), user: admin }, 390);
  await an.waitForFunction(() => document.querySelectorAll("#regs tbody tr").length === 301, { timeout: 8000 }); await an.evaluate(() => document.fonts.ready);
  const sc6 = await an.evaluate(() => { const w = document.querySelector("#regs").closest(".wrap"), cs = getComputedStyle(w), before = document.querySelector("#regs tbody td").getBoundingClientRect().left; w.scrollLeft = 300; const td = document.querySelector("#regs tbody td").getBoundingClientRect(), wl = w.getBoundingClientRect().left;
    return { scrolls: w.scrollWidth > w.clientWidth, moved: w.scrollLeft > 0, stuck: Math.abs(td.left - wl) <= 2 && Math.abs(td.left - before) <= 2, hint: getComputedStyle(w, "::after").content, thin: cs.scrollbarWidth }; });
  ok(sc6.scrolls && sc6.moved && sc6.stuck, "admin at 390 px: registrations table scrolls sideways and the Reference column stays in place");
  ok(sc6.hint.includes("Scroll sideways for more columns") && sc6.thin === "thin", `admin at 390 px: thin scrollbar and the hint ${sc6.hint}`);
  await snap(an, nodePath.join(OUT, "polish3_admin_390.png")); await an.close(); }

// ---- R: registration speed: one round trip in the common case, safe fallbacks, race for the last seat ----
// A shared stand-in server in this test process. Pages get it through exposeFunction, so two separate browsers write to
// the same data, one commit at a time, with the same checks as the security rules (create only, count + 1, cap, open).
function makeServer(seed) {
  const db = { ...seed };
  const commit = async (json) => {
    const writes = JSON.parse(json), next = {}, get = (p) => (p in next ? next[p] : db[p]);
    try {
      for (const w of writes) {
        if (w.kind === "delete") { next[w.path] = null; continue; }
        const raw = get(w.path), before = raw == null ? undefined : JSON.parse(raw), data = JSON.parse(w.data);
        if (w.path.startsWith("registrations/")) {
          const id = w.path.slice("registrations/".length), g = writes.find((x) => x.kind === "update" && x.path === "groups/" + data.gid);
          if (before !== undefined || !g || JSON.parse(g.data).lastReg !== id) throw "permission-denied";
        }
        const after = w.kind === "set" ? data : { ...before, ...data };
        if (w.path.startsWith("groups/") && (!before || after.count !== before.count + 1 || after.count > before.cap || before.open !== true)) throw "permission-denied";
        next[w.path] = JSON.stringify(after);
      }
    } catch (e) { return JSON.stringify({ error: String(e) }); }
    for (const [p, v] of Object.entries(next)) { if (v === null) delete db[p]; else db[p] = v; }
    return JSON.stringify({ docs: next });
  };
  return { db, expose: { __serverCommit: commit, __serverRead: async (p) => db[p] ?? null } };
}
// Before each page loads: network latency, and the moment the confirmation (or a refusal) becomes visible.
const speedInit = (ms) => {
  window.__latency = ms; window.__flashedFull = false;
  document.addEventListener("DOMContentLoaded", () => {
    const done = document.getElementById("done"), un = document.getElementById("unavailable");
    new MutationObserver(() => { if (!done.classList.contains("hidden") && !window.__tDone) window.__tDone = performance.now(); }).observe(done, { attributes: true });
    new MutationObserver(() => { if (!un.classList.contains("hidden")) window.__flashedFull = true; }).observe(un, { attributes: true });
  });
};
const fillForm = async (pg, email) => { await pg.type("#name", "Esi Quartey"); await pg.type("#org", "Speed Co"); await pg.type("#email", email); await pg.click("#consent"); };
const ready = (pg) => pg.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 10000 });
const startOps = (pg) => pg.evaluate(() => { window.__ops = { reads: 0, writes: 0, listens: 0 }; window.__tDone = 0; window.__tClick = performance.now(); });
const opsNow = (pg) => pg.evaluate(() => ({ ...window.__ops, ms: window.__tDone ? Math.round(window.__tDone - window.__tClick) : null }));
const LAT = 200;
const speedDb = (count = 1, cap = 3) => ({ ...baseDb(), "groups/g1": group(count, cap) });
{
  // 1. common case, before and after: count network operations from the tap to the confirmation
  const runOnce = async (path, email) => {
    const pg = await open(path, { db: speedDb() }, 390, { init: speedInit, initArg: LAT });
    await ready(pg); await fillForm(pg, email); await startOps(pg);
    await pg.click("#submit"); await pg.waitForSelector("#done:not(.hidden)", { timeout: 15000 });
    const r = await opsNow(pg);
    r.panel = !!(await pg.$("#debugpanel")); r.qr = await pg.$eval(".qr", (e) => !e.classList.contains("hidden"));
    await pg.close(); return r;
  };
  const fmt = (r) => `${r.reads} read${r.reads === 1 ? "" : "s"} + ${r.writes} write${r.writes === 1 ? "" : "s"}, ${r.ms} ms`;
  let before = null;
  if (BEFORE_INDEX) before = await runOnce("/__before/index.html?c=CODEOK0001", "before@example.com");
  const after = await runOnce("/index.html?c=CODEOK0001", "after@example.com");
  console.log(`  registration, tap to confirmation at ${LAT} ms per round trip: before (last committed index.html): ${before ? fmt(before) : "not measured (no git)"}; after: ${fmt(after)}`);
  ok(after.reads === 0 && after.writes === 1, `common case: exactly one write round trip and no reads between tap and confirmation (${fmt(after)})`);
  ok(after.ms < LAT * 2, `common case: confirmation ${after.ms} ms after the tap with ${LAT} ms per round trip (under ${LAT * 2} ms)`);
  if (before) ok(before.reads + before.writes >= after.reads + after.writes, `no more round trips than before (${before.reads + before.writes} before, ${after.reads + after.writes} now)`);
  ok(!after.panel && after.qr, "no debug panel without &debug=1; the QR area shows with the confirmation");
}
{
  // 2. the last seat: no flash of "All seats taken" from our own unconfirmed write
  const pg = await open("/index.html?c=CODEOK0001", { db: speedDb(2, 3) }, 390, { init: speedInit, initArg: LAT });
  await ready(pg); await fillForm(pg, "lastseat@example.com"); await startOps(pg);
  await pg.click("#submit"); await pg.waitForSelector("#done:not(.hidden)", { timeout: 15000 });
  const r = await opsNow(pg); const flashed = await pg.evaluate(() => window.__flashedFull);
  ok(!flashed && r.writes === 1 && r.reads === 0 && JSON.parse((await dump(pg))["groups/g1"]).count === 3, "taking the last seat: confirmation straight away, never a flash of 'All seats taken' (count 3 of 3)");
  await pg.close();
}
{
  // 3. debug mode: timings panel and console log, no personal data
  const pg = await open("/index.html?c=CODEOK0001&debug=1", { db: speedDb() }, 390, { init: speedInit, initArg: LAT });
  const logs = []; pg.on("console", (m) => { if (m.text().startsWith("[timing]")) logs.push(m.text()); });
  await ready(pg); await fillForm(pg, "debugger@example.com");
  await pg.click("#submit"); await pg.waitForSelector("#done:not(.hidden)", { timeout: 15000 });
  await pg.waitForFunction(() => (document.getElementById("debugpanel") || {}).textContent?.includes("QR shown"), { timeout: 8000 });
  const panel = await text(pg, "#debugpanel");
  const labels = ["invite verified", "seat count loaded", "submit tapped", "write sent", "write acknowledged", "QR shown"];
  let at = -1; const inOrder = labels.every((l) => { const i = panel.indexOf(l + ":"); const good = i > at; at = i; return good; });
  ok(inOrder && labels.every((l) => logs.some((x) => x.includes(l))), "debug=1: panel and console list invite verified, seat count loaded, submit tapped, write sent, write acknowledged, QR shown, in order");
  ok(!/@|Esi|Quartey|Speed Co|EDU26|CODEOK/i.test(panel + logs.join("")), "debug panel and console timings contain no personal data, reference or invite code");
  console.log("  debug panel:\n    " + panel.split("\n").join("\n    "));
  await snap(pg, nodePath.join(OUT, "register_debug_390.png"));
  await pg.close();
}
{
  // 4. two separate browsers race for the last seat through one shared server
  const srv = makeServer({ "invites/CODEOK0001": JSON.stringify({ gid: "g1" }), "groups/g1": group(2, 3) });
  const b2 = await puppeteer.launch({ executablePath: found.executablePath, headless: true, args: found.args });
  try {
    const pa = await open("/index.html?c=CODEOK0001", { db: speedDb(2, 3) }, 390, { init: speedInit, initArg: LAT, expose: srv.expose });
    const pb = await open("/index.html?c=CODEOK0001", { db: speedDb(2, 3) }, 390, { init: speedInit, initArg: LAT, expose: srv.expose, browser: b2 });
    await ready(pa); await ready(pb); await fillForm(pa, "racer.a@example.com"); await fillForm(pb, "racer.b@example.com");
    await Promise.all([pa.click("#submit"), pb.click("#submit")]);
    const outcome = (pg) => pg.waitForFunction(() => !document.getElementById("done").classList.contains("hidden") ? "done" : !document.getElementById("unavailable").classList.contains("hidden") ? document.getElementById("unavailable-title").textContent : null, { timeout: 15000 }).then((h) => h.jsonValue());
    const res = await Promise.all([outcome(pa), outcome(pb)]);
    const g = JSON.parse(srv.db["groups/g1"]), regs = Object.keys(srv.db).filter((k) => k.startsWith("registrations/"));
    ok(res.filter((x) => x === "done").length === 1 && res.filter((x) => x === "All seats for your group were just taken").length === 1, "two browsers race for the last seat: exactly one confirmation and one 'All seats for your group were just taken' (" + res.join(" / ") + ")");
    ok(g.count === 3 && g.count <= g.cap && regs.length === 1 && g.lastReg === regs[0].slice("registrations/".length), `after the race: count ${g.count} of ${g.cap}, one registration, the loser left no half-written document`);
  } finally { await b2.close(); }
}
{
  // 5. stale live count: the fast write is refused, the server count differs, one transaction retry succeeds
  const srv = makeServer({ "invites/CODEOK0001": JSON.stringify({ gid: "g1" }), "groups/g1": group(1, 3) });
  const pg = await open("/index.html?c=CODEOK0001", { db: speedDb(0, 3) }, 390, { init: speedInit, initArg: LAT, expose: srv.expose });
  await ready(pg); await fillForm(pg, "stale@example.com"); await startOps(pg);
  await pg.click("#submit"); await pg.waitForSelector("#done:not(.hidden)", { timeout: 15000 });
  const r = await opsNow(pg);
  ok(JSON.parse(srv.db["groups/g1"]).count === 2 && !!srv.db["registrations/stale@example.com"] && r.writes === 2 && r.reads === 2, `stale seat count: refused once, re-read, retried once with a transaction, confirmed (${r.reads} reads + ${r.writes} writes, ${r.ms} ms)`);
  await pg.close();
}
{
  // 6. duplicate email with a current count: refused, one re-read, the existing message, nothing changed
  const srv = makeServer({ "invites/CODEOK0001": JSON.stringify({ gid: "g1" }), "groups/g1": group(1, 3), "registrations/dup@example.com": JSON.stringify({ gid: "g1", email: "dup@example.com" }) });
  const pg = await open("/index.html?c=CODEOK0001", { db: speedDb(1, 3) }, 390, { init: speedInit, initArg: LAT, expose: srv.expose });
  await ready(pg); await fillForm(pg, "Dup@Example.com"); await startOps(pg);
  await pg.click("#submit"); await pg.waitForSelector("#formerror:not(.hidden)", { timeout: 15000 });
  const r = await opsNow(pg);
  ok((await text(pg, "#formerror")).includes("may already be registered") && r.writes === 1 && r.reads === 1 && JSON.parse(srv.db["groups/g1"]).count === 1, `duplicate email: 'may already be registered', count unchanged (${r.reads} read + ${r.writes} write)`);
  await pg.close();
  // duplicate AND a stale count: the transaction retry is refused too, and the duplicate message still shows
  const srv2 = makeServer({ "invites/CODEOK0001": JSON.stringify({ gid: "g1" }), "groups/g1": group(2, 3), "registrations/dup@example.com": JSON.stringify({ gid: "g1", email: "dup@example.com" }) });
  const p2 = await open("/index.html?c=CODEOK0001", { db: speedDb(1, 3) }, 390, { init: speedInit, initArg: LAT, expose: srv2.expose });
  await ready(p2); await fillForm(p2, "dup@example.com"); await startOps(p2);
  await p2.click("#submit"); await p2.waitForSelector("#formerror:not(.hidden)", { timeout: 15000 });
  const r2 = await opsNow(p2);
  ok((await text(p2, "#formerror")).includes("may already be registered") && JSON.parse(srv2.db["groups/g1"]).count === 2 && Object.keys(srv2.db).filter((k) => k.startsWith("registrations/")).length === 1, `duplicate email with a stale count: retried once, still refused, 'may already be registered', nothing written (${r2.reads} reads + ${r2.writes} writes)`);
  await p2.close();
}

// self-test: the layout checker must catch text running out of its box and overlapping blocks
{ const lt = await open("/index.html?c=CODEOK0001", { db: baseDb() }, 390);
  await lt.waitForFunction(() => { const b = document.getElementById("submit"); return b && !b.disabled; }, { timeout: 5000 });
  await lt.evaluate(() => { const b = document.querySelector("#formwrap .body"); const x = document.createElement("div"); x.style.whiteSpace = "nowrap"; x.textContent = "unbreakable-".repeat(40); b.prepend(x); const y = document.createElement("p"); y.textContent = "overlapping block"; y.style.marginTop = "-30px"; b.querySelector("h2").after(y); });
  const lp = await layoutProblems(lt); ok(lp.some((p) => p.startsWith("runs out of its box")) && lp.some((p) => p.startsWith("overlap")), "layout checker catches overflow and overlap (self-test: " + lp.length + " problems found)"); await lt.close(); }

// ---- J: confirmation email preview renders at phone and desktop width ----
const ep = writeEmailPreview();
for (const w of [390, 640]) {
  const em = await open("/test/browser/out/email-preview.html", {}, w);
  await em.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 5000 });
  const r = await em.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, imgs: [...document.images].map((i) => ({ alt: i.alt, w: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width) })), text: document.body.innerText, logo: [...document.images].filter((i) => i.alt === "educataGhana").map((i) => ({ w: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width) }))[0], banner: [...document.images].filter((i) => i.alt === "Content Creators Contest").map((i) => ({ w: i.naturalWidth, shown: Math.round(i.getBoundingClientRect().width) }))[0], calBtn: [...document.links].filter((a) => a.textContent === "Add to Google Calendar").map((a) => { const b = a.getBoundingClientRect(); return { h: b.height, right: b.right }; })[0],
    presents: [...document.querySelectorAll("td")].filter((t) => t.textContent === "Delegation of German Industry and Commerce in Ghana presents").map((t) => { const cs = getComputedStyle(t), img = [...document.images].find((i) => i.alt === "Content Creators Contest"); const range = document.createRange(); range.selectNodeContents(t); const tb = range.getBoundingClientRect(); return { px: cs.fontSize, color: cs.color, bg: cs.backgroundColor, gap: img ? Math.round(img.getBoundingClientRect().top - tb.bottom) : null }; })[0] }));
  const qrImg = r.imgs.find((i) => i.alt.startsWith("Check-in QR code"));
  ok(!r.overflow, `email preview at ${w} px: no sideways scrolling`);
  ok(qrImg && qrImg.w > 0 && qrImg.shown === 220, `email preview at ${w} px: QR image loads at 220 px`);
  ok(r.banner && r.banner.w === 1000 && r.banner.shown === Math.min(600, w - 16), `email preview at ${w} px: official banner (1000 px file, alt Content Creators Contest) loads full width (${r.banner && r.banner.shown} px)`);
  ok(r.logo && r.logo.w > 0 && r.logo.shown <= 160, `email preview at ${w} px: logo loads, at most 160 px wide (${r.logo && r.logo.shown} px)`);
  ok(r.presents && r.presents.px === "14px" && r.presents.color === "rgb(255, 255, 255)" && r.presents.bg === "rgb(10, 34, 50)" && r.presents.gap >= 0 && r.presents.gap <= 20, `email preview at ${w} px: presenter line is live text, white 14 px on navy, directly above the banner (${r.presents && r.presents.gap} px gap)`);
  ok(["25", "NOVEMBER", "Wednesday", "6:30 PM to 10:00 PM", "Your check-in code", "How it works", "Add to Google Calendar", "educata-2026.ics", "This invitation is personal."].every((s) => r.text.includes(s)), `email preview at ${w} px: date card, ticket, how it works, calendar and footer shown`);
  ok(r.calBtn && r.calBtn.h >= 40 && r.calBtn.right <= w, `email preview at ${w} px: Add to Google Calendar button fits (${r.calBtn && Math.round(r.calBtn.h)} px tall)`);
  ok(r.imgs.every((i) => i.w > 0) && r.imgs.length === ep.images.length, `email preview at ${w} px: all ${ep.images.length} inline images load`);
  ok(r.text.includes("Your participation has been confirmed") && r.text.includes("EDU26-K7M2QX") && !/undefined/.test(r.text), `email preview at ${w} px: headline and reference shown`);
  const ecf = await contrastFails(em); ok(ecf.length === 0, `email preview at ${w} px: every visible text passes contrast ` + ecf.join("; "));
  ok(await em.evaluate(() => { const p = document.body.firstElementChild; return p.textContent.startsWith("Your QR code for check-in is inside.") && getComputedStyle(p).display === "none"; }), `email preview at ${w} px: preheader is present and hidden`);
  await snap(em, nodePath.join(OUT, `email_preview_${w}.png`), { fullPage: true });
}

console.log("Email screenshots: " + [390, 640].map((w) => nodePath.join(OUT, `email_preview_${w}.png`)).join(", ") + " (preview: email-preview.html, email-preview.txt)");
console.log(`\nScreenshots written to test/browser/out/ (${written.length}):\n  ` + written.join("\n  "));
console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL BROWSER CHECKS PASSED");
await browser.close(); server.close(); process.exit(fails ? 1 : 0);
