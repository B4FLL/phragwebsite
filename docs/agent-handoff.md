# Agent handoff: where things stand (2026-11-27)

For the next AI agent working on this repository. This file records one assistant's work with the user from 2026-10-30 to 2026-11-27: what was done, how far it was checked, and what is still open.

Read in this order:

1. `AGENTS.md`: contributor rules.
2. [project-handoff.md](project-handoff.md): architecture, database, demo mode, rules that must not break, and a teammate's work from 11-19 to 11-22.
3. This file.

This is a snapshot. Check the code, `git log` and the live site before relying on a statement here.

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
- Before this file was written, the latest commit on `main` was `55fbcb9`, matching `origin/main`. The live `map.js` matched the local copy and `review.html` loaded.
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

## How things were checked, and what wasn't

**Browser checks.** The assistant used headless Edge against a local server (a PowerShell `HttpListener` on `localhost:8765`). A temporary `_t.html` in the project root injected test scripts and was deleted afterwards. For demo mode it replaced the `config.js` tag with `window.PHRAG_CONFIG={}`. For signed-in code it replaced the Supabase CDN tag with a stand-in. Results were read from the page title, DOM dumps or screenshots.

- `--disable-gpu` stopped images decoding and made tests hang.
- `--virtual-time-budget` was unreliable for real asynchronous work.
- An attempt to drive the browser over its DevTools connection hung and was dropped.

**Dashboard check.** Its demo-mode script covered the V key and undo, held-down keys, typing in search, batch cancel, confirm and undo, a report changed by someone else, formula neutralising, CSV round trips, and import preview and apply. The script was a temporary file and is not in the repository.

**The Playwright scripts in `tests/` could not be run on the team PC.** Their "last result" numbers in `project-handoff.md` come from earlier runs. The assistant changed the social-link expectations in `tests/cows.check.js` and has **not run that file since**. Run it first on a machine with Node.

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

- Our Research: its text and three label bullets are placeholders.
- Solution: the intro still says "Edit this text to describe exactly what your team built and tested.", and the Testing & iteration card is a placeholder. Claims in the other Solution cards need the team to confirm them.
- The Problem section's facts have no citations.
- The two expert cards, Our Team and the first Sources item are placeholders.
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

## Files outside the repository

Two Word documents are in the team PC's Documents folder. They are deliberately not published:

- `Phragmites-Next-Steps.docx`: a brainstorming article for the team.
- `Phragmites-Homework.docx`: a worksheet with 20 questions and no answer key.

Their contents were checked as text and XML. The assistant did not see their page layouts.

## Credentials

The Supabase publishable key in `config.js` is public by design. The assistant did not need the user's passwords, access tokens or a `service_role` key. Don't ask for them, and never put a secret key in the site or the repository. Database changes are made by giving the user SQL to run in Supabase.
