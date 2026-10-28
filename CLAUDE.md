# Educata 2026 registration app: instructions for Claude Code

Read this file fully before changing anything. It is the project's memory.

## What this is
An invite-only registration site for the Educata 2026 Content Creators Contest evening event (Delegation of German Industry and Commerce in Ghana). Each seat group gets one private link and a seat cap. Guests register, get a QR ticket (on screen, as a saved image, and by email), and are checked in at the gate by scanning the QR with a phone camera. Owner and only developer: Douglas Amesinu, sole IT administrator at the Delegation of German Industry and Commerce in Ghana. He is not a full-time developer, so explain changes in plain language and give exact click paths.

## How to work with the owner (important)
- Be a ruthless mentor. Stress-test every idea and every change. Say plainly when something is a bad idea and why. Do not flatter.
- Never say a task is complete without running the tests and reporting the real numbers. Say clearly what was NOT tested (see "What cannot be tested here").
- No em dashes anywhere: not in UI text, comments, docs or replies.
- When writing instructions for him: exhaustive, numbered, full paths ("Firebase console > Build > Authentication > Users"). Prefer the browser/GUI over command line. Show the exact command only when there is no GUI way, and note Windows PowerShell quoting (for example `"(default)"`).
- Keep changes small. Do not refactor working code unless asked. Do not add features that were not requested.
- Never ask him to paste secrets into chat. Never write secrets into any file.

## Architecture (no build step, no bundler)
- Static site served by GitHub Pages at https://educata.gabsconnect.com/ (custom domain, DNS in Cloudflare, CNAME `educata` DNS-only). Plain HTML and ES modules.
- Firebase project id: `educata-2026`. Firestore database `(default)` is in region `europe-west1`. Auth: email and password.
- Firebase web SDK is loaded from `https://www.gstatic.com/firebasejs/10.12.2/...` (pinned). Do not change the version without testing. `scan.html` uses Firestore Lite and falls back to the full SDK.
- Confirmation email: Cloud Function `sendConfirmation` (in `functions/`, Node 22, region from `TRIGGER_REGION`) writes a document to the `mail` collection. The Firebase extension "Trigger Email from Firestore" sends it by SMTP through Resend (sender domain `gabsconnect.com`). The browser never sends email.
- QR codes: vendored library `qrcode-lib.js` (MIT, Kazuhiko Arase). `qr.js` wraps it.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Public registration page (invite link `?c=CODE`, add `&debug=1` for a timings panel). Hero: logo, presenter line, the official banner `assets/banner-source.jpg` as the h1 (alt text is the title), "educataGhana 2026", tagline, chip. Form, seat meter, confirmation ticket with QR, Save ticket image, Print. Registration costs one network round trip in the common case. |
| `scan.html` | Phone page. With `?ref=EDU26-XXXXXX` (opened by the camera from a QR): one scan, one doc to `scans`. Without `?ref`: continuous camera scanner (BarcodeDetector, else `jsqr.js` with a half-size second try for noisy frames; 640 px frames, about 8 a second; torch where supported; Wake Lock), accepts only our scan links or bare references (`refFromScan` in core.js), 5-second dedupe from the last sighting, queue saved in localStorage (`educata-scan-queue`) and retried (1 s up to 15 s, and on `online`) so no scan is lost, green Sent flash, last 5 scans. Staff account only. Shows no guest data, only references. Never signs anyone out by itself (only its Sign out button does); keeps the sign-in in localStorage, else IndexedDB, else memory with a warning; warns in in-app browsers (FBAN, FBAV, Instagram, Line, WhatsApp, GSA); footer shows the account and whether the sign-in is saved. |
| `door.html` | Gate laptop screen. Admin account. The ONLY place to check in. Live scan cards, live participant list with search (no email or phone in the list; draws at most 50 matching rows, search finds everyone), Hide list. Uses `gate.js`. |
| `admin.html` | Organiser page. Seat groups (seed, invite links, open/close, cap, rename, add, delete, recount) and the registrations table (search, CSV, Remove, read-only check-in status). Live listeners, no gate panel, no check-in. |
| `jsqr.js` | Vendored jsQR 1.4.0 (Apache License 2.0, full text in its header; not MIT), its `dist/jsQR.js` wrapped as an ES module. Loaded by scan.html only when the browser has no BarcodeDetector (iPhones). |
| `gate.js` | Gate panel used only by `door.html`: one live listener on registrations (list, search, counter), scan listener, check-in. |
| `core.js` | Pure logic: `EVENT_TITLE` (the official title, the one place to change it), seat plan, validation, link builders, `tryRegister`, CSV, scanner rules (`refFromScan`, `createScanQueue`). No Firebase imports. |
| `qr.js`, `qrcode-lib.js` | QR generation. |
| `ticket.js` | Draws the downloadable ticket PNG on a canvas: the official banner across the top (900 x 360), card with name, group, QR and reference, organiser footer. |
| `config.js` | Firebase web config and settings. Must export exactly: `FIREBASE_CONFIG`, `EVENT_LINE`, `EMAIL_ENABLED`, `PUBLIC_BASE_URL`. The Firebase web config is public by design. |
| `firestore.rules` | THE security. Published in Firebase console > Firestore Database > Rules (or `npx firebase deploy --only firestore:rules --project educata-2026`). |
| `functions/index.js`, `functions/compose.js`, `functions/settings.js` | Email function, email composition (table layout, inline styles, HTML escaped, image size limits), `.env` and asset reader. |
| `functions/assets/` | Optional email images: `logo-light.png` (white, preferred, straight on the black band), `logo.png` (colour, on a white plate), each max 100 KB, or `email-header.jpg` (exactly 1200 x 500, under 140 KB, banner instead of the band, made by `npm run build:email-banner` from `banner-source.html`; only the logo, the title (at least 96 px) inside the orange viewfinder corners and the orange "educataGhana 2026" (at least 36 px); `test/email.test.mjs` fails on a wrong size, file size or text). Deployed with the function. |
| `scripts/build-email-banner.mjs` | `npm run build:email-banner`: renders `functions/assets/banner-source.html` (uses `assets/hero-bg.svg`, the light logo and the self-hosted font) with puppeteer-core and saves `email-header.jpg`; fails if any banner text overflows, the title is under 96 px, "educataGhana 2026" under 36 px, or the title is outside the viewfinder corners. |
| `scripts/check-env.mjs` | `npm run check:env`: `EVENT_TITLE` exactly equal to `EVENT_TITLE` in core.js, required email settings present (including `EVENT_START_ISO` and `EVENT_END_ISO`, valid and end after start), no placeholder text, no AND/Sample/example in `EVENT_DATE_TIME`, `EVENT_TITLE`, `EVENT_VENUE`. |
| `test/preview-email.mjs` | `npm run preview:email`: writes `test/browser/out/email-preview.html` and `.txt` from sample data. |
| `functions/.env` | Local settings, never committed (see `functions/.env.example`). |
| `assets/` | Brand: `brand.css` (colour and font variables, contrast pairs), logos, self-hosted fonts. Uploaded to GitHub Pages. |
| `DESIGN.md` | Brand colours, fonts and logos with evidence from educataghana.com, and the contrast rules. |
| `test/` | All tests (see below). |
| `README.md` | Owner's step-by-step setup guide. Keep it in sync when behaviour changes. |
| `PROMPTS.md` | Prompts the owner pastes into Claude Code. Keep it in sync if commands or files change. |

The files uploaded to GitHub Pages are the eleven top-level files `index.html admin.html door.html scan.html core.js qr.js qrcode-lib.js gate.js ticket.js config.js jsqr.js` plus the whole `assets/` folder, keeping its folder structure: `assets/brand.css`, `assets/banner-source.jpg`, `assets/educata-logo-light.png`, `assets/hero-bg.svg`, `assets/fonts/montserrat-latin-var.woff2`, `assets/fonts/OFL-Montserrat.txt`. (`hero-bg.svg` is no longer shown on the site; it stays because the email banner build uses it, and uploading it does no harm.) Everything else stays off GitHub Pages. If you add a new browser file, add it to this list and to the README upload instructions, or the live site breaks.

## Data model (Firestore)
- `groups/{gid}`: `name, category, cap, count, open, lastReg`. Public read. `count` only changes by +1 together with a registration create (rules enforce it).
- `invites/{CODE}`: `{gid}`. Public single `get`, no list. 10-character code, alphabet without 0 O 1 I L.
- `registrations/{lower-cased email}`: `gid, code, name, org, email, phone?, ref, createdAt` plus admin-written `checkedIn, checkedInAt, checkedInBy`. Doc id is the email, so one registration per email. `ref` looks like `EDU26-XXXXXX`. Guests can only create. Only admins read.
- `scans/{auto id}`: `ref, at, by`. Staff or admin may create. Only admins read.
- `staff/{uid}` and `admins/{uid}`: `{ok: true}`, created by hand in the console. Roles: guest (not signed in), staff (scan only), admin (everything).
- `mail/{id}`: written only by the Cloud Function. Nobody on the client can touch it.

## The cap is enforced in the rules, not the page
Registration is one atomic commit: create `registrations/{email}` and bump `groups/{gid}.count` by exactly 1 and set `lastReg` to that email. index.html sends it as ONE `writeBatch` built from the live group snapshot (no reads first: the invite's gid comes from boot, so `tryRegister` gets `gid` and `group`). Only if the rules refuse it does the page read the group from the server (`getDocFromServer`): full or closed shows those messages, a changed count retries once with a transaction, an unchanged count means the email is already registered. The group listener ignores snapshots with `hasPendingWrites` and does not switch screens while submitting, or the guest taking the last seat would flash "All seats taken". Offline, a batch waits for the connection instead of failing: after 8 s the button says "Still connecting. Keep this page open...". `&debug=1` on an invite link shows a timings panel (labels and ms only). `firestore.rules` checks the invite code belongs to the group, the group is open, count stays <= cap, and no duplicate. Any change to registration fields or the cap logic MUST change `firestore.rules` and `test/rules.test.mjs` in the same change. Client-side checks are only for user experience.

## Commands
```
npm install                  # once, in the project root
npm test                     # fast logic tests (99, including the title spelling check over the whole project and the banner file check, scanner decoding of 600 generated QR codes and the scan queue in test/scanner.test.mjs, contrast checks in test/design.test.mjs and the organiser name in test/branding.test.mjs)
cd functions && npm install  # once, then back to root
npm run test:functions       # email function tests (6; the TRIGGER_REGION one is skipped when functions/.env exists)
npm run test:browser         # real-browser tests of the pages against Firebase stand-ins (248 checks, including the banner (frame, size, no layout shift while it loads, Full name and QR on the first screen at 390 x 844 and 1280 x 720), the saved ticket banner, registration speed with a stand-in network latency and operation counter (one write round trip, before and after figures printed), a two-browser race for the last seat through a shared stand-in server, stale-count and duplicate paths, the debug panel, the continuous scanner with a canvas stand-in camera and with Chrome's fake camera (prints the QR-to-sent latency), layout stress tests at 360, 390 and 1280 px with 301 participants, phone-fit checks, including hero pixel contrast, rendered contrast and design screenshots design_*.png; needs Chrome or Edge; set CHROME_PATH if not found; each page opens in its own window because headless Chrome freezes background tabs)
npm run test:rules           # security rules in the Firestore emulator (needs Java 21+; 23 tests)
npm run test:all             # logic + functions + browser
npm run preview:email        # write the confirmation email preview (sample data) to test/browser/out/
npm run build:email-banner   # render functions/assets/email-header.jpg from banner-source.html (needs Chrome or Edge); redeploy the function after
npm run check:env            # check functions/.env before a function deploy (prints key names only, never values)
```
Deploy function: `npx firebase deploy --only functions --project educata-2026`. Deploy site: upload the eleven files and the `assets` folder to the GitHub repository (the owner does this in the browser).

## What cannot be tested here (always say so)
- Real Firebase, real DNS and certificates, real email delivery (Resend, SPF/DKIM/DMARC), real phone camera scanning (focus, glare, low light, iOS camera permission, torch, wake lock; the tests use a canvas stand-in and Chrome's fake camera), the share sheet, and the beep. The browser tests use stand-ins in `test/browser/mocks/`. They imitate the rules but are not the rules.
- Run `npm run test:rules` after ANY change to `firestore.rules`, and report the number of passing tests.

## Gotchas already paid for (do not repeat)
- Firebase reserves env names such as `FUNCTION_REGION`. The setting is `TRIGGER_REGION`. The deploy tool did not reliably pass `.env` to analysis, so `functions/settings.js` reads `.env` itself.
- The function region, the extension location and the database must match: `europe-west1`. The extension install fails with "Database '(default)' does not exist in region" if they do not.
- Node 20 cloud runtime is blocked for new deploys after 30 October 2026. Keep Node 22.
- The extension's SMTP connection URI must contain the Resend key (`smtps://resend:KEY@smtp.resend.com:465`) or delivery fails with `Missing credentials for "PLAIN"`.
- A failed `mail` document is never retried: `confirm-<email>` is created once on purpose. To retest, delete that `mail` doc and re-register.
- Free-tier Firestore reads are limited. admin.html and door.html use live listeners: about 300 reads when opened, then one read per changed document. Never reload the whole list after an action.
- Brand colours: orange `#EC8223` is never text on white or grey (contrast 2.7). Orange buttons get black text. Change colours only in `assets/brand.css` and keep its `@pair` list true; `npm test` checks it.
- Event title: the official title is `EVENT_TITLE` in core.js ("Content Creators Contest", with the s). index.html, scan.html, the email (`EVENT_TITLE` copy in functions/compose.js, the email banner source) and `EVENT_TITLE` in functions/.env must match it; `npm test` scans the whole project (and functions/.env) for any other spelling, and `npm run check:env` checks the setting. To rename: change core.js, then run `npm test` and fix every file it names, then `npm run build:email-banner`.
- Invite page hero: navy `#0A2232` (the banner's own background, `--navy` in brand.css) fading to black. The banner `assets/banner-source.jpg` must be a JPEG, 2.5 to 1: 1000 x 400 under 120 KB, or a larger original up to 2000 x 800 and 200 KB (`npm test` checks, and checks that the img width and height attributes in index.html equal the file's real size: update them if you replace the file). Its width is limited on short screens (`100vh - 560px` in the h1 rule) so the Full name field and the QR stay on the first screen at 1280 x 720 (400 px wide there; 1000 px on taller screens). The browser test reads the real pixels behind every hero text line and needs 4.5 contrast.
- All site files (the eleven plus `assets/`) must come from the same version. A missing export in `config.js` blanks the admin or public page.
- Do not use em dashes in text.
- The email (including base64 images) is stored in one Firestore `mail` document (limit 1 MiB). Keep it under 600 KB: logo max 100 KB, banner max 140 KB, plus the QR and the .ics, HTML under 100 KB (Gmail clips larger). Tests assert this.
- The email uses the brand from DESIGN.md, in this order: the presenter line (`EVENT_ORGANISER` presents) as live text, white 14 px on black, then the banner image (or, without the banner, a black band with all the words as live text), orange rule, headline and greeting, date card (orange date cell with black text from `EVENT_START_ISO`, Accra time), ticket card (orange top border, dashed divider, QR 220 px on white, reference in monospace), How it works, Add to calendar (Google button and attached `educata-2026.ics`, only when `EVENT_START_ISO` and `EVENT_END_ISO` are both set; the .ics never holds the guest's name or email), black footer with `EVENT_ORGANISER` exactly as typed. Headings are Arial bold. An email link cannot open an attachment, so the .ics is named in text, not a second button. Orange is never small text on white or grey (tests check it). The email body never shows the REPLY_TO address; it says "Questions? Simply reply to this email.". `EVENT_LINE` in functions/.env is not used by the email (config.js EVENT_LINE is the website's). The logo has a transparent background with dark grey letters, so it sits on a white panel inside the band.
- jsQR misreads tilted codes in noisy frames (dim light). scan.html retries each missed frame at half size, which averages the noise; test/scanner.test.mjs proves the retry is needed and measures heavy-noise success. Do not remove it.
- Text typed by guests (name, organisation) must never be put into HTML with innerHTML (use textContent) or into an email subject or header. `escapeHtml` is used for the email body.

## Current status and open items
- Built and tested: registration, caps, QR ticket, saved ticket image, phone scan relay, gate laptop (live list, search, check-in), live admin page, CSV.
- Email: the function creates `mail` documents. Delivery failed with missing SMTP credentials until the extension is reconfigured with the Resend key. `EMAIL_ENABLED` stays `false` in `config.js` until a real test email (with QR, correct sender, reply-to, SPF/DKIM/DMARC pass) has been received.
- Rules tests (23) should be re-run by the owner after the latest rules change and reported.
- Known limits: shared invite links can be forwarded (cap limits damage), email addresses are not verified, guests need internet at the gate, a QR is a forwardable ticket (the gate shows the name and warns on a second scan).

## Before you finish any change
1. Run `npm run test:all` (and `npm run test:rules` if rules or data shape changed). Report the counts.
2. List exactly which files changed and which of them must be re-uploaded to GitHub, redeployed (functions), or republished (rules).
3. Update `README.md` and this file if behaviour, files, or commands changed.
4. State what you could not verify.
