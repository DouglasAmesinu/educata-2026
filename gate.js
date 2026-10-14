// Gate panel for door.html (the gate laptop). The ONLY place where participants are checked in.
// One live listener on registrations feeds the participant list, the search and the "In: x / y" counter.
// A second listener on scans shows a card when a phone scans a QR code.
import { getDocs, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DONE_MS = 3000; // how long "Checked in. Welcome." stays before the card clears itself

const CSS = `
.gate .bar{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:6px}
.gate .gtop{display:flex;gap:12px;align-items:center}
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
.gate input[type=search]{width:100%;font:inherit;padding:11px;border:2px solid #cfc9e0;border-radius:10px;margin:6px 0 10px}
.gate .gpanel{background:#fff;border:2px solid #cfc9e0;border-radius:14px;padding:14px;margin-top:18px;color:#1B1535}
.gate .gerr{color:#B3261E;font-weight:700}
.gate .matches{max-height:60vh;overflow-y:auto}
.gate .matches button{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;margin:6px 0}
.gate .rmeta{color:#5B5675;font-size:15px}
.gate .badge{background:#1F7A4D;color:#fff;border-radius:8px;padding:2px 10px;font-weight:800;font-size:15px}
.gate .ghidden{display:none!important}`;

const HTML = `
<div class="bar"><label><input type="checkbox" id="sound"> Sound on new scan</label><span class="gtop"><span class="count" id="count"></span><button id="hidelist">Hide list</button></span></div>
<div class="wait" id="wait">Waiting for scans. Participants show their QR code, staff scan it with a phone camera.</div>
<div id="cards"></div>
<div class="gpanel" id="listpanel"><p style="margin-top:0"><b>Participants</b> <span class="gsub" id="listnote">Loading...</span></p>
  <input type="search" id="search" placeholder="Search name, organisation, email or reference" autocapitalize="off" autocomplete="off">
  <div class="matches" id="list"></div></div>`;

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (ts) => { const d = ts && ts.toDate ? ts.toDate() : ts instanceof Date ? ts : null; return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "earlier"; };

export function mountGate(root, { db, user }) {
  if (!document.getElementById("gate-css")) { const s = document.createElement("style"); s.id = "gate-css"; s.textContent = CSS; document.head.append(s); }
  root.classList.add("gate"); root.innerHTML = HTML;
  const $ = (id) => root.querySelector("#" + id);
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
  const show = (r, fromScan) => addEntry({ ref: r.ref, id: r.id, reg: r, state: r.checkedIn ? "dup" : "new" }, fromScan);

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
        st.textContent = e.state === "done" ? "Checked in. Welcome." : e.state === "dup" ? "ALREADY CHECKED IN at " + fmt(e.reg.checkedInAt) + ". Check ID before admitting again." : "Not checked in yet. Compare the name with the participant.";
        card.append(st);
        const dl = el("dl");
        [["Group", gname(e.reg.gid)], ["Email", e.reg.email], ["Phone", e.reg.phone || "none"], ["Reference", e.reg.ref]].forEach(([k, v]) => dl.append(el("dt", k), el("dd", v)));
        card.append(dl);
        if (e.state === "new" && !e.busy) { const b = el("button", "Check in", "bigbtn"); b.onclick = () => checkIn(e); card.append(b); }
        if (e.error) card.append(el("p", e.error, "gerr"));
        if (e.state === "dup") { const d = el("button", "Dismiss", "dismiss"); d.onclick = () => drop(e); card.append(d); }
      }
      box.append(card);
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

  function renderList() {
    if (!regs) return;
    const t = $("search").value.trim().toLowerCase();
    const rows = regs.filter((r) => !t || [r.name, r.org, r.email, r.ref].some((v) => (v || "").toLowerCase().includes(t)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    $("listnote").textContent = t ? `${rows.length} of ${regs.length} participants` : `${regs.length} participants`;
    const box = $("list"); box.replaceChildren();
    for (const r of rows) {
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
  }, (e) => { $("listnote").textContent = "Participant list error: " + (e.code || e.message); });
  // First snapshot is the backlog of old scans: ignored so a page restart never replays them.
  onSnapshot(query(collection(db, "scans"), orderBy("at", "desc"), limit(20)), (snap) => {
    if (!primed) { primed = true; return; }
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { const d = ch.doc.data(); if (d && d.ref) lookup(d.ref, true); } });
  }, (e) => { $("wait").textContent = "Scan relay error: " + (e.code || e.message); });

  return { lookup };
}
