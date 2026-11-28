# Agent handoff: where things stand (2026-11-27)

For the next AI agent working on this repository. This file records one assistant's work with the user from 2026-10-30 to 2026-11-27: what was done, how far it was checked, and what is still open.

Read in this order:

1. `AGENTS.md`: contributor rules.
2. [project-handoff.md](project-handoff.md): architecture, database, demo mode, rules that must not break, and a teammate's work from 11-19 to 11-22.
3. This file.

This is a snapshot. Check the code, `git log` and the live site before relying on a statement here.

## Start here

- The latest work, a simpler menu and sign-in (`a191e47`) and the professional polish (`3d85a74`), was merged into `main` and pushed on 11-27 at the user's request. Both task branches were deleted.
- The user was asked to tell teammates before the polish went live, because Research and Experts are hidden until filled and the teammate's three sign-in tabs are gone. Whether they did is unknown.
- Next most useful checks: a real email sign-in through the new **Sign in** panel, the live pages on a real phone, the not-found page, a shared link's preview, and the scripts in `tests/` on a machine with Node.

## Working with the user

- The user asked the assistant to act as senior developer for their FLL team. The time window given on 2026-10-30 was about two months.
- The maintainers are students. Explain results in plain words, in terms of what a visitor sees. For Supabase tasks, give exact steps and the exact SQL to paste.
- Requests are short and informal. "Merge, push and delete" means: fast-forward `main` to the task branch, push, delete the branch.
- Git workflow: one new branch per task, commit there, and wait to be asked before merging or pushing. `AGENTS.md` says to commit only when asked.
- Teammates push to the same repository, and a data bot commits weekly. Run `git fetch --prune` and check ahead/behind before starting or merging.

## Current setup

- Live site: https://b4fll.github.io/phragwebsite/ (GitHub Pages, `main` branch root). A push to `main` publishes it.
- The repository moved to `B4FLL/phragwebsite`. The local remote on the team PC still uses the old address, `maybohubbard/phragwebsite`, and GitHub redirects it.
- The repository is treated as public. Don't add private information, student details or secret keys to any file in it.
- Check `git log` for the latest commit. After a push, compare the live files with the local ones, since GitHub Pages can take a few minutes.
- The team asked that links open the home page. At one point the user reported that "the link" went straight to the map. The main address loaded the home page in headless tests and no redirect to the map was found in the code. Which link they clicked was never confirmed.
- The team PC had no Python, Node, `gh` CLI or Microsoft Word.

## What was done in this work

**10-30 to 11-18**

- Built the site: story page, Utah map, report form, expert verification, GBIF and iNaturalist import, old-record fading and a disclaimer, rotation and satellite controls, Google Maps links.
- Connected Supabase. Added magic-link member login, in-page editing, and approved-email lists for editors and experts.
- Added the Neighborhood photo feed (photo location, comments, expert tags), address search and mobile map controls.
- Added the weekly data refresh, the database keep-alive job, the privacy page and the report button.

**11-27, after the teammate's work**

| Commit | What a visitor sees |
|---|---|
| `43a5373` | Docs only: the warning to re-run `members.sql` after `schema.sql` or `cms.sql` |
| `890808e` | Roomier map page: legend moved to the bottom right, filter spacing fixed, slimmer sign-in bar |
| `23a3060` | The team's Instagram and Facebook links in the footer |
| `759ad7a` | A Contact Us section on the home page |
| `5d6e3c2` | Experts can undo an approval from a Verified reports list |
| `55ae27f` | The expert review dashboard (`review.html`): filters, evidence map, keyboard shortcuts, batch actions, undo, spreadsheet download and upload |
| `55fbcb9` | Maps no longer zoom out until the world repeats (`minZoom: 5`) |

`README.md` describes how these behave.

**Later on 11-27: simpler menu and sign-in** (`a191e47`, live that day: the 10 changed site files matched)

- The menu went from eight links to Project, Map, Neighborhood, Identify, Team and an account button. Solution and Experts lost their menu links.
- The always-visible sign-in bar and its three tabs were replaced by a panel that opens from **Sign in**. The "this email isn't on the list" message that depended on the tabs was removed from the Members page.
- Checked in headless Edge at 1200px and 375px on all seven pages, in demo mode, signed in and out. A stand-in database checked what the email form sends. No real sign-in email was sent, and no real phone was used.
- To make a headless capture wait, serve a slow image from a second local server and make sure both servers are ready first. Captures taken without a real wait can happen before database replies are handled.
- If you must wait for a deploy, run the polling loop as a background command. Don't use an outside website as a timer.

**Later still on 11-27: professional polish** (`3d85a74`)

- Placeholder text is no longer shown to visitors: blanks are empty with an editor-only `data-hint`, and Research and Experts stay hidden until filled.
- Digital herding is worded as an idea ("would"). Don't change it to say it was built or tested unless the team confirms that.
- Added: a three-step section, record counts and a drawn Utah map (`home.js`), a team photo slot in The Problem, folded map filters (the old-data warning stays visible), an empty-Neighborhood message, link preview tags and image, `404.html`, a skip link, focus outlines and Escape for the phone menu.
- The default team line, "We're a FIRST LEGO League team from Utah.", needs the team's own introduction.
- Checked in headless Edge in demo mode at 1200px and 375px, including editing and saving a test entry in that browser only. Link previews, the live not-found page, real phones and screen readers were not tried. One colour pair, tan text against the lightest green of the hero gradient, calculates to about 2.8 to 1, which is low. The older tan label above the title uses these colors, though it sits toward the darker end.
- Filter steps in `tests/cows.check.js` and `tests/small-features.check.js` were updated for the folded panel. **Neither has been run.**
- Not done: a custom domain, a team logo and citations.
- `social-preview.png` was drawn once by a temporary script that isn't in the repository. It shows the 11-23 records and doesn't update. It carries no numbers.
- `404.html` and the `og:` tags contain the current site address. Change them if the address changes.

## How things were checked, and what wasn't

**Browser checks.** The assistant used headless Edge against a local server (a PowerShell `HttpListener` on `localhost:8765`). A temporary `_t.html` in the project root injected test scripts and was deleted afterwards. For demo mode it replaced the `config.js` tag with `window.PHRAG_CONFIG={}`. For signed-in code it replaced the Supabase CDN tag with a stand-in. Results were read from the page title, DOM dumps or screenshots.

- `--disable-gpu` stopped images decoding and made tests hang.
- `--virtual-time-budget` was unreliable for real asynchronous work.
- An attempt to drive the browser over its DevTools connection hung and was dropped.

**Dashboard check.** Its demo-mode script covered the V key and undo, held-down keys, typing in search, batch cancel, confirm and undo, a report changed by someone else, formula neutralising, CSV round trips, and import preview and apply. The script was a temporary file and is not in the repository.

**The Playwright scripts in `tests/` could not be run on the team PC.** Their "last result" numbers in `project-handoff.md` come from earlier runs. The assistant changed the social-link and filter steps in `tests/cows.check.js`, and the filter step in `tests/small-features.check.js`, and has **not run either file since**. Run those first on a machine with Node.

**Live database.** On 11-27 the user ran the SQL. The assistant then confirmed that the `flags` table, the `submitter_hash` column, the private `community-photos` bucket and the public views were in place. A screenshot of `pg_policies` from the user showed the rules using `is_editor()` and `is_expert()`.

**Not verified by the assistant:**

- The review dashboard signed in as a real expert on the live database.
- That a hidden photo's old link stops working on the live site.
- Layouts on a real phone.

## Live data on 2026-11-27

A read-only check without signing in returned HTTP 200 and no rows from `public_reports`, `public_posts`, `site_content` and `cow_herds`.

- No saved page edits means every page shows the default text from the HTML.
- `public_reports` hides only rejected reports. So there were no visible unverified or verified reports.
- Earlier that day, 4 test reports were added to the live database at the user's request (`reporter = 'TEST DATA'`, notes starting `TEST REPORT - delete me`). A fifth hit the rate limit, which was left in place. The public check can't show whether they were deleted or rejected. The same applies to a verified report the user had mentioned. Check the `reports` table in Supabase.
- If test rows remain, someone with Supabase access can remove them with:

```sql
delete from public.reports where reporter = 'TEST DATA' and notes like 'TEST REPORT%';
```

Don't add more test data to the live database unless the user asks. The project rule is that tests never run against it.

## Open items

**Not confirmed as resolved**

- The user said a friend's map report did not show up for them.
- The user sent a screenshot showing "Verified reports (0)" although a report had been verified. A stand-in test of the code counted 1. Cached old JavaScript was suspected but not proven. The suggestion was a hard refresh (Ctrl+F5) or the dashboard's Verified tab.

**Content the team still needs to write or check** (from the HTML defaults)

(Updated after the polish work: these blanks are now hidden from visitors rather than showing placeholder text.)

- Our Research, the two first expert cards and the first Sources item are blank.
- Solution: the Testing and iteration card is blank. The team should check the wording of the idea.
- Our Team has only a one-line default.
- The Problem section's facts have no citations.
- The photo slots are empty.
- An expert needs to check the Identify guide.
- A coach should review `privacy.html`.

Don't invent research results, experts or testing to fill these. Members can fill them in with **Edit page**.

## Updates to `project-handoff.md`

Its sections 6 and 7 describe the state before the 11-27 commits above. In particular, `53cae3e` is no longer the latest feature commit, and the SQL it lists as waiting to be run has since been run. The rest of section 7 can still be useful: known limitations, ideas for later, and virtual-fence research. That research was not rechecked in this work.

## Traps already hit

- **SQL order:** `schema` → `cms` → `members` → `community` → `herds`. After re-running `schema` or `cms`, run `members` again. The assistant once left `members` out of its instructions to the user.
- **Functions in views:** Postgres checks permission to execute a function inside a view against the visitor. Revoking it made the public community views return 401. The fix was to put the expert check directly in the view.
- **Re-runnable SQL:** the first scripts failed on a second run ("relation already exists"). Keep new SQL safe to re-run.
- **Sign-in:** members once appeared to lose editing rights on revisiting the Members page. The shared role check, retry and cache in `auth.js` addressed this. Don't await Supabase calls inside `onAuthStateChange` in `login.js`.
- **Review decisions:** updates are conditional on the status the expert saw (`.eq("status", fromStatus)`), so two experts can't silently overwrite each other. Keep that guard.
- **Spreadsheet text:** reporters' text is untrusted. Keep the formula neutralising in `review-csv.js`.
- **Shell:** in Git Bash, a `sed` multi-line insert collapsed lines. Use a file editing tool.

## Side topic: robot game

The user asked whether OBS recordings of their FLL robot could be linked to Claude in VS Code to suggest changes. They program with **Pybricks in VS Code**. A plan was discussed: record, extract frames with ffmpeg, log sensor readings, compare them with the code, and perhaps add OBS WebSocket control later. The user said **not to do anything yet**. Nothing was built or installed. Keep any robot files out of this public repository. Wait for the user to ask.

## Files outside the repository

Two Word documents are in the team PC's Documents folder. They are deliberately not published:

- `Phragmites-Next-Steps.docx`: a brainstorming article for the team.
- `Phragmites-Homework.docx`: a worksheet with 20 questions and no answer key.

Their contents were checked as text and XML. The assistant did not see their page layouts.

## Credentials

The Supabase publishable key in `config.js` is public by design. The assistant did not need the user's passwords, access tokens or a `service_role` key. Don't ask for them, and never put a secret key in the site or the repository. Database changes are made by giving the user SQL to run in Supabase.
