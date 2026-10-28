# Prompts to paste into Claude Code (run it inside this project folder)

Claude Code reads CLAUDE.md automatically. Paste one prompt at a time. Every prompt ends with the same FINISH block, so paste that too (or keep it saved as a snippet).

## FINISH block (add to the end of every prompt)
```
Follow CLAUDE.md. Make the smallest change that works. Do not add anything I did not ask for. When done: run npm run test:all and tell me the exact counts; show git diff --stat; list which files I must upload to GitHub, which need a functions deploy, and whether firestore.rules must be republished; say plainly what you could NOT test. Do not run any deploy or push command unless I ask. Never print or write any secret.
```

## 0. First check (run once after setup, and after any big change)
```
Read CLAUDE.md. Then:
1. Run npm install in the project root and in functions.
2. Run npm run test:all and report the exact counts.
3. Check config.js exports exactly FIREBASE_CONFIG, EVENT_LINE, EMAIL_ENABLED, PUBLIC_BASE_URL, and that FIREBASE_CONFIG has no PASTE_ placeholders. Do not print the values.
4. Check functions/.env exists and has TRIGGER_REGION=europe-west1, and that REPLY_TO and EVENT_LINE are not my old example values (you@yourorganisation.com, "Thursday 12 November, 6:30 PM, Venue, Accra"). Tell me which are wrong. Do not print any other values.
5. If this folder is not a git repository, run git init and make a first commit named "baseline". Confirm functions/.env is ignored.
6. Tell me what you could not check.
```

## 1. Turn a concern into a fix (stress-test first)
```
Here are my concerns about the app:
- (write each concern on its own line)
For each one: try to reproduce it or prove it from the code, say if it is a real problem or I am wrong, say how bad it is, and propose the smallest fix. Write failing tests first where possible. Do not change any code until I reply "go".
```

## 2. Change wording or layout (small, safe)
```
Change [describe: for example the headline on the confirmation page / the email subject / the colour of the Check in button] to [what you want]. Only touch what is needed. If the change affects the email, update the tests too.
```

## 3. Add a feature (stress-test the idea first)
```
I want to add: [feature]. First act as a ruthless reviewer: list the risks, the privacy and security impact, the cost, and whether a simpler option exists. Tell me if it is a bad idea. Wait for my "go" before editing. When I say go: write the tests first, then the code, and update firestore.rules and test/rules.test.mjs together if data or permissions change.
```

## 4. Security review (before the event)
```
Review firestore.rules and all pages as an attacker. Try to find any way for a guest to exceed a group cap, register without a valid invite code, read another guest's data, edit or delete a registration, spam the scans queue, or send email to someone who did not register. Write a failing test for each real problem (in test/rules.test.mjs or the browser tests). Do not fix anything until I reply "go".
```

## 5. Publish the site without manual uploads (set up once)
```
Create scripts/publish-site.mjs and an npm script "publish:site". It must copy ONLY the site files listed in CLAUDE.md (index.html admin.html door.html scan.html core.js qr.js qrcode-lib.js gate.js ticket.js config.js jsqr.js and the assets folder) into a local clone of my GitHub Pages repository, whose folder comes from the environment variable PAGES_REPO. Rules: refuse to run if PAGES_REPO is not set or is not a git repository; never copy any other file; never touch or delete the CNAME file; show me the list of files that changed and git diff --stat; run npm run test:all first and stop if anything fails; commit and push ONLY after I type yes. Add a test that the whitelist is exactly those files. Then give me exact Windows steps to clone the Pages repo to C:\dev\educata-pages and set PAGES_REPO. Do not run git push yourself while building this.
```

## 6. Deploy the email function (after a change in functions/)
```
Run npm run test:all and npm run test:functions. If they pass, show me the exact command you will run: npx firebase deploy --only functions --project educata-2026, and wait for me to say yes. After it runs, explain the output in plain language, and if it failed tell me the first real error and the most likely cause.
```

## 7. Republish the security rules (after a change to firestore.rules)
```
Remind me to run npm run test:rules and ask me to paste the result. If I confirm all pass, show me the exact command: npx firebase deploy --only firestore:rules --project educata-2026, and wait for my yes before running it. Explain the result in plain language.
```

## 8. Undo
```
Show me git log and git diff for the last change. If I say "undo", revert it using git (do not delete my functions/.env or config.js) and run npm run test:all.
```
