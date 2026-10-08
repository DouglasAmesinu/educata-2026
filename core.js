// core.js - pure logic, no Firebase imports, so it can be unit tested in Node.

export const EVENT_NAME = "Educata 2026";

// Seat plan. Cap = number of people allowed to register under that invite code.
// Total must equal 258 (checked in tests).
export const GROUP_PLAN = [
  { id: "gabs-delegates", name: "GABS Delegates", category: "GABS Delegates", cap: 50 },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `contest-co-${String(i + 1).padStart(2, "0")}`,
    name: `Contesting Company ${i + 1}`,
    category: "Contesting Companies",
    cap: 6,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `jury-${i + 1}`,
    name: `Jury Member ${i + 1} (+1)`,
    category: "Jury Members",
    cap: 2,
  })),
  { id: "last-year-participants", name: "Participants from Last Year Contest", category: "Last Year Participants", cap: 13 },
  { id: "premium-partners", name: "Premium Partners", category: "Premium Partners", cap: 50 },
  { id: "ybc-members", name: "Young Business Club Members", category: "Young Business Club", cap: 30 },
  { id: "beer-sponsors", name: "Beer Sponsors", category: "Beer Sponsors", cap: 5 },
  { id: "ahk-staff", name: "AHK Staff Members", category: "AHK Staff", cap: 30 },
  { id: "live-band", name: "Live Band Performers", category: "Live Band", cap: 10 },
];

// Unambiguous alphabet: no 0/O, 1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// rand(n) must return an integer in [0, n). Injected so tests are deterministic
// and the browser can use crypto.getRandomValues with rejection sampling.
export function randomString(len, rand) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

export function cryptoRand(n) {
  // rejection sampling to avoid modulo bias
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

// Group ids must satisfy ^[a-z0-9-]{1,40}$ (same pattern as firestore.rules).
export function makeGroupId(name, rand) {
  const base = String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "group";
  return base + "-" + randomString(5, rand).toLowerCase();
}

export const makeCode = (rand) => randomString(10, rand);
export const makeRef = (rand) => "EDU26-" + randomString(6, rand);

export function normalizeEmail(s) {
  return String(s ?? "").trim().toLowerCase();
}

// Must stay in sync with the regex in firestore.rules.
export const EMAIL_RE = /^[^@\s\/]+@[^@\s\/]+\.[^@\s\/]+$/;
export const CODE_RE = /^[A-Z0-9]{6,32}$/;

export function parseCode(search) {
  const raw = new URLSearchParams(search).get("c");
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

export function validateForm(f) {
  const errors = {};
  const name = String(f.name ?? "").trim();
  const email = normalizeEmail(f.email);
  const phone = String(f.phone ?? "").trim();
  const org = String(f.org ?? "").trim();
  if (name.length < 2 || name.length > 100) errors.name = "Enter your full name (2 to 100 characters).";
  if (email.length > 200 || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  if (phone.length > 30) errors.phone = "Phone number is too long.";
  if (org.length < 2 || org.length > 120) errors.org = "Enter your organisation (2 to 120 characters).";
  if (!f.consent) errors.consent = "Please confirm that we may use your details for this event.";
  return { ok: Object.keys(errors).length === 0, errors, clean: { name, email, phone, org } };
}

export function availability(group) {
  if (!group) return { state: "unknown", remaining: 0 };
  const remaining = Math.max(0, group.cap - group.count);
  if (group.open === false) return { state: "closed", remaining };
  if (remaining === 0) return { state: "full", remaining: 0 };
  return { state: "open", remaining };
}

// Build the document written to registrations/{emailKey}.
// serverTime is a sentinel supplied by the caller (serverTimestamp() in the browser).
export function buildRegistration({ code, gid, clean, ref, serverTime }) {
  const doc = { gid, code, name: clean.name, email: clean.email, org: clean.org, ref, createdAt: serverTime };
  if (clean.phone) doc.phone = clean.phone;
  return doc;
}

// adapter = {
//   getInvite(code) -> {gid} | null
//   commit({gid, regId, regDoc}) -> atomically: re-read group, enforce open and cap,
//        create registration, increment count. Throws Error with .code in
//        'full' | 'closed' | 'duplicate-or-denied' | 'network'
// }
export async function tryRegister(adapter, { code, form, rand, serverTime }) {
  const v = validateForm(form);
  if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors };
  const invite = await adapter.getInvite(code);
  if (!invite) return { ok: false, reason: "bad-code" };
  const ref = makeRef(rand);
  const regDoc = buildRegistration({ code, gid: invite.gid, clean: v.clean, ref, serverTime });
  try {
    await adapter.commit({ gid: invite.gid, regId: v.clean.email, regDoc });
    return { ok: true, ref, name: v.clean.name, email: v.clean.email, gid: invite.gid };
  } catch (e) {
    if (e && (e.code === "full" || e.code === "closed" || e.code === "duplicate-or-denied" || e.code === "network")) {
      return { ok: false, reason: e.code };
    }
    throw e;
  }
}

function csvCell(v) {
  let s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection (a guest could type =HYPERLINK(...) as a name).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(rows, columns) {
  const head = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(","));
  return [head, ...body].join("\r\n");
}

// Builds the guest-facing invite link. base: PUBLIC_BASE_URL from config.js ("" means use the current page).
// The link points at the site root, which GitHub Pages serves as index.html, so "index.html" is not shown.
export function inviteLink(base, currentHref, code) {
  const root = base && base.trim() ? base.trim() : new URL("./", currentHref).href;
  const clean = root.replace(/[?#].*$/, "").replace(/index\.html$/, "").replace(/\/?$/, "/");
  return clean + "?c=" + encodeURIComponent(code);
}
