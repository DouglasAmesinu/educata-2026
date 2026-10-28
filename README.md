# Educata 2026 registration app: setup guide

Read this top to bottom and do the phases in order. Skip a step only if you have already done it. Every phase ends with a CHECK. Do not move on until the CHECK is true.

What you are building: a private registration website. Each group gets its own secret link and a seat limit. When a group is full, its link stops accepting people.

What you need before you start: a Google account (Firebase), a GitHub account, and a Cloudflare login for gabsconnect.com. Total time: about 2 to 3 hours.

Files in this folder, and which ones you upload to GitHub:
- Upload to GitHub: every `.html` and `.js` file in the top folder: `index.html`, `admin.html`, `door.html`, `scan.html`, `core.js`, `qr.js`, `qrcode-lib.js`, `gate.js`, `ticket.js`, `config.js`, `jsqr.js` (eleven files), plus the whole `assets` folder with its `fonts` subfolder (`assets/brand.css`, `assets/banner-source.jpg`, `assets/educata-logo-light.png`, `assets/hero-bg.svg`, `assets/fonts/montserrat-latin-var.woff2`, `assets/fonts/OFL-Montserrat.txt`; `hero-bg.svg` is only used to build the email banner, uploading it does no harm). If an older `assets/educata-logo.png` is in the repository, you may delete it: nothing uses it any more. Always all from the same version. In the GitHub website, open the repository, click **Add file > Upload files**, and drag the `assets` folder itself (not its contents) from File Explorer into the page, so the folder structure is kept. Then check that `assets/fonts/` exists in the repository.
- Do not upload: `test`, `functions`, `node_modules`, `firestore.rules`, `README.md`, `package.json`, `firebase.json`. `firestore.rules` is pasted into Firebase instead (Phase 1).

---

## Phase 0. Get the files

1. Download the latest `educata-2026.zip` from the chat.
2. Right-click it, **Extract All**. You now have a folder `educata-2026`.
3. Never mix files from two different zips. Old and new files break each other.

CHECK: the folder contains the eleven files and the `assets` folder listed above, plus `firestore.rules`.

---

## Phase 1. Create the database and admin login (Firebase)

Use a NEW Firebase project. Do not use the GABS Connect project, because pasting these rules there would overwrite the live GABS Connect rules.

1. Go to https://console.firebase.google.com and click **Create a project**.
2. Name it `educata-2026`. Turn Google Analytics OFF. Click **Create project**, then **Continue**.
3. Left menu: **Build > Firestore Database > Create database**.
   - Edition: Standard.
   - Location: choose a European region or the nearest one offered. You cannot change this later. Write down what you chose.
   - Mode: **Production mode**. Click **Create**.
4. Left menu: **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save**.
5. Still in Authentication, open the **Users** tab and click **Add user**. Enter your admin email and a long password. Click **Add user**.
6. In the Users table, copy the **User UID** (a long string of letters and numbers). Keep it for step 9.
7. Click the gear icon (top left) then **Project settings > General**. Scroll to **Your apps** and click the **`</>`** icon.
   - Nickname: `educata-web`. Leave Hosting unticked. Click **Register app**.
   - You will see a choice between npm and a `<script>` tag. Choose **`<script>` tag**.
   - Copy only the values inside `firebaseConfig`: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId. Ignore everything else, including measurementId.
8. Back in **Firestore Database > Data tab**, click **Start collection**.
   - Collection ID: `admins`
   - Document ID: paste the User UID from step 6
   - Add a field: name `ok`, type `boolean`, value `true`. Click **Save**.
9. Firestore Database > **Rules** tab. Delete everything in the editor. Open `firestore.rules` from your folder in Notepad, copy ALL of it, paste it into the editor, and click **Publish**.

CHECK: the Rules tab shows "Published" with no red error markers. If you see a red error, copy the exact text and send it to me. Do not continue.

---

## Phase 2. Fill in config.js

1. Open `config.js` in Notepad. Select everything and replace it with this, then fill the six values from Phase 1 step 7:

```js
export const FIREBASE_CONFIG = {
  apiKey: "PASTE_HERE",
  authDomain: "PASTE_HERE",
  projectId: "PASTE_HERE",
  storageBucket: "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId: "PASTE_HERE",
};
export const EVENT_LINE = "";
export const EMAIL_ENABLED = false;
export const PUBLIC_BASE_URL = "";
```

2. Keep the quotes. Keep the commas. Leave the last three lines exactly as shown for now.
3. Optional: put your date and venue between the quotes of EVENT_LINE, for example `Thursday 12 November, 6:30 PM, Venue, Accra`.
4. Save.

CHECK: the file has exactly four `export const` names: FIREBASE_CONFIG, EVENT_LINE, EMAIL_ENABLED, PUBLIC_BASE_URL, each once.

---

## Phase 3. Put the site online (GitHub Pages)

1. Go to https://github.com and click **New repository**. Name: `educata-2026`. Choose **Public**. Click **Create repository**. (If it already exists, open it.)
2. Click **uploading an existing file**, or **Add file > Upload files**. Drag in ONLY the eleven `.html` and `.js` files listed at the top of this guide (not the `test`, `functions` or `node_modules` folders).
3. Go to **Settings > Pages > Build and deployment**. Source: **Deploy from a branch**. Branch: `main`, folder `/ (root)`. Click **Save**.
4. Wait 2 minutes. Your site is `https://douglasamesinu.github.io/educata-2026/`.
5. In Firebase go to **Authentication > Settings > Authorized domains > Add domain** and add `douglasamesinu.github.io`.

CHECK 1: open `https://douglasamesinu.github.io/educata-2026/`. You should see the dark "Educata 2026" page with "We could not verify this invitation". That is correct, because you have no invite link yet.
CHECK 2: open `.../educata-2026/admin.html`. You should see a sign-in box.
If either page is blank: press F12, open the **Console** tab, and send me the red text.

---

## Phase 4. Create the seats and invite links

1. Open `https://douglasamesinu.github.io/educata-2026/admin.html` and sign in with your admin email and password.
2. Click **Create the 22 seat groups and invite codes**. This runs only once.
3. For each Contesting Company and Jury Member row, click **Rename** and enter the real name. Do this before sending any link.

CHECK: the Seat groups table shows 22 rows, each with a link and `0 / N` seats. The footer line says `0 registered of 258 seats`.
If you see "not on the admin list": the UID in the `admins` document does not match your user. Fix Phase 1 step 8.

---

## Phase 5. Test it before anyone else sees it

Do all of these. They are the proof that the seat limit works.

1. **Race test.** Click **Add group**, name it `TEST`, 1 place. Copy its link into two private browser windows (Ctrl+Shift+N). Fill both forms with different emails. Click **Reserve my seat** in both as close together as you can. Expect exactly one success and one "All seats for your group were just taken". Remove the winner in admin and repeat 3 times.
2. **Duplicate.** Register the same email twice on a group with spare seats. Expect "may already be registered".
3. **Bad link.** Open the site with no code. Open it with `?c=WRONGCODE12` on the end. Both must say the invitation cannot be verified.
4. **Close.** Click **Close** on TEST, open its link, and expect "Registration is closed". Then click **Delete** on TEST (it needs zero registrations; remove any test people first).
5. Open a real invite link on your phone using mobile data.
6. In admin, click **Download CSV** and open it in Excel.

7. **QR, phone and gate laptop.** You need two devices and one staff account (Phase 8 step 4 shows how to create it). Register a test guest and keep the confirmation page open (it shows the QR). On the laptop open `https://educata.gabsconnect.com/door.html` and sign in with an admin account: it says "Waiting for scans". On a phone, sign in once at any scan link (or scan the QR with the Camera app and sign in when asked). Scan the QR on the other screen. The phone says "Sent to the gate laptop" and, within a second or two, the laptop shows the guest's name and a green **Check in** button. Click it and expect "Checked in. Welcome." and the counter to move. Scan the same QR again and expect a red "ALREADY CHECKED IN" warning. The admin page (open in another window) shows "Checked in" with the time on that row without a refresh. Check-in is only possible on door.html. Then remove the test guest in the admin page.

CHECK: all seven behave as written. If any does not, stop and tell me which.

---

## Phase 6. Use your own domain for the links (educata.gabsconnect.com)

Your domain gabsconnect.com uses Cloudflare for DNS (nameservers major.ns.cloudflare.com and vera.ns.cloudflare.com). So the DNS record goes in Cloudflare, not Namecheap. Do not change the nameservers. Do not touch existing records.

1. **GitHub first.** Repository **Settings > Pages > Custom domain**. Type `educata.gabsconnect.com` and click **Save**. A DNS warning is normal for now.
2. **Cloudflare.** Go to https://dash.cloudflare.com, click **gabsconnect.com**, then **DNS > Records**. Look at the existing list and leave it alone. Click **Add record**:
   - Type: `CNAME`
   - Name: `educata`
   - Target: `douglasamesinu.github.io`
   - Proxy status: click the orange cloud so it turns GREY and says **DNS only**
   - TTL: Auto
   - Click **Save**.
3. Wait. Check at https://dnschecker.org with type CNAME for `educata.gabsconnect.com`. It should show `douglasamesinu.github.io`. In GitHub **Settings > Pages**, a green tick appears when it works (minutes to a few hours).
4. When the **Enforce HTTPS** box becomes clickable, tick it. This can take up to an hour.
5. In Firebase: **Authentication > Settings > Authorized domains > Add domain**: `educata.gabsconnect.com`.
6. In `config.js` change the last line to:

```js
export const PUBLIC_BASE_URL = "https://educata.gabsconnect.com/";
```

7. In GitHub click **Add file > Upload files**, upload `config.js`, and commit. (If you change anything else later, upload only that file.) Wait 2 minutes.
8. Open `https://educata.gabsconnect.com/admin.html`, sign in, and click **Copy** on each group again. These are your final links.

CHECK: `https://educata.gabsconnect.com/` opens the site with a padlock. A copied link looks like `https://educata.gabsconnect.com/?c=XXXXXXXXXX`.
Repeat Phase 5 tests 1 and 5 on the new address.

Warning: GitHub allows one custom domain per site. If you change domain later, links already sent stop working. Be sure before you send invitations.

---

## Phase 7. Check the security rules (strongly recommended)

The seat limit is enforced by `firestore.rules`. The Phase 5 race test is a good sign, but it cannot test deliberate attacks. `test/rules.test.mjs` can. It needs Node.js 20 or newer and Java 21 or newer on your PC.

1. Install Java if `java -version` says "not recognized": go to https://adoptium.net/temurin/releases/ , choose Windows, x64, **JDK 21**, download the `.msi`, run it, and on the "Custom Setup" screen set **Add to PATH** and **Set JAVA_HOME variable** to "Will be installed on local hard drive". Finish the installer.
2. Close PowerShell completely and open a new one in the unzipped `educata-2026` folder (Shift + right-click inside the folder, **Open PowerShell window here**). Run `java -version`. It must print a version starting with 21 or higher.
3. Run `npm install`.
4. Run `npm run test:rules`. The first run downloads the Firestore emulator (about a minute).
5. All tests must pass. If any fail, send me the output and do not send invitations.

These tests have never been run by the author. They are written but unexecuted.

---

## Phase 8. Send the invitations

1. In the admin page, click **Copy** next to each group and send that exact link to that group's contact person.
2. Watch **Registrations** on the admin page. If a link leaks, click **Close** on that group or **Remove** strangers.
3. **How the gate works.** Every guest has a QR code on their confirmation page and in their confirmation email, with the reference printed under it. At the event:
   - A **gate laptop** stays open on `https://educata.gabsconnect.com/door.html`, signed in with an admin account. It shows "Waiting for scans".
   - **Staff phones, continuous scanner (recommended for a queue).** On each staff phone open `https://educata.gabsconnect.com/scan.html` (no `?ref=` at the end) in Chrome (Android) or Safari (iPhone), sign in once, and tap **Allow** when the browser asks for the camera. The page shows a live camera view. Point it at one QR after another; there is nothing to tap between guests. Each good scan vibrates the phone and shows a big green box with the reference and **Sent**; the last 5 scans are listed with their times. The same ticket is ignored while it stays in front of the camera and for 5 seconds after, so holding it there does not send it twice. QR codes that are not our tickets are ignored without a message. Use **Torch on** in dim light (Android only; iPhones do not offer it to web pages). The screen is kept awake while the page is open, on phones that support it.
   - **No signal:** scans are not lost. The phone shows "No connection. Scans are kept and sent automatically." and **Pending (n)**, keeps them even if the page is reloaded, and sends them in order as soon as the connection is back. Do not close the browser tab until Pending has gone. Scans sent late still reach the laptop, a little later.
   - **Camera problems:** "Camera permission denied" means the camera was blocked: Android Chrome: tap the icon left of the address > **Permissions > Camera > Allow**, then reload. iPhone: **Settings > Safari > Camera > Allow** (or **Ask**), then reload. "No camera found" or "The camera is busy in another app": close other camera apps and reload.
   - **Staff phones, one scan at a time (also works).** Point the normal Camera app at the guest's QR and tap the link. The page `scan.html` opens and says "Sent to the gate laptop". The phone shows no guest details.
   - The laptop instantly shows the guest's name, organisation, group and status. The operator compares the name with the person or their ID and clicks **Check in**. The button disappears at once, the card shows "Checked in. Welcome." for about 3 seconds, then clears itself for the next scan. If the save fails, the button comes back with the error: click it again. The check-in, the time and the operator's email are saved.
   - Only door.html can check people in. The admin page shows check-in status as read-only text and updates live.
   - A second scan of the same QR shows a red "ALREADY CHECKED IN at HH:MM" warning that stays until you click **Dismiss**, so a forwarded or screenshotted QR cannot get a second person in unnoticed.
   - The counter on the laptop ("In: 12 / 40") shows how many have arrived. Tick "Sound on new scan" for a beep.
   - Below the cards, the laptop lists every participant (name, organisation, group, and an "In" badge once checked in), sorted by name. No email or phone is shown in the list. If the screen faces guests, click **Hide list**.
4. **Phone staff accounts (do this the day before).** Each scanning phone needs a staff login. Create it in Firebase **Authentication > Users > Add user** (one per person is best), copy its User UID, then **Firestore Database > Data > Start collection** (first time) with Collection ID `staff`, Document ID the UID, field `ok` boolean `true`. A staff account can only send scans. It cannot read any guest data. On each phone, open any `scan.html` link, sign in once and stay signed in. Test it the day before. Check the bottom of the scan page: it must say **Sign-in saved on this phone: yes**. If it says no, or shows "Open this link in Chrome or Safari so your sign-in is remembered.", the camera opened the link inside another app (often the Google app on Android, or Facebook, Instagram or WhatsApp), which forgets the sign-in. Fix it on that phone: use the normal Camera app, or in Google Lens tap the link and choose **Open in Chrome**, or set Chrome (Android) or Safari (iPhone) as the default browser. If the page says "This account is not allowed to send scans", the account is signed in but missing from the `staff` collection: add its UID there. The page never signs anyone out by itself; only the **Sign out** button does.
5. **Gate laptop account.** The laptop must use an account in the `admins` collection (Phase 1 step 8). Admins can see all guest details, so keep the admin list to two or three trusted people.
6. **No QR code or dead phone:** on the gate laptop type part of the name, organisation, email or reference in the search box above the list, then click the participant to open their card and **Check in**. The list draws at most 50 names at a time ("Showing 50 of 301. Keep typing to narrow the list."), so type a few letters rather than scrolling.
7. **Bad signal at the gate:** phones need internet. The continuous scanner keeps unsent scans as **Pending (n)** and sends them when the signal returns; with the one-scan page, rescan when it says "Not sent". The laptop needs internet too. Have a hotspot ready.

Keep in mind: a link is a shared secret. Anyone with it can use the seats in that group. The cap limits the damage.

---

## Part 9. Confirmation emails with the QR code

Do this after Phases 1 to 8 work. Registration, QR codes and the gate all work without it. With it, each guest gets an email containing their QR code with the reference printed under it. A server function writes the email; the browser never sends mail.

You need all four of these. If one is missing, no email is sent:
1. The Educata Firebase project is on the **Blaze** plan.
2. A **verified sending domain** at an email service (steps below use Resend).
3. The **Trigger Email from Firestore** extension installed.
4. The **function in the `functions` folder deployed**.

### 9a. Blaze plan
Firebase console, open the Educata project, gear icon, **Usage and billing > Details & settings > Modify plan > Blaze**, link your billing account. Then Google Cloud console > **Billing > Budgets & alerts** and set a small budget alert (alerts warn you; they do not stop spending). Email volume here is tiny.

### 9b. Verified sending domain (Resend), sender `educata@gabsconnect.com`
1. Sign up at https://resend.com. Free plan: 3,000 emails a month but only 100 a day, and sending pauses at the limit. If more than 100 guests may register on one day, upgrade or use a service with a larger daily limit.
2. **Domains > Add Domain**. Enter `gabsconnect.com`. Choose the sending region closest to you (Europe).
3. Resend lists three DNS records. Resend puts its mail records on a `send` name and a `resend._domainkey` name. They do not touch your existing root records, so your current website and email on `gabsconnect.com` are not affected.
4. Easiest: click Resend's **Sign in to Cloudflare** button and approve. It adds the records for you. If you prefer to do it by hand: https://dash.cloudflare.com > `gabsconnect.com` > **DNS > Records > Add record**. Add exactly the three records Resend shows: an **MX** named `send`, a **TXT** named `send`, and a **TXT** named `resend._domainkey`. Type only the short name (`send`), not `send.gabsconnect.com`. Copy the values; do not retype them. Set each one to **DNS only** (grey cloud).
5. Do NOT add anything at the root name `@`, and do NOT turn on Resend's "Inbound" feature for this domain. Either would interfere with mail already using `gabsconnect.com`.
6. DMARC: in Cloudflare look for an existing TXT record named `_dmarc`. If one exists, leave it alone. If none exists, add a TXT named `_dmarc` with value `v=DMARC1; p=none; rua=mailto:YOUR_ADDRESS`.
7. Back in Resend click **Verify DNS Records** and wait until it shows Verified (minutes to hours).
8. Resend > **API Keys > Create API Key**, permission Sending access, restricted to `gabsconnect.com`. Copy the key (starts with `re_`). Treat it like a password.

### 9c. Install the extension (console, no commands)
Firebase console > **Build > Extensions > Explore extensions > Trigger Email from Firestore > Install**. Email documents collection: `mail`. Firestore location: your database's REAL location (see below), typed exactly as shown. Cloud Functions location: the same region (for a multi-region database use `europe-west1` for `eur3` or `us-central1` for `nam5`). Do not guess: a wrong value fails with "Database '(default)' does not exist in region ...". SMTP connection URI: `smtps://resend@smtp.resend.com:465` and put the API key in the SMTP password field if the form has one; if it has none, use `smtps://resend:YOUR_API_KEY@smtp.resend.com:465`. Default FROM address: `Educata 2026 <educata@gabsconnect.com>`. Click **Install extension**.

#### How to find your database's real location
1. Firebase console > gear icon > **Project settings > General** > **Default GCP resource location**.
2. Or open https://console.cloud.google.com/firestore/databases (select your project): the **Location** column shows it.
3. Write it down. Use it for the extension and for `TRIGGER_REGION`.

To see the real location from the command line (PowerShell, in the project folder): `npx firebase firestore:databases:get "(default)" --project educata-2026` and read `locationId`.

If the extension install fails, open **Build > Extensions**, click the extension, choose **Manage > Uninstall extension**, then install again with the correct location.

### 9d. Settings file
In the `functions` folder, copy `.env.example` to `.env` and edit it (PowerShell inside `functions`: `copy .env.example .env`):
```
MAIL_FROM=Educata 2026 <educata@gabsconnect.com>
REPLY_TO=you@yourorganisation.com
TRIGGER_REGION=YOUR_DATABASE_REGION
PUBLIC_BASE_URL=https://educata.gabsconnect.com/
EVENT_TITLE=Content Creators Contest
EVENT_START_ISO=2026-11-25T18:30
EVENT_END_ISO=2026-11-25T22:00
EVENT_VENUE=...
```
(The two dates above are only a pattern: put in the real start and end.)
`REPLY_TO` is where guest replies land. `educata@gabsconnect.com` probably has no inbox, so point this at a mailbox someone reads. `TRIGGER_REGION` must match your database's real location: the same name for a single region, or `europe-west1` for `eur3`, `us-central1` for `nam5`. Do not copy `europe-west1` unless that is really where your database is. `PUBLIC_BASE_URL` must be your live address, or the email will have no QR code.

`EVENT_START_ISO` and `EVENT_END_ISO` are the start and end in Accra time (which is the same as UTC all year), written exactly like `2026-11-25T18:30`: year, month, day, the letter T, then hours and minutes on the 24-hour clock. From them the email shows the orange date card (day, month, weekday, time), puts the day and month in the subject ("You are confirmed: Content Creators Contest, 25 November"), and adds an **Add to Google Calendar** button and an attached calendar file `educata-2026.ics` for Apple Calendar and Outlook. The calendar parts appear only when both dates are set.

Email event details (an empty setting leaves its line out of the email): `EVENT_TITLE` (must be exactly `Content Creators Contest`, the official title set once in `core.js`; it is used in the subject and the calendar entry), `EVENT_DATE_TIME` (plain text, shown only if `EVENT_START_ISO` is not set), `EVENT_VENUE`, `EVENT_ADDRESS`, `EVENT_DRESS_CODE`, `EVENT_MAP_URL` (must start with `https://`), `EVENT_ORGANISER` (footer, shown exactly as you type it, default Delegation of German Industry and Commerce in Ghana). The old `EVENT_LINE` in `functions/.env` is no longer used by the email (the one in `config.js` still shows on the website). Guests see "Questions? Simply reply to this email." and replies go to `REPLY_TO`.

Before every function deploy, run `npm run check:env` in the project root. It fails, and names the settings to fix (never their values), if `EVENT_TITLE` is not exactly the title in `core.js`, if `MAIL_FROM`, `REPLY_TO`, `TRIGGER_REGION`, `PUBLIC_BASE_URL`, `EVENT_TITLE`, `EVENT_VENUE`, `EVENT_START_ISO` or `EVENT_END_ISO` is empty, if a date is not in the form `2026-11-25T18:30` or the end is not after the start, if any setting still contains example text, or if `EVENT_DATE_TIME`, `EVENT_TITLE` or `EVENT_VENUE` contains the word AND (in capitals), Sample or example.

Email images (optional): put `logo-light.png` (white logo, preferred) or `logo.png` (colour logo, shown on a white plate) in `functions\assets`, each a PNG of at most 100 KB, for the logo on the black header band, or `email-header.jpg` (JPEG, at most 140 KB) for a full-width banner instead. The banner is made for you: run `npm run build:email-banner` in the project root (needs Chrome or Edge). It draws `functions\assets\banner-source.html` (the hero artwork, the logo, "Content Creators Contest" in large white letters inside the orange viewfinder corners, and "educataGhana 2026" in orange) at 1200 by 500 pixels and saves `functions\assets\email-header.jpg`. It refuses to save if the title is smaller than 96 pixels, "educataGhana 2026" smaller than 36 pixels, or the file would be 140 KB or more, and `npm test` fails if the saved file is not exactly 1200 by 500 pixels or is 140 KB or more. The line "Delegation of German Industry and Commerce in Ghana presents" is not in the image: the email shows it as text (white on black) directly above the banner, using `EVENT_ORGANISER`. If the file is missing, the email shows a black band with the same words as live text. An image over its limit is left out and the function logs why. To see the email in a browser, run `npm run preview:email` in the project root and open `test\browser\out\email-preview.html` (sample data, your real images). After any change in `functions`, deploy the function again (9e).

### 9e. Deploy the function (needs the command line once)
There is no button for this in the console. In PowerShell, in the unzipped `educata-2026` folder (your project ID is the `projectId` value in `config.js`):
```
cd functions
npm install
cd ..
npx firebase login
npx firebase deploy --only functions --project YOUR_PROJECT_ID
```
- A browser window opens for `login`. Sign in with the Google account that owns the project.
- If asked to enable APIs (Cloud Build, Artifact Registry, Eventarc, Cloud Run), answer yes. This can take a few minutes.
- If it fails with an Eventarc or permission error on a brand new project, wait three minutes and run the deploy line again.
- The function runs on Node.js 22. Node 20 is blocked from new deployments after 30 October 2026, so do not change this.

### 9f. Prove it (do not skip)
1. Register a test guest on any invite link using your own email address.
2. Firebase console > **Firestore Database > Data > `mail`**. A document named `confirm-youremail` should appear within seconds. After a moment a `delivery` field is added. `state: SUCCESS` means the email service accepted it. `ERROR` shows why.
3. Check your inbox and spam. The QR should show. In Gmail click the three dots > **Show original** and confirm SPF, DKIM and DMARC say PASS.
4. Test in a second mail app too (for example Outlook). Some apps hide images until you allow them, so the reference is also printed under the QR.
5. Only then set `EMAIL_ENABLED = true` in `config.js`, upload it to GitHub, and hard-refresh the confirmation page. The page then tells guests an email is on its way.

### 9g. If no email arrives
| What you see | Cause and fix |
| --- | --- |
| No document appears in `mail` | The function is not deployed or is failing. Firebase console > **Build > Functions** should list `sendConfirmation`. Click it > **Logs** and read the error. Redeploy with 9e. |
| Extension install fails with "Database '(default)' does not exist in region" | The location you typed is not where your database is. Find the real location (9d), uninstall the failed extension, reinstall with the right one. |
| Function is listed but its logs show an error about permissions or region | `TRIGGER_REGION` does not match your Firestore location. Fix `functions/.env` and redeploy. |
| `mail` document exists, no `delivery` field after a minute | The extension is not installed or watches a different collection. Check 9c (collection must be `mail`). |
| `delivery.state` is `ERROR` | Read `delivery.error`. Usually the SMTP details or API key are wrong, or the sending domain is not verified yet. |
| `SUCCESS` but nothing in the inbox | Check spam. Check Resend dashboard > **Emails**. Check that SPF, DKIM and DMARC records are DNS only in Cloudflare and verified. |
| Email arrives but no QR picture | `PUBLIC_BASE_URL` is missing in `functions/.env` (redeploy after adding), or the mail app blocked images. The reference is printed in the email either way. |

Until all of this is done, keep `EMAIL_ENABLED = false`. The guest still gets the QR on the confirmation page, can save it with **Save ticket image**, and can show it at the door.

## Cost

Zero on Firebase's free Spark plan. Spark allows 50,000 reads and 20,000 writes a day and cannot bill you. The admin page and the gate laptop each read every registration once when opened (about 300 reads), then only the documents that change. Avoid reloading them repeatedly on event night.

## Known limits

- Shared links can be forwarded. The cap limits the damage.
- Emails are not verified.
- No confirmation email until the optional step above is done.
- Guest data is personal data. Delete the Firebase project after the event.

## If something goes wrong

| Symptom | Likely cause and fix |
| --- | --- |
| Admin page blank or sign-in does nothing | Mixed file versions or a missing export in `config.js`. Re-check Phase 2 and upload all four files again. Press F12 and read the Console error. |
| "Not on the admin list" | The `admins` document ID is not your User UID. Fix Phase 1 step 8. |
| Seed button fails with permission-denied | Rules not published, or the admin document is wrong. Check Phase 1 steps 8 and 9. |
| github.io address shows 404 | Pages not enabled yet or still building. Check Phase 3 step 3 and wait 2 minutes. |
| educata.gabsconnect.com shows a certificate error | The Cloudflare record is orange. Set it to grey (DNS only) and wait. |
| Links still show github.io | `PUBLIC_BASE_URL` not set or not uploaded. Redo Phase 6 steps 6 to 8. |
| Reserve my seat feels slow | Add `&debug=1` to the end of an invite link (for example `https://educata.gabsconnect.com/?c=YOURCODE&debug=1`) and register a test guest. A small black panel lists timings in milliseconds: invite verified, seat count loaded, submit tapped, write sent, write acknowledged, QR shown. The gap between write sent and write acknowledged is the network and Firebase. It shows no personal data. Remove the test guest in the admin page afterwards. |

## Making changes with Claude Code

This folder includes `CLAUDE.md`, the project's instructions for Claude Code. It explains the architecture, the files, the rules, the commands, the mistakes already made, and how to report results. Put Claude Code to work in this folder and it reads that file at the start of each session.

Useful requests: "Read CLAUDE.md, then change X. Run npm run test:all and tell me which files I must upload to GitHub." Always ask it to list what was not tested. After changes to `firestore.rules`, run `npm run test:rules` yourself and report the result.

Never put the Resend API key, passwords, or any secret in a file or in a chat.
