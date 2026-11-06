// Gate panel for door.html (the gate laptop). The ONLY place where participants are checked in.
// One live listener on registrations feeds the participant list, the search and the "In: x / y" counter.
// A second listener on scans shows a card when a phone scans a QR code (phones send through the relay function).
// A third listener on devices feeds the "Scanning phones" panel: add a phone with a one-time code, list, revoke.
import { getDocs, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, doc, setDoc, updateDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DONE_MS = 3000; // how long "Checked in. Welcome." stays before the card clears itself
const RECENT_MS = 20e3, NOTE_MS = 5000; // a repeat scan this soon after check-in is the same person: grey notice for 5 s, not the red card
const CODE_MS = 5 * 60e3; // an enrolment code works for 5 minutes (the relay function enforces it from the server time)

const CSS = `
.gate{font-family:var(--font-body,system-ui,sans-serif);color:var(--text,#2A2A2A)}
.gate .bar{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 14px;padding:12px 18px;background:var(--black,#000);color:var(--white,#fff);border-radius:0 0 16px 16px}
.gate .bar label{display:inline-flex;align-items:center;gap:10px;min-height:48px;font-size:18px;cursor:pointer}
.gate .bar input[type=checkbox]{width:24px;height:24px;accent-color:var(--orange,#EC8223)}
.gate .gtop{display:flex;gap:18px;align-items:center}
.gate .count{font:800 40px/1 var(--font-head,sans-serif);color:var(--orange,#EC8223);white-space:nowrap}
.gate .bar button{white-space:nowrap}
.gate .bar button{background:var(--white,#fff);color:var(--black,#000);border-color:var(--white,#fff)}
.gate .wait{text-align:center;color:var(--muted,#595959);padding:30px 10px;border:3px dashed var(--grey-300,#DBDBDB);border-radius:18px;font-size:22px;background:var(--white,#fff)}
.gate .gcard{background:var(--white,#fff);border:3px solid var(--black,#000);border-radius:18px;padding:24px;box-shadow:6px 6px 0 var(--black,#000);margin-top:16px;color:var(--text,#2A2A2A)}
.gate .gcard.first .gname{font-size:64px}.gate .gcard.small .gname{font-size:26px}
.gate .gname{font:800 34px/1.05 var(--font-head,sans-serif);color:var(--black,#000);margin:0 0 6px;overflow-wrap:break-word}
.gate .gname.anywhere{overflow-wrap:anywhere}
.gate .gsub{color:var(--muted,#595959);margin:0 0 14px;font-size:24px}
.gate dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px;margin:0 0 16px;font-size:20px}.gate dt{color:var(--muted,#595959)}.gate dd{margin:0;font-weight:600;word-break:break-word}
.gate .gstatus{padding:16px 18px;border-radius:14px;font-weight:800;font-size:24px;margin-bottom:16px}
.gate .gstatus.new{background:var(--white,#fff);color:var(--black,#000);border:3px solid var(--black,#000);border-left:12px solid var(--orange,#EC8223)}
.gate .gstatus.dup,.gate .gstatus.missing{background:var(--bad,#B3261E);color:var(--white,#fff);font-size:32px;padding:24px}
.gate .gstatus.done{background:var(--ok,#1F7A4D);color:var(--white,#fff);font-size:40px;padding:32px 24px;text-align:center}
.gate button{font:inherit;font-weight:700;min-height:48px;min-width:48px;border:2px solid var(--black,#000);border-radius:12px;background:var(--white,#fff);color:var(--black,#000);padding:11px 18px;cursor:pointer}
.gate button:focus-visible,.gate input:focus-visible{outline:4px solid var(--black,#000);outline-offset:2px}
.gate button.bigbtn{width:100%;min-height:96px;padding:20px;font-size:36px;font-weight:800;background:var(--orange,#EC8223);color:var(--black,#000);border:3px solid var(--black,#000);box-shadow:0 5px 0 var(--black,#000)}
.gate button.bigbtn:active{transform:translateY(3px);box-shadow:0 2px 0 var(--black,#000)}
.gate button.dismiss{margin-top:4px;font-size:20px;min-height:56px;padding:12px 24px}
.gate input[type=search]{width:100%;font:inherit;font-size:24px;min-height:64px;padding:14px 18px;border:3px solid var(--grey-300,#DBDBDB);border-radius:14px;margin:8px 0 12px;background:var(--white,#fff);color:var(--text,#2A2A2A)}
.gate .gpanel{background:var(--white,#fff);border:2px solid var(--grey-300,#DBDBDB);border-radius:16px;padding:18px;margin-top:22px;color:var(--text,#2A2A2A)}
.gate .gpanel > p b{font:800 24px var(--font-head,sans-serif);color:var(--black,#000)}
.gate dd.mono{font-family:var(--font-mono,monospace);letter-spacing:var(--ref-spacing,.08em)}
.gate .gerr{color:var(--bad,#B3261E);font-weight:700;font-size:20px}
.gate .matches{max-height:60vh;overflow-y:auto}
.gate .matches button{display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;min-height:72px;text-align:left;margin:8px 0;padding:12px 18px;border-color:var(--grey-300,#DBDBDB);font-weight:500}
.gate .matches button:hover{border-color:var(--black,#000);background:var(--page,#F2F2F2)}
.gate .rname{font-size:24px;font-weight:700;color:var(--black,#000)}
.gate .rmeta{color:var(--muted,#595959);font-size:18px}
.gate .badge{background:var(--ok,#1F7A4D);color:var(--white,#fff);border-radius:10px;padding:6px 14px;font-weight:800;font-size:20px}
.gate .more{margin:0 0 8px;color:var(--muted,#595959);font-size:18px;font-weight:600}.gate .more:empty{display:none}
.gate .ghidden{display:none!important}
.gate .gstatus.recent{background:#E6E6E6;color:#000000;border-left:12px solid #595959}
.gate .gstatus.undone{background:var(--white,#fff);color:var(--black,#000);border:3px solid var(--black,#000);border-left:12px solid var(--muted,#595959)}
.gate button.undo{margin:4px 0 0 12px;font-size:20px;min-height:56px;padding:12px 24px}
.gate .gcode{font:800 64px/1 var(--font-mono,monospace);letter-spacing:.15em;color:var(--black,#000);margin:14px 0 6px}
.gate .devs{margin:12px 0}
.gate .dev{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--grey-300,#DBDBDB)}
.gate .dev .rname{overflow-wrap:anywhere}
/* Narrow screens (phones, tablets): a name never breaks inside a word; its size follows its length (see fitName). */
@media (max-width:820px){
.gate .gname{overflow-wrap:normal}
.gate .gsub{font-size:18px}
.gate .bar{justify-content:space-between;gap:8px 14px}
.gate .bar label{font-size:16px;min-height:44px}
.gate .gtop{margin-left:auto;gap:14px}
.gate .count{font-size:28px}
.gate .bar button{font-size:17px;padding:8px 14px}
}`;

// The bar (sound, counter, Hide list) can live in the page header (door.html passes `bar`) so there is one black header.
const BAR = `<div class="bar"><label><input type="checkbox" id="sound"> Sound on new scan</label><span class="gtop"><button id="hidelist">Hide list</button><span class="count" id="count"></span></span></div>`;
const HTML = `
<div class="wait" id="wait">Waiting for scans. Participants show their QR code, staff scan it with a phone camera.</div>
<div id="cards"></div>
<div class="gpanel" id="listpanel"><p style="margin-top:0"><b>Participants <span id="listnote">(loading)</span></b></p>
  <input type="search" id="search" placeholder="Search name, organisation, email or reference" autocapitalize="off" autocomplete="off">
  <p class="more" id="listmore"></p>
  <div class="matches" id="list"></div></div>
<div class="gpanel" id="phones"><p style="margin-top:0"><b>Scanning phones <span id="phonenote"></span></b></p>
  <p class="rmeta" id="phonehelp"></p>
  <button id="addphone">Add scanning phone</button>
  <div id="codebox" class="ghidden"><p class="gcode" id="enrollcode"></p><p class="rmeta" id="codetime"></p></div>
  <p class="gerr" id="phoneerr"></p>
  <div class="devs" id="devices"></div>
  <button id="revokeall" class="ghidden">Revoke all phones</button></div>`;

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const LIST_MAX = 50; // the list draws at most this many matching rows; the search still finds everyone
// Narrow screens: the card name starts at 44 px (up to 20 characters) and goes down to 24 px at 60 characters, then shrinks
// further only while one word is still wider than the card. A word longer than the card at 24 px may break anywhere.
const nameStart = (n) => Math.round(44 - 20 * Math.min(1, Math.max(0, (n - 20) / 40)));
function fitName(p, first) {
  if (!window.matchMedia("(max-width:820px)").matches) return;
  let px = first ? nameStart(p.textContent.length) : 26; p.style.fontSize = px + "px";
  while (px > 24 && p.scrollWidth > p.clientWidth + 1) { px -= 2; p.style.fontSize = px + "px"; }
  if (p.scrollWidth > p.clientWidth + 1) p.classList.add("anywhere");
}
const toDate = (ts) => (ts && ts.toDate ? ts.toDate() : ts instanceof Date ? ts : null);
const ago = (d) => { if (!d) return "never"; const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000)); return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : Math.floor(s / 3600) + " h ago"; };
// A 6-digit code from crypto.getRandomValues, without modulo bias; stored only as its SHA-256 hash.
function sixDigits() { const a = new Uint32Array(1), lim = Math.floor(2 ** 32 / 1e6) * 1e6; do crypto.getRandomValues(a); while (a[0] >= lim); return String(a[0] % 1e6).padStart(6, "0"); }
const sha256hex = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const fmt = (ts) => { const d = ts && ts.toDate ? ts.toDate() : ts instanceof Date ? ts : null; return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "earlier"; };

export function mountGate(root, { db, user, bar = null }) {
  if (!document.getElementById("gate-css")) { const s = document.createElement("style"); s.id = "gate-css"; s.textContent = CSS; document.head.append(s); }
  root.classList.add("gate"); root.innerHTML = bar ? HTML : BAR + HTML;
  if (bar) { bar.classList.add("gate"); bar.innerHTML = BAR; }
  const $ = (id) => root.querySelector("#" + id) || (bar && bar.querySelector("#" + id));
  const gnames = {};
  let entries = [], primed = false, regs = null;
  const gname = (gid) => gnames[gid] || gid;

  function beep() {
    if (!$("sound").checked) return;
    try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 180); } catch (e) {}
  }

  function addEntry(e, fromScan) {
    entries = [e, ...entries.filter((x) => x.ref !== e.ref)].slice(0, 8);
    if (fromScan) beep();
    render();
  }
  const drop = (e) => { entries = entries.filter((x) => x !== e); render(); };
  function show(r, fromScan) {
    // The same reference again (several phones, or one phone twice): refresh the open card, no second beep.
    const open = entries.find((x) => x.ref === r.ref && (x.state === "new" || x.state === "undone"));
    if (open && !r.checkedIn) { if (!open.busy) open.reg = r; return render(); }
    // Checked in moments ago (no time yet means the save is still on its way): calm grey notice, gone after 5 seconds.
    const at = toDate(r.checkedInAt);
    if (r.checkedIn && (!at || Date.now() - at.getTime() < RECENT_MS)) {
      const e = { ref: r.ref, id: r.id, reg: r, state: "recent" };
      addEntry(e, fromScan); setTimeout(() => drop(e), NOTE_MS); return;
    }
    addEntry({ ref: r.ref, id: r.id, reg: r, state: r.checkedIn ? "dup" : "new" }, fromScan);
  }

  async function lookup(ref, fromScan) {
    let r = regs && regs.find((x) => x.ref === ref);
    if (!r) {
      try { const qs = await getDocs(query(collection(db, "registrations"), where("ref", "==", ref), limit(1))); const d = qs.docs[0]; r = d ? { id: d.id, ...d.data() } : null; }
      catch (e) { return addEntry({ ref, state: "missing", note: "Lookup failed: " + (e.code || e.message) }, fromScan); }
    }
    if (!r) return addEntry({ ref, state: "missing", note: "No registration found. Do not admit without checking with the organiser." }, fromScan);
    show(r, fromScan);
  }

  function render() {
    const box = $("cards"); box.replaceChildren();
    $("wait").classList.toggle("ghidden", entries.length > 0);
    entries.forEach((e, i) => {
      const card = el("div", null, "gcard " + (i === 0 ? "first" : "small"));
      if (e.state === "missing") { card.append(el("p", e.ref, "gname"), el("div", e.note, "gstatus missing")); }
      else {
        card.append(el("p", e.reg.name, "gname"), el("p", e.reg.org || "", "gsub"));
        const st = el("div", null, "gstatus " + e.state);
        st.textContent = e.state === "done" ? "Checked in. Welcome." : e.state === "recent" ? "Just checked in at " + (toDate(e.reg.checkedInAt) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) : e.state === "dup" ? "ALREADY CHECKED IN at " + fmt(e.reg.checkedInAt) + ". Check ID before admitting again." : e.state === "undone" ? "Check-in undone. Not checked in." : "Not checked in yet. Compare the name with the participant.";
        card.append(st);
        const dl = el("dl");
        [["Group", gname(e.reg.gid)], ["Email", e.reg.email], ["Phone", e.reg.phone || "none"], ["Reference", e.reg.ref]].forEach(([k, v]) => dl.append(el("dt", k), el("dd", v, k === "Reference" ? "mono" : null)));
        card.append(dl);
        if ((e.state === "new" || e.state === "undone") && !e.busy) { const b = el("button", "Check in", "bigbtn"); b.onclick = () => checkIn(e); card.append(b); }
        if (e.error) card.append(el("p", e.error, "gerr"));
        if (e.state === "dup" || e.state === "undone") { const d = el("button", "Dismiss", "dismiss"); d.onclick = () => drop(e); card.append(d); }
        if (e.state === "dup" && !e.busy) { const u = el("button", "Undo check-in", "undo"); u.onclick = () => undo(e); card.append(u); }
      }
      box.append(card);
      if (e.state !== "missing") fitName(card.querySelector(".gname"), i === 0);
    });
  }

  async function checkIn(e) {
    e.busy = true; e.error = ""; render(); // the button is gone before the save starts: no double clicks
    try {
      const out = await runTransaction(db, async (tx) => {
        const r = doc(db, "registrations", e.id); const cur = (await tx.get(r)).data();
        if (cur.checkedIn) return { already: true, data: cur };
        tx.update(r, { checkedIn: true, checkedInAt: serverTimestamp(), checkedInBy: user.email });
        return { already: false, data: { ...cur, checkedIn: true, checkedInAt: new Date(), checkedInBy: user.email } };
      });
      e.reg = out.data; e.busy = false; e.state = out.already ? "dup" : "done"; render();
      if (!out.already) setTimeout(() => drop(e), DONE_MS);
    } catch (err) { e.busy = false; e.error = "Check-in failed: " + (err.code || err.message) + ". Try again."; render(); }
  }

  // Undo a check-in (a mistaken click, or the wrong person admitted): asks first, then one transaction.
  async function undo(e) {
    if (!window.confirm(`Undo check-in for ${e.reg.name}?`)) return;
    e.busy = true; e.error = ""; render();
    try {
      const out = await runTransaction(db, async (tx) => {
        const r = doc(db, "registrations", e.id); const cur = (await tx.get(r)).data();
        if (!cur.checkedIn) return { data: cur };
        tx.update(r, { checkedIn: false, checkedInAt: deleteField(), undoneBy: user.email, undoneAt: serverTimestamp() });
        const { checkedInAt, ...rest } = cur;
        return { data: { ...rest, checkedIn: false, undoneBy: user.email, undoneAt: new Date() } };
      });
      e.reg = out.data; e.busy = false; e.state = "undone"; render();
    } catch (err) { e.busy = false; e.error = "Undo failed: " + (err.code || err.message) + ". Try again."; render(); }
  }

  function renderList() {
    if (!regs) return;
    const t = $("search").value.trim().toLowerCase();
    const rows = regs.filter((r) => !t || [r.name, r.org, r.email, r.ref].some((v) => (v || "").toLowerCase().includes(t)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    $("listnote").textContent = t ? `(${rows.length} of ${regs.length})` : `(${regs.length})`;
    $("listmore").textContent = rows.length > LIST_MAX ? `Showing ${LIST_MAX} of ${rows.length}. Keep typing to narrow the list.` : "";
    const box = $("list"); box.replaceChildren();
    for (const r of rows.slice(0, LIST_MAX)) {
      // Name, organisation and group only. Email and phone appear only on the card, after a click.
      const b = el("button"); const who = el("span");
      who.append(el("b", r.name, "rname"), el("br"), el("span", r.org || "", "rmeta rorg"), el("span", r.org ? ", " : "", "rmeta"), el("span", gname(r.gid), "rmeta rgroup"));
      b.append(who); if (r.checkedIn) b.append(el("span", "In", "badge"));
      b.onclick = () => show(r, false);
      box.append(b);
    }
  }

  $("search").oninput = renderList;
  $("hidelist").onclick = () => { const hidden = $("listpanel").classList.toggle("ghidden"); $("hidelist").textContent = hidden ? "Show list" : "Hide list"; };

  getDocs(collection(db, "groups")).then((s) => { s.docs.forEach((d) => (gnames[d.id] = d.data().name)); renderList(); render(); }).catch(() => {});
  onSnapshot(collection(db, "registrations"), (snap) => {
    regs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("count").textContent = `In: ${regs.filter((r) => r.checkedIn).length} / ${regs.length}`;
    renderList();
    let changed = false;
    for (const e of entries) {
      const r = e.id && !e.busy && e.state !== "done" && e.state !== "recent" && regs.find((x) => x.id === e.id);
      if (!r) continue;
      const next = r.checkedIn ? "dup" : e.state === "dup" ? "undone" : e.state;
      if (next !== e.state || r.checkedIn !== e.reg.checkedIn) { e.reg = r; e.state = next; changed = true; }
    }
    if (changed) render();
  }, (e) => { $("listnote").textContent = "(list error: " + (e.code || e.message) + ")"; });
  // First snapshot is the backlog of old scans: ignored so a page restart never replays them.
  onSnapshot(query(collection(db, "scans"), orderBy("at", "desc"), limit(20)), (snap) => {
    if (!primed) { primed = true; return; }
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { const d = ch.doc.data(); if (d && d.ref) lookup(d.ref, true); } });
  }, (e) => { $("wait").textContent = "Scan relay error: " + (e.code || e.message); });

  // ---- Scanning phones: enrol with a one-time code, list live, revoke ----
  let devs = [], code = null, codeTimer = null;
  $("phonehelp").textContent = `Staff phones scan participants' QR codes with the Camera app, no sign-in. To add a phone: on the phone, open ${new URL("scan.html", location.href).href} in the browser that the Camera app opens links in, press Add scanning phone here, and type the code on the phone within 5 minutes.`;
  function showCode() {
    const left = code ? code.exp - Date.now() : 0;
    if (code && code.added) { $("enrollcode").textContent = ""; $("codetime").textContent = "Phone added: " + code.added + ". Press Add scanning phone for the next one."; }
    else if (left > 0) { $("enrollcode").textContent = code.code; $("codetime").textContent = `Type this code on the phone. It works once, for ${Math.floor(left / 60e3)}:${String(Math.floor((left % 60e3) / 1000)).padStart(2, "0")} more.`; }
    else { $("enrollcode").textContent = ""; $("codetime").textContent = "Code expired. Press Add scanning phone for a new one."; }
    if (!code || code.added || left <= 0) { clearInterval(codeTimer); codeTimer = null; }
  }
  $("addphone").onclick = async () => {
    $("phoneerr").textContent = ""; $("addphone").disabled = true;
    try {
      for (let i = 0; ; i++) { // a code that collides with an existing one is refused by the rules: try another
        const c = sixDigits(), exp = Date.now() + CODE_MS;
        try { await setDoc(doc(db, "enrollCodes", await sha256hex(c)), { createdAt: serverTimestamp(), expiresAt: new Date(exp), used: false }); code = { code: c, exp, known: new Set(devs.map((d) => d.id)) }; break; }
        catch (err) { if (i >= 2) throw err; }
      }
      $("codebox").classList.remove("ghidden"); clearInterval(codeTimer); codeTimer = setInterval(showCode, 1000); showCode();
    } catch (err) { $("phoneerr").textContent = "Could not create a code: " + (err.code || err.message); }
    finally { $("addphone").disabled = false; }
  };
  const revoke = (id) => updateDoc(doc(db, "devices", id), { revoked: true }).catch((err) => { $("phoneerr").textContent = "Revoke failed: " + (err.code || err.message); });
  $("revokeall").onclick = async () => {
    const live = devs.filter((d) => !d.revoked);
    if (!live.length || !window.confirm(`Revoke all ${live.length} phones? Each will need a new code.`)) return;
    const b = writeBatch(db); live.forEach((d) => b.update(doc(db, "devices", d.id), { revoked: true }));
    try { await b.commit(); } catch (err) { $("phoneerr").textContent = "Revoke failed: " + (err.code || err.message); }
  };
  function renderDevices() {
    const live = devs.filter((d) => !d.revoked).sort((a, b) => (a.label || "").localeCompare(b.label || ""));
    const active = live.filter((d) => (toDate(d.expiresAt) || 0) > Date.now()).length;
    $("phonenote").textContent = `(${active} active)`;
    const box = $("devices"); box.replaceChildren();
    for (const d of live) {
      const exp = toDate(d.expiresAt), row = el("div", null, "dev"), who = el("span");
      const until = exp ? (exp > Date.now() ? "expires " + exp.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "expired") : "";
      who.append(el("b", d.label || "(no name)", "rname"), el("br"), el("span", `last seen ${ago(toDate(d.lastSeen))}, ${until}`, "rmeta"));
      const b = el("button", "Revoke"); b.onclick = () => revoke(d.id);
      row.append(who, b); box.append(row);
    }
    if (!live.length) box.append(el("p", "No phones set up yet.", "rmeta"));
    $("revokeall").classList.toggle("ghidden", !live.length);
  }
  onSnapshot(collection(db, "devices"), (snap) => {
    devs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fresh = code && !code.added && devs.find((d) => !code.known.has(d.id));
    if (fresh) { code.added = fresh.label || "(no name)"; showCode(); }
    renderDevices();
  }, (err) => { $("phoneerr").textContent = "Phone list error: " + (err.code || err.message); });
  setInterval(renderDevices, 30e3); // keeps "last seen" fresh

  return { lookup };
}
