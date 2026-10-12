// Shared "live gate" panel. Used by door.html (gate laptop) AND admin.html, so a scan appears
// on whichever of the two pages is open on the laptop.
import { doc, getDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { classifyLookup } from "./core.js";

const CSS = `
.gate .bar{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:6px}
.gate .count{font-weight:800;font-size:22px;color:#7a5b00}
.gate .wait{text-align:center;color:#5B5675;padding:30px 10px;border:3px dashed #cfc9e0;border-radius:18px;font-size:20px;background:#fff}
.gate .gcard{background:#fff;border:2px solid #1B1535;border-radius:16px;padding:20px;box-shadow:5px 5px 0 #1B1535;margin-top:14px;color:#1B1535}
.gate .gcard.first .gname{font-size:40px}.gate .gcard.small .gname{font-size:22px}
.gate .gname{font-size:30px;line-height:1.1;font-weight:800;margin:0 0 4px;word-break:break-word}
.gate .gsub{color:#5B5675;margin:0 0 10px}
.gate dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0 0 12px}.gate dt{color:#5B5675}.gate dd{margin:0;font-weight:600;word-break:break-word}
.gate .gstatus{padding:12px;border-radius:12px;font-weight:800;font-size:20px;margin-bottom:12px}
.gate .gstatus.new{background:#fff8e1;color:#7a5b00;border:2px solid #F2B33D}
.gate .gstatus.dup,.gate .gstatus.missing{background:#fdecea;color:#B3261E;border:2px solid #B3261E}
.gate .gstatus.done{background:#e8f6ee;color:#1F7A4D;border:2px solid #1F7A4D}
.gate button{font:inherit;border:2px solid #1B1535;border-radius:12px;background:#fff;color:#1B1535;padding:11px 16px;cursor:pointer}
.gate button.bigbtn{width:100%;padding:18px;font-weight:800;font-size:24px;background:#1F7A4D;color:#fff}
.gate button.bigbtn:disabled{opacity:.6}
.gate input[type=text]{width:100%;font:inherit;padding:11px;border:2px solid #cfc9e0;border-radius:10px;margin:6px 0 10px}
.gate .gpanel{background:#fff;border:2px solid #cfc9e0;border-radius:14px;padding:14px;margin-top:18px;color:#1B1535}
.gate .gerr{color:#B3261E;font-weight:700}
.gate .matches button{display:block;width:100%;text-align:left;margin:6px 0}
.gate .ghidden{display:none!important}`;

const HTML = `
<div class="bar"><label><input type="checkbox" id="sound"> Sound on new scan</label><span class="count" id="count"></span></div>
<div class="wait" id="wait">Waiting for scans. Guests show their QR code, staff scan it with a phone camera.</div>
<div id="cards"></div>
<div class="gpanel"><p style="margin-top:0"><b>No QR code? Look up by reference or email</b></p>
  <input type="text" id="q" placeholder="EDU26-XXXXXX or guest@email.com" autocapitalize="off" autocomplete="off">
  <button id="go">Find</button><p class="gerr" id="lookuperr"></p></div>
<div class="gpanel"><p style="margin-top:0"><b>Search by name</b></p>
  <button id="loadall">Load guest list for name search</button>
  <p class="gsub" id="loadnote">Loads every registration once (a few hundred reads). Needed only for guests without a QR code.</p>
  <input type="text" id="nameq" placeholder="Type part of a name, organisation or email" class="ghidden" autocomplete="off">
  <div class="matches" id="matches"></div></div>`;

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (ts) => { const d = ts && ts.toDate ? ts.toDate() : ts instanceof Date ? ts : null; return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "earlier"; };

// hooks: onScan(ref, entry) after a scan arrives, onChange(id, data) after a check-in.
export function mountGate(root, { db, user, hooks = {} }) {
  if (!document.getElementById("gate-css")) { const s = document.createElement("style"); s.id = "gate-css"; s.textContent = CSS; document.head.append(s); }
  root.classList.add("gate"); root.innerHTML = HTML;
  const $ = (id) => root.querySelector("#" + id);
  const gcache = {};
  let entries = [], primed = false, all = null;

  const groupName = async (gid) => { if (gcache[gid]) return gcache[gid]; try { const g = await getDoc(doc(db, "groups", gid)); gcache[gid] = g.exists() ? g.data().name : gid; } catch (e) { gcache[gid] = gid; } return gcache[gid]; };

  async function refreshCount() {
    try {
      const [done, total] = await Promise.all([getCountFromServer(query(collection(db, "registrations"), where("checkedIn", "==", true))), getCountFromServer(collection(db, "registrations"))]);
      $("count").textContent = `In: ${done.data().count} / ${total.data().count}`;
    } catch (e) { $("count").textContent = ""; }
  }

  function beep() {
    if (!$("sound").checked) return;
    try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 180); } catch (e) {}
  }

  function addEntry(e, fromScan) {
    entries = [e, ...entries.filter((x) => x.ref !== e.ref)].slice(0, 8);
    if (fromScan) beep();
    render();
    if (hooks.onScan) hooks.onScan(e.ref, e);
  }

  async function lookup(kind, value, fromScan) {
    $("lookuperr").textContent = "";
    let snap = null;
    try {
      if (kind === "ref") { const qs = await getDocs(query(collection(db, "registrations"), where("ref", "==", value), limit(1))); snap = qs.docs[0] || null; }
      else { const d = await getDoc(doc(db, "registrations", value)); snap = d.exists() ? d : null; }
    } catch (e) { return addEntry({ ref: value, state: "missing", note: "Lookup failed: " + (e.code || e.message) }, fromScan); }
    if (!snap) return addEntry({ ref: value, state: "missing", note: "No registration found. Do not admit without checking with the organiser." }, fromScan);
    const reg = snap.data();
    addEntry({ ref: reg.ref, id: snap.id, reg, state: reg.checkedIn ? "dup" : "new", gname: await groupName(reg.gid) }, fromScan);
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
        st.textContent = e.state === "done" ? "Checked in. Welcome." : e.state === "dup" ? "ALREADY CHECKED IN at " + fmt(e.reg.checkedInAt) + ". Check ID before admitting again." : "Not checked in yet. Compare the name with the guest.";
        card.append(st);
        const dl = el("dl");
        [["Group", e.gname], ["Email", e.reg.email], ["Phone", e.reg.phone || "none"], ["Reference", e.reg.ref]].forEach(([k, v]) => dl.append(el("dt", k), el("dd", v)));
        card.append(dl);
        if (e.state === "new") { const b = el("button", "Check in", "bigbtn"); b.onclick = () => checkIn(e, b); card.append(b); }
      }
      box.append(card);
    });
  }

  async function checkIn(e, b) {
    b.disabled = true;
    try {
      const out = await runTransaction(db, async (tx) => {
        const r = doc(db, "registrations", e.id); const cur = (await tx.get(r)).data();
        if (cur.checkedIn) return { already: true, data: cur };
        tx.update(r, { checkedIn: true, checkedInAt: serverTimestamp(), checkedInBy: user.email });
        return { already: false, data: { ...cur, checkedIn: true, checkedInAt: new Date(), checkedInBy: user.email } };
      });
      e.reg = out.data; e.state = out.already ? "dup" : "done"; render(); refreshCount();
      if (hooks.onChange) hooks.onChange(e.id, out.data);
    } catch (err) { b.disabled = false; $("lookuperr").textContent = "Check-in failed: " + (err.code || err.message); }
  }

  $("go").onclick = () => { const c = classifyLookup($("q").value); if (!c) { $("lookuperr").textContent = "Enter a reference like EDU26-K7M2QX or a full email address."; return; } lookup(c.type, c.value, false); };
  $("q").addEventListener("keydown", (ev) => { if (ev.key === "Enter") $("go").click(); });
  $("loadall").onclick = async () => {
    $("loadall").disabled = true;
    try { all = (await getDocs(collection(db, "registrations"))).docs.map((d) => ({ id: d.id, ...d.data() })); $("loadnote").textContent = `${all.length} guests loaded.`; $("nameq").classList.remove("ghidden"); $("nameq").focus(); }
    catch (e) { $("loadnote").textContent = "Failed: " + (e.code || e.message); $("loadall").disabled = false; }
  };
  $("nameq").oninput = () => {
    const t = $("nameq").value.trim().toLowerCase(); const m = $("matches"); m.replaceChildren();
    if (t.length < 2 || !all) return;
    all.filter((r) => [r.name, r.org, r.email].some((v) => (v || "").toLowerCase().includes(t))).slice(0, 8).forEach((r) => {
      const b = el("button", `${r.name}, ${r.org || ""} (${r.email})${r.checkedIn ? "  [in]" : ""}`); b.onclick = () => lookup("email", r.id, false); m.append(b);
    });
  };

  refreshCount();
  // First snapshot is the backlog of old scans: ignored so a page restart never replays them.
  onSnapshot(query(collection(db, "scans"), orderBy("at", "desc"), limit(20)), (snap) => {
    if (!primed) { primed = true; return; }
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { const d = ch.doc.data(); if (d && d.ref) lookup("ref", d.ref, true); } });
  }, (e) => { $("wait").textContent = "Scan relay error: " + (e.code || e.message); });

  return { lookup };
}
