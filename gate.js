// Gate panel for door.html (the gate laptop). The ONLY place where participants are checked in.
// One live listener on registrations feeds the participant list, the search and the "In: x / y" counter.
// A second listener on scans shows a card when a phone scans a QR code.
import { getDocs, collection, query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DONE_MS = 3000; // how long "Checked in. Welcome." stays before the card clears itself

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
  <div class="matches" id="list"></div></div>`;

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
        [["Group", gname(e.reg.gid)], ["Email", e.reg.email], ["Phone", e.reg.phone || "none"], ["Reference", e.reg.ref]].forEach(([k, v]) => dl.append(el("dt", k), el("dd", v, k === "Reference" ? "mono" : null)));
        card.append(dl);
        if (e.state === "new" && !e.busy) { const b = el("button", "Check in", "bigbtn"); b.onclick = () => checkIn(e); card.append(b); }
        if (e.error) card.append(el("p", e.error, "gerr"));
        if (e.state === "dup") { const d = el("button", "Dismiss", "dismiss"); d.onclick = () => drop(e); card.append(d); }
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
  }, (e) => { $("listnote").textContent = "(list error: " + (e.code || e.message) + ")"; });
  // First snapshot is the backlog of old scans: ignored so a page restart never replays them.
  onSnapshot(query(collection(db, "scans"), orderBy("at", "desc"), limit(20)), (snap) => {
    if (!primed) { primed = true; return; }
    snap.docChanges().forEach((ch) => { if (ch.type === "added") { const d = ch.doc.data(); if (d && d.ref) lookup(d.ref, true); } });
  }, (e) => { $("wait").textContent = "Scan relay error: " + (e.code || e.message); });

  return { lookup };
}
