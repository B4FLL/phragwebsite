# Project handoff for AI assistants

Read this first if you are an AI agent (or a new developer) picking up this repository. It covers what the site is, how the pieces fit, the rules you must not break, how to test, what has been done and checked, and what is still open. `AGENTS.md` has the short contributor rules. `README.md` is the manual for the team and describes how each feature behaves.

This is a snapshot from 2026-11-28. Check the code, `git log` and the live site before relying on a statement here.

## 1. What this is

- A website for a FIRST LEGO League team in Utah. Their innovation project is about invasive *Phragmites australis* (common reed). Their idea is to use **cows with GPS "virtual fence" collars (digital herding)** to graze it down.
- Digital herding is worded on the site as an idea ("would"). Don't change it to say it was built or tested unless the team confirms that.
- Live site: https://b4fll.github.io/phragwebsite/. GitHub Pages serves the `main` branch root of `B4FLL/phragwebsite`, so a push to `main` publishes the site.
- The site is used by students, coaches, invited experts and the public.

## 2. Working with the user

- The user is Shranaav. They asked the assistant to act as senior developer for their FLL team, over about two months starting 2026-10-30.
- **Two computers, one person.** Work was done on a Windows team PC and on Shranaav's MacBook. Commits from the team PC are labelled `Smayan <b4.fll@beehiveacademy.org>`, and commits from the Mac are labelled `Shranaav Senthil`. Both are the user's work. Don't treat the author name as a different person.
- The maintainers are students.
  - Explain results in plain words, in terms of what a visitor sees.
  - Plans should state the issue and the fix in those terms.
  - For Supabase tasks, give exact steps and the exact SQL to paste.
- Requests are short and informal. "Merge, push and delete" means: fast-forward `main` to the task branch, push, and delete the branch.
- Git workflow:
  - Make one new branch per task, commit there, and wait to be asked before merging or pushing.
  - The weekly data bot commits to `main`, and both computers push to it. Run `git fetch` and check ahead/behind before starting or merging. If a push is rejected, rebase onto `origin/main`. After a rebase, `git branch -d` refuses to delete the old branch, so confirm the content matches and then use `-D`.
- Commit subjects are short, imperative and capitalized, with no prefixes. Update `README.md` when behavior, setup or SQL changes.

## 3. Setup

- **The repository is public.** Don't add private information, student details or secret keys to any file.
- **The two computers:**
  - The **team PC** (Windows) has no Python, Node, `gh` CLI or Word. Its local remote still uses the old address `maybohubbard/phragwebsite`, and GitHub redirects it.
  - The **MacBook** has Python 3 and Node, with Playwright installed under `~/.claude/skills/playwright`.
- After a push, GitHub Pages can take a few minutes to update. Compare the live files with your local ones before saying a change is live.
- The team asked that links open the home page. The user once reported that "the link" went straight to the map. No redirect was found in the code, and the main address loads the home page. It was never confirmed which link they clicked.

## 4. Architecture

- **Static site, no build step.** There is no bundler, no `package.json` and no framework. Each page is an HTML file that loads plain JS through `<script>` tags.
- Libraries come from CDNs: Leaflet 1.9.4, leaflet-rotate 0.2.8, supabase-js 2.45.4, exifr 7.1.3.
- **Backend: Supabase** runs the database, magic-link email sign-in and photo storage. All security is in SQL (row-level security, views and triggers), because the browser key is public.
- **Script load order:** `config.js` → (`geocode.js`) → `auth.js` → `script.js` → `signin-bar.js` / `cms.js` → page script. `auth.js` must come before anything that uses `window.phrag`.

### Pages

| Page | Purpose | Page script |
|---|---|---|
| `index.html` | Project story: The Problem, Research, Solution (a three-step section), Experts, Team, Contact Us, Sources | `home.js`, `cms.js` |
| `map.html` | Utah map of Phragmites records, report form, expert review queue with Rejected and Verified lists, cow herds layer | `map.js`, `map.css` |
| `review.html` | Expert review dashboard: filters, evidence map, keyboard shortcuts, batch actions with undo, spreadsheet download and upload. Experts only | `review-csv.js`, `review.js`, `review.css` |
| `community.html` ("Neighborhood") | Photo feed with comments, expert tags, filter chips, reporting and moderation | `community.js`, `community.css` |
| `identify.html` | How to tell invasive from native Phragmites | — |
| `login.html` ("Members") | Email-link sign-in and member status | `login.js` |
| `privacy.html` | Privacy notice and community rules | — |
| `404.html` | GitHub Pages' not-found page. It relies on `<base href="/phragwebsite/">` | — |
| `docs/system-flow.html` | Diagrams of the whole system (for the team, not in the menu) | — |

The menu on every page is Project, Map, Neighborhood, Identify, Team, then an account button. Each HTML page has its own copy of the menu, so a change must be made on every page.

### Shared scripts

- **`config.js`:** `window.PHRAG_CONFIG = { supabaseUrl: "...", supabaseKey: "..." }`.
  - This is the publishable key, so it is public by design. **Never** put a `service_role` or secret key here.
  - Keep the exact `supabaseUrl: "..."` / `supabaseKey: "..."` format, because `.github/workflows/keep-database-awake.yml` greps for it.
- **`auth.js`:** exposes `window.phrag = { cfg, demo, sb, getMember, photoUrls }`.
  - `getMember()` returns the signed-in user and their roles. It calls the `is_editor` and `is_expert` RPCs with a retry, and falls back to the last good answer cached in `sessionStorage` (`phragRoles`).
  - `photoUrls(bucket, paths)` returns signed URLs that last 1 hour, and falls back to public URLs if signing fails.
- **`script.js`:** the mobile menu toggle (Escape closes it), the "Skip to content" link and the footer year.
- **`home.js`:** fills in the home page's record counts and draws its small Utah map from `data/*.json`. Its 5-year cut-off must match `OLD_YEARS` in `map.js`.
- **`signin-bar.js`:** the account button at the end of the menu (`.nav-account`) and the sign-in panel under the header.
  - In the HTML the button is a plain "Sign in" link to `login.html`.
  - For signed-out visitors, clicking it opens a one-line email form. The panel starts closed. "Team or expert sign-in" in the panel goes to the Members page.
  - For signed-in visitors the button reads "My account" and goes to the Members page (`login.js` sets that label there).
- **`cms.js`:** in-page editing for editors.
  - Any element with `data-edit="key"` (text), `data-edit-img="key"` (photo slot) or `data-edit-url="key"` (a footer social link) can be edited and is saved to the `site_content` table. The text written in the HTML is only the default; a saved value overrides it.
  - Blocks marked `data-optional` (cards or whole sections) stay hidden from visitors until they hold text other than an `h2`, or a photo. `data-hint` is the grey prompt editors see in a blank item. `cms.js` also keeps the visible section backgrounds alternating.
  - Every save is logged to `site_content_history`, which powers "Previous versions" and Restore.
  - Before saving, it checks the `updated_at` stamps and asks before overwriting another editor's newer change.
  - The bottom editor bar pads `body` (with a ResizeObserver) so the bar never covers the footer.
  - Text is plain text only. Links must start with `https://` (`safeLink`).
- **`geocode.js`:** `window.phragGeocode.search(q)` looks up an address.

### Database (`supabase/*.sql`)

Run the files in this order: `schema` → `cms` → `members` → `community` → `herds`. All of them are safe to re-run, but **after re-running `schema` or `cms`, run `members` again.** Those two files recreate permission rules that check only the old `experts` / `editors` tables, which overwrites the `is_expert()` / `is_editor()` rules from `members`. Until `members` is re-run, email-list experts can't review reports and email-list editors can't save edits.

| File | Contents |
|---|---|
| `schema.sql` | `reports` (map sightings); `experts`; the `public_reports` view (rounded to ~1 km, hides rejected reports); the `limit_reports()` trigger (6 per hour per hashed connection and 100 per hour overall, using `submitter_hash`) |
| `cms.sql` | `site_content`; `site_content_history` with the `log_site_content()` trigger; the `site-images` bucket; a legacy `editors` table |
| `members.sql` | `member_emails` (an email and a role, `editor` or `expert`) and the `is_editor()` / `is_expert()` functions. New roles go here, but the functions still accept the old `editors` / `experts` tables, so removing someone means checking all three tables. |
| `community.sql` | `posts`, `comments`, `flags`; `is_moderator()` (expert or editor); rate-limit triggers; the `public_posts` / `public_comments` views with an inline expert tag; the **private** `community-photos` bucket; and `photo_is_visible(path)`, so only visible posts' photos can be read |
| `herds.sql` | `cow_herds`. Anyone can read it; editors and experts can add and delete herds. |

A schema change needs a matching client change, a README note, and a note to re-run the SQL.

### Data files

- `data/inat-utah.json` and `data/gbif-utah.json` are generated by `scripts/fetch-inat.ps1` and `scripts/fetch-gbif.ps1`. Don't hand-edit them.
- `.github/workflows/refresh-data.yml` runs weekly. It retries each download 3 times, fails if record counts are too low, and retries the push with `git pull --rebase`. Its 2026-11-23 run committed new data.
- Store only location, date, taxon and link for each observation. No photos and no usernames.
- `social-preview.png` (the link-preview image) was drawn once by a temporary script that isn't in the repository. It doesn't update and shows no numbers. `404.html` and the `og:` tags contain the current site address, so update them if the address changes.

## 5. Demo mode (keep it working)

When `config.js` has empty values, `phrag.demo` is true, `sb` is null, and every page falls back to `localStorage`. Any change to data code needs a demo path.

- **Signing in:** `phragDemoMember = "1"` makes you a demo member with **both** the editor and expert roles.
- **Data:** `phragReports`, `phragPosts`, `phragComments`, `phragFlags`, `phragHerds`, `phragContent`, `phragContentHistory`.
- **Preferences:** `phragFilters` (map checkboxes), `phragName`, and `phragMapHint` (in `sessionStorage`).
- **Blocked storage:** storage can be blocked, so wrap `localStorage` access in try/catch, as the existing code does.
- **Not available in demo:** "Show more photos" is hidden, and photo URLs are local.

## 6. Rules that must not break

- **Keys and security:** no secret keys in the client or the repository. Security changes go in SQL, not in JS checks. Don't ask the user for passwords, tokens or a `service_role` key; make database changes by giving them SQL to run in Supabase.
- **Privacy:**
  - Public coordinates of reports and posts are rounded to ~1 km (a post is exact only if the poster opts in). Experts and moderators see the exact points.
  - Photos are re-encoded in the browser to strip EXIF data.
  - Hidden photos must not stay reachable: storage is private and uses signed URLs.
- **Editing:** CMS fields are plain text, never HTML. Only `https://` links are accepted.
- **Expert review:**
  - Review decisions are conditional on the status the expert saw (`.eq("status", fromStatus)`), so two experts can't silently overwrite each other. Keep that guard.
  - Reporters' text is untrusted. Keep the formula neutralising in `review-csv.js`.
- **Code style:** plain ES, IIFEs, `async/await`, two-space indent, double quotes, and an explanatory header comment in each file. No linter or formatter is configured.
- **Content:** don't invent research results, experts or testing to fill blank sections.
- **Test data:** don't add test data to the live database unless the user asks. Tests never run against it.

## 7. Testing

There is no automated suite and no CI test. The checks are Playwright scripts, run by hand on the Mac against a local server:

```
python3 tests/serve.py
NODE_PATH=$HOME/.claude/skills/playwright/node_modules TARGET_URL=http://localhost:8000 node tests/<name>.check.js
```

| Script | Checks | Result on 2026-11-28 (Mac) |
|---|---|---|
| `tests/mobile-menu.check.js` | Phone-width menu and header layout | Ran fine (it prints a report, not a pass count) |
| `tests/small-features.check.js` | Copy link, remembered filters, downloads, chips, hidden items, sign-in cooldown | 18/18 |
| `tests/cows.check.js` | Herds layer, legend, adding and removing a herd, expert photos, social links | 14/14 after a test fix (below) |
| `tests/bug-fixes.check.js` | No doubled map records, photo count follows the chips, footer not covered by the editor bar | 6/6 |
| `tests/risk-fixes.check.js` | Undo reject, dismiss reports, 100-photo paging, signed photo URLs (against a fake Supabase) | 7/7 |
| `tests/delete-rejected.check.js` | Delete forever on rejected reports only (map list, review dashboard single and batch), and the request a fake Supabase receives | 13/13 |

All five passed on the current `main`.

- **The `cows` test fix:** its "javascript: address is refused" check expected the Instagram link to have no address. Instagram now has a built-in address, so the check now confirms the address isn't replaced by the `javascript:` one. The site itself was already refusing it correctly.
- **Use `tests/serve.py`, not `python3 -m http.server`.** The built-in server queues only 5 waiting connections and resets the rest (`ERR_CONNECTION_RESET` on `map.js`), so tests timed out at random. With the longer queue in `tests/serve.py`, every test passed twice in a row.

How the tests work:

- They replace `config.js` with `page.route` to force demo mode, or point it at a fake `https://fake-project.supabase.co` that the script answers itself. **Never run tests against the live database.**
- Gotchas:
  - In Playwright, routes registered later take priority, so register catch-all routes first.
  - The signed image GET also matches the sign route, so branch on the request method.
  - macOS has no `timeout` command.
  - Turn off smooth scrolling before measuring positions.
- Evidence for each batch of work is in `docs/evidence/*.md`, indexed in `docs/testing.md`, with screenshots in `docs/testing/`.

**Checks on the team PC** (no Node there): headless Edge against a PowerShell `HttpListener` on `localhost:8765`.

- A temporary `_t.html` in the project root injected the test scripts and was deleted afterwards.
- For demo mode it replaced the `config.js` tag with `window.PHRAG_CONFIG={}`. For signed-in code it replaced the Supabase CDN tag with a stand-in.
- Things to avoid:
  - `--disable-gpu`, which stopped images decoding and made tests hang.
  - `--virtual-time-budget`, which was unreliable for real asynchronous work.
  - Driving the browser over DevTools, which hung.
- To make a capture wait, serve a slow image from a second local server and make sure both servers are ready first.
- To wait for a deploy, run a polling loop as a background command.
- The review dashboard was checked this way in demo mode by a temporary script that isn't in the repository. It covered keys, undo, batch actions, a report changed by someone else, formula neutralising, CSV round trips and import.

**Not verified yet:**

- The review dashboard signed in as a real expert on the live database.
- That a hidden photo's old link stops working on the live site.
- Layouts on a real phone, and screen readers.
- A real email sign-in through the new Sign in panel.
- The live not-found page, and a shared link's preview.

## 8. Live database (checked 2026-11-27)

- The user ran the SQL on 11-27. The assistant then confirmed that the `flags` table, the `submitter_hash` column, the private `community-photos` bucket and the public views exist. The user's screenshot of `pg_policies` showed the rules using `is_editor()` and `is_expert()`.
- A read-only check without signing in returned no rows from `public_reports`, `public_posts`, `site_content` and `cow_herds`. With no saved edits, every page shows the default text from its HTML.
- **Test reports may still be in the live database.** Four were added at the user's request (`reporter = 'TEST DATA'`, notes starting `TEST REPORT - delete me`). A fifth hit the rate limit. Check the `reports` table in Supabase. To remove them:

```sql
delete from public.reports where reporter = 'TEST DATA' and notes like 'TEST REPORT%';
```

## 9. History

**10-30 to 11-18 (team PC):**
- Built the story page, the Utah map, the report form and expert verification.
- Added the GBIF and iNaturalist import, faded old records with a disclaimer, rotation and satellite controls, and Google Maps links.
- Connected Supabase: magic-link sign-in, in-page editing, and editor and expert email lists.
- Added the Neighborhood feed, address search and mobile map controls.
- Added the weekly data refresh, the keep-alive job, the privacy page and the Report button.

**11-19 to 11-22 (Mac):**
- **Testing and docs:** the Playwright mobile-menu check; `docs/testing.md` became an index of `docs/evidence/`; added `docs/system-flow.html`, `docs/features-to-add.md` and `docs/merge-request.md`.
- **Small features:**
  - The Neighborhood feed no longer jumps back to a linked post.
  - Verify and Reject turn off while saving and show errors.
  - Each record file is fetched once per visit.
  - The sign-in button has a 60-second resend cooldown.
- **Map extras:** remembered filters, "Copy link to this view", and CSV or GeoJSON download of the shown records.
- **Neighborhood extras:** filter chips, posting rules on the forms, and a moderators' "Hidden items" panel with Restore.
- **Editing:** Previous versions with Restore; the Members page shows member status.
- **Cows:**
  - A herds layer with a 2 km grazing ring for each herd.
  - Each herd counts the invasive records within 2 km, or gives the distance to the nearest one.
  - Editors and experts can add or remove herds.
  - A legend, expert photos, and editable social links.
- **Bug fixes:** no doubled map records (`loadRun` plus `stale()`), the photo count follows the chips, and the editor bar no longer covers the footer.
- **Risk fixes:**
  - Rejected reports can be undone, and moderators can "Dismiss reports".
  - The feed loads 100 photos at a time, with "Show more photos".
  - Photo storage is private with signed URLs.
  - Map reports have a rate limit.
  - Editors are warned about edit conflicts.
  - The refresh job retries, and the PowerShell scripts stop on the first error.
- **Visual polish:** one h1 per page, a footer Sources link, `favicon.svg`, and a tidier map panel. A sign-in bar with three tabs and an eight-link menu were also added, but both were replaced on 11-27.

**11-27 (team PC):**

| Commit | What a visitor sees |
|---|---|
| `43a5373` | Docs only: the warning to re-run `members.sql` after `schema.sql` or `cms.sql` |
| `890808e` | A roomier map page: the legend moved to the bottom right, filter spacing fixed |
| `23a3060` | The team's Instagram and Facebook links in the footer |
| `759ad7a` | A Contact Us section on the home page |
| `5d6e3c2` | Experts can undo an approval from a Verified reports list |
| `55ae27f` | The expert review dashboard (`review.html`) |
| `55fbcb9` | Maps no longer zoom out until the world repeats (`minZoom: 5`) |
| `a191e47` | The menu is cut to five links plus an account button. The sign-in bar and its tabs became a panel that opens from Sign in. The "this email isn't on the list" message was removed. |
| `3d85a74` | Placeholders are hidden from visitors (Research and Experts stay hidden until filled). Added: the three-step section, record counts and a drawn Utah map, a team photo slot, folded map filters, an empty-Neighborhood message, link previews, `404.html`, a skip link, focus outlines and Escape for the menu |

**11-28 (Mac):**
- The two handoff notes were merged into this file.
- All five tests passed on the Mac, after the `cows` test fix in section 7.
- Experts can delete rejected reports for good: **Delete forever** in the map's Rejected reports list, and on the review dashboard's Rejected tab (one report, or **Delete selected forever**). It always asks first, can't be undone, and isn't added to the dashboard's Undo. The new `experts delete rejected` rule in `members.sql` allows deleting only reports whose status is `rejected`, and the site's request repeats that condition. **Re-run `members.sql` in Supabase to turn it on.**
- Added `tests/serve.py` (see section 7).

## 10. Traps already hit

- **SQL order:** after re-running `schema` or `cms`, run `members` again. This was once left out of the instructions given to the user.
- **Functions in views:** Postgres checks permission to run a function inside a view against the visitor. Revoking it made the public community views return 401. The fix was to put the expert check directly in the view.
- **Re-runnable SQL:** the first scripts failed on a second run ("relation already exists"). Keep new SQL safe to re-run.
- **Sign-in:** members once seemed to lose editing rights when they revisited the Members page. The shared role check, retry and cache in `auth.js` fixed it. Don't await Supabase calls inside `onAuthStateChange` in `login.js`.
- **Editing with Git Bash `sed`:** on the team PC, a multi-line `sed` insert collapsed lines. Use a file-editing tool instead.

## 11. Open items

**Waiting on the team:** re-run `supabase/members.sql` in Supabase so experts can delete rejected reports. Until then the button says "Couldn't delete, try again". Then try it once as a real expert on a test report.

**Not confirmed as resolved:**
- The user said a friend's map report didn't show up for them.
- A screenshot showed "Verified reports (0)" although a report had been verified. A test with a stand-in database counted 1, and cached old JavaScript was suspected. The suggestion was a hard refresh or the dashboard's Verified tab.
- The polish hid Research and Experts and removed the three sign-in tabs. It's unknown whether teammates were told.

**Content the team must write or check** (blanks are hidden from visitors; members fill them in with **Edit page**):
- Our Research, the first two expert cards and the first Sources item are blank.
- The Solution section's Testing and iteration card is blank, and the team should check the wording of the idea.
- Our Team has only the default line, "We're a FIRST LEGO League team from Utah."
- The Problem section's facts have no citations.
- The photo slots are empty.
- An expert should check the Identify guide, and a coach should review `privacy.html`.

**Known limitations:**
- Replaced editor photos aren't deleted from `site-images`, because Previous versions can restore them.
- One colour pair is low contrast: tan text on the lightest green of the hero gradient calculates to about 2.8 to 1.

**Ideas for later (not requested yet):**
- Herd positions that change over time, or a simulated moving herd.
- Planned virtual-fence outlines drawn on the map.
- A hero photo, a custom domain and a team logo.
- The items in `docs/features-to-add.md`. Data download (#8) is already built.

**Collar companies (researched 2026-11-27, not rechecked):**
- No virtual-fence vendor publishes a public API, so a live collar link needs a vendor or ranch agreement, or exported files.
- The vendors in the US are Halter, Vence (Merck), eShepherd (Gallagher), Nofence and Monil.
- The strongest local lead is USU Extension Box Elder County, which is already running virtual-fence trials that graze Phragmites (https://extension.usu.edu/boxelder/virtualfence).
- The second lead is the Utah Department of Agriculture and Food's virtual-fencing program after the Monroe Canyon fire.

## 12. Outside this repository

- **Robot game:** the user asked whether OBS recordings of their FLL robot (programmed with Pybricks in VS Code) could be used to suggest code changes. A plan was discussed: record, extract frames with ffmpeg, log sensor readings and compare them with the code. The user said **not to do anything yet**. Wait for them to ask, and keep any robot files out of this public repository.
- **Word documents:** two are in the team PC's Documents folder and are deliberately not published. `Phragmites-Next-Steps.docx` is a brainstorming article. `Phragmites-Homework.docx` is a 20-question worksheet with no answer key.
