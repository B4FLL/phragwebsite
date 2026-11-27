# Project handoff for AI assistants

Read this first if you are an AI agent (or a new developer) picking up this repository. It explains what the site is, how the pieces fit, the rules you must not break, and what changed between 2026-11-19 and 2026-11-27. `AGENTS.md` has the short contributor rules; `README.md` is the user-facing manual. This file connects them.

## 1. What this is

- A website for a FIRST LEGO League team in Utah. Their innovation project is about invasive *Phragmites australis* (common reed) and using **cows with GPS "virtual fence" collars (digital herding)** to graze it down.
- Live site: https://b4fll.github.io/phragwebsite/ (GitHub `B4FLL/phragwebsite`, GitHub Pages serves the `main` branch root).
- Users are students, coaches, invited experts and the public. The maintainers are students, so keep explanations plain and in terms of what a visitor sees.

## 2. Architecture

- **Static site, no build step.** No bundler, no `package.json`, no framework. Each page is an HTML file that loads plain JS through `<script>` tags. Libraries come from CDNs: Leaflet 1.9.4, leaflet-rotate 0.2.8, supabase-js 2.45.4, exifr 7.1.3.
- **Backend: Supabase.** The database, magic-link email sign-in and photo storage all run on Supabase. All security is in SQL (row-level security, views and triggers), because the browser key is public.
- **Script load order matters.** Load them as `config.js` → (`geocode.js`) → `auth.js` → `script.js` → `signin-bar.js` / `cms.js` → page script. `auth.js` must come before anything that uses `window.phrag`.

### Pages

| Page | Purpose | Page script |
|---|---|---|
| `index.html` | Project story: Problem, Research, Solution, Experts, Team, Sources | `cms.js` only |
| `map.html` | Utah map of Phragmites records, report form, expert review queue, cow herds layer | `map.js`, `map.css` |
| `community.html` ("Neighborhood") | Photo feed with comments, expert tags, filter chips, reporting and moderation | `community.js`, `community.css` |
| `identify.html` | How to tell invasive from native Phragmites | — |
| `login.html` ("Members") | Email-link sign-in and member status | `login.js` |
| `privacy.html` | Privacy notice and community rules | — |
| `docs/system-flow.html` | Diagrams of the whole system (for the team, not linked in the nav) | — |

### Shared scripts

- `config.js`: `window.PHRAG_CONFIG = { supabaseUrl: "...", supabaseKey: "..." }`. This is the publishable key, so it is public by design. **Never** put a `service_role` or secret key here. Keep the exact `supabaseUrl: "..."` / `supabaseKey: "..."` format, because `.github/workflows/keep-database-awake.yml` greps for it.
- `auth.js` exposes `window.phrag = { cfg, demo, sb, getMember, photoUrls }`.
  - `getMember()` returns the signed-in user and their roles. It calls the `is_editor` and `is_expert` RPCs with a retry, and falls back to the last good answer cached in `sessionStorage` (`phragRoles`).
  - `photoUrls(bucket, paths)` returns signed URLs that last 1 hour. If signing fails (for example, before the SQL is re-run), it falls back to public URLs.
- `script.js` handles the mobile menu toggle and the footer year.
- `signin-bar.js` is the "Sign in or sign up" bar under the header for signed-out visitors.
  - It has three tabs: Community, Team member and Expert.
  - Closing it hides it for 30 days (`phragBarClosedUntil`); the "Sign in" menu item reopens it.
  - On phones (≤700px) it starts compact, as one line you tap to open.
- `cms.js` is in-page editing for editors.
  - Any element with `data-edit="key"` (text) or `data-edit-img="key"` (photo slot) can be edited and is saved to the `site_content` table. The text written in the HTML is only the default; a saved value overrides it.
  - Every save is also logged to `site_content_history`, which powers "Previous versions" and Restore.
  - Before saving, it checks `updated_at` stamps and asks before overwriting another editor's newer change.
  - The bottom editor bar adds padding to `body` (a ResizeObserver) so it never covers the footer.
  - Plain text only.
- `geocode.js`: `window.phragGeocode.search(q)` looks up an address.

### Database (`supabase/*.sql`)

Run the files in this order: `schema` → `cms` → `members` → `community` → `herds`. All of them are safe to re-run, with one catch: **after re-running `schema` or `cms`, run `members` again.** Those two recreate permission rules that check only the old `experts` / `editors` user-ID tables, overwriting the `is_expert()` / `is_editor()` rules that `members` installs. Until then, email-list experts can't review reports and email-list editors can't save edits.

| File | Contents |
|---|---|
| `schema.sql` | `reports` (map sightings), `experts`, the `public_reports` view (coordinates rounded to ~1 km for the public), and the `limit_reports()` trigger (6 per hour per hashed connection, 100 per hour overall; uses the `submitter_hash` column) |
| `cms.sql` | `site_content`, `site_content_history` and the `log_site_content()` trigger, the `site-images` bucket, and a legacy `editors` table |
| `members.sql` | `member_emails` (email + role `editor` or `expert`) and the `is_editor()` / `is_expert()` functions. New roles go in this table, but the functions also still accept the old `editors` / `experts` tables, so removing someone means checking all three. |
| `community.sql` | `posts`, `comments`, `flags`, `is_moderator()` (expert or editor), rate-limit triggers, the `public_posts` / `public_comments` views (with an inline expert tag), the **private** `community-photos` bucket, and `photo_is_visible(path)` so only visible posts' photos can be read |
| `herds.sql` | `cow_herds`. Anyone can read it; editors and experts can insert and delete. |

Rule: a schema change needs the matching client change, a README note, and a note that the SQL must be re-run.

### Data files

- `data/inat-utah.json` and `data/gbif-utah.json` are generated by `scripts/fetch-inat.ps1` and `scripts/fetch-gbif.ps1`. Don't hand-edit them.
- `.github/workflows/refresh-data.yml` runs weekly on Windows.
  - It retries each download 3 times.
  - It fails if the record counts are too low.
  - It retries the push with `git pull --rebase`.
- Store only location, date, taxon and link for each observation. No photos, no usernames.

## 3. Demo mode (keep it working)

When `config.js` has empty values, `phrag.demo` is true, `sb` is null, and every page falls back to `localStorage`. Any data-code change needs a demo path.

- **Signing in:** setting `phragDemoMember = "1"` makes you a demo member with **both** editor and expert roles.
- **Data:** `phragReports`, `phragPosts`, `phragComments`, `phragFlags`, `phragHerds`, `phragContent`, `phragContentHistory`.
- **Preferences:** `phragFilters` (map checkboxes), `phragBarClosedUntil`, `phragSignInAs`, `phragName`, and `phragMapHint` (in `sessionStorage`).
- **Storage can be blocked:** wrap `localStorage` access in try/catch, as the existing code does.
- **Not in demo:** "Show more photos" is hidden, and photo URLs are local.

## 4. Rules that must not break

- No secret keys in the client. Security changes go in SQL, not in JS checks.
- Privacy:
  - Public coordinates of reports and posts are rounded to ~1 km (posts are exact only if the poster opts in).
  - Experts and moderators see exact points.
  - Photos are re-encoded client-side to strip EXIF.
  - Hidden photos must not stay reachable, because storage is private and uses signed URLs.
- CMS fields are plain text, never HTML. Only `https://` social links are accepted.
- Style:
  - Plain ES, IIFEs, `async/await`.
  - Two-space indent, double quotes.
  - A header comment explaining each file.
  - No linter or formatter is configured.
- Git:
  - The user's workflow is one new branch per task, then merge into `main`, push, and delete the branch when asked.
  - Commit subjects are short, imperative and capitalized, with no prefixes.
  - Commit only when asked.
  - Update `README.md` when behavior, setup or SQL changes.
- When explaining a plan or result to the user, describe the issue and the fix in terms of what a visitor sees, not only the code.

## 5. Testing

There is no automated suite or CI test. Checks are Playwright scripts run by hand against a local server.

```
python3 -m http.server 8000
NODE_PATH=$HOME/.claude/skills/playwright/node_modules TARGET_URL=http://localhost:8000 node tests/<name>.check.js
```

| Script | Checks | Last result |
|---|---|---|
| `tests/mobile-menu.check.js` | Phone-width menu and header layout | 8/8 |
| `tests/small-features.check.js` | Copy link, remembered filters, downloads, chips, hidden items, sign-in cooldown | 18/18 |
| `tests/cows.check.js` | Herds layer, legend, add or remove a herd, expert photos, social links | 14/14 |
| `tests/bug-fixes.check.js` | No doubled map records, correct photo count with chips, footer not covered by the editor bar | 6/6 |
| `tests/risk-fixes.check.js` | Undo reject, dismiss reports, 100-photo paging, signed photo URLs (against a fake Supabase) | 7/7 |

How the tests work:

- They replace `config.js` with `page.route` to force demo mode, or point it at a fake `https://fake-project.supabase.co` that the script answers itself. **Never run tests against the live database.**
- Gotchas:
  - In Playwright, **routes registered later take priority**, so register the catch-all routes first.
  - The signed image GET also matches the sign route, so branch on the request method.
  - macOS has no `timeout` command.
  - Turn off smooth scrolling before measuring positions.
- Evidence for each batch of work is in `docs/evidence/*.md`, indexed in `docs/testing.md`, with screenshots in `docs/testing/`.

## 6. Changes made 2026-11-19 → 2026-11-27

Everything below is merged into `main` and pushed (the latest feature commit is `53cae3e`).

**Testing and docs**
- Added the Playwright check for the mobile menu; `docs/testing.md` became an index of the `docs/evidence/` files.
- Added `docs/system-flow.html`, `docs/features-to-add.md` (the backlog of proposed features) and `docs/merge-request.md`.

**First batch of small features and fixes**
- The Neighborhood feed no longer jumps back to a linked `#post-…` after an action.
- Verify and Reject turn off while saving and show an error if saving fails.
- The record files are fetched once per visit.
- The sign-in button has a 60-second resend cooldown.
- The map remembers its filters, can copy a link to the current view, and can download the shown records as CSV or GeoJSON with source credits.
- The Neighborhood page has filter chips (All, Looks invasive, Looks native, Not sure) and posting rules on its forms.
- Moderators get a "Hidden items" panel with Restore.
- The expert queue refreshes after an expert files a report.

**Members and sign-in**
- Editors get Previous versions and Restore in the editor bar.
- The Members page shows member status instead of role buttons, and says when a role is missing.
- The sign-in bar was added, with three tabs. Closing it hides it for 30 days, and the Sign in menu item reopens it.

**Cows (digital herding)**
- Added the cow herds map layer: a cow marker with a 2 km grazing ring for each herd.
- Each herd shows a count of invasive records within 2 km, or the distance to the nearest one.
- Editors and experts can add or remove herds.
- Added a map legend, expert photos on the Experts cards, and editable footer social links.

**Bug fixes**
- Overlapping map loads no longer double the records (`loadRun` plus a `stale()` guard).
- The photo count now follows the filter chips ("1 of 2 photos").
- The editor bar no longer covers the footer.

**Risk fixes**
- Rejected reports can be undone ("Rejected reports" panel, "Undo reject").
- Moderators can "Dismiss reports" on flagged items.
- The feed loads 100 photos at a time, with "Show more photos".
- Community photo storage is private, with signed URLs and `photo_is_visible`.
- Map reports have a rate limit.
- Editors are warned before overwriting each other's edits.
- The data refresh job retries.
- The PowerShell scripts stop on the first error.

**Visual polish**
- The menu is the same on every page (Our Project, Our Solution, Map, Neighborhood, Identify, Experts, Team, Members), with `aria-current`.
- The header is aligned with the page text, and the Menu button appears below 940px.
- The sign-in bar is slimmer.
- The map panel is tidier: "Report a sighting" is first, "Share and download" and the data note are folded, and the panel has an h1.
- Each page has one h1, a Sources link in the footer, and `favicon.svg`.

## 7. Open items and next steps

- **Waiting on the team (cannot be done from code):**
  - Re-run `schema.sql`, then `members.sql`, then `community.sql` in Supabase. This turns on the report spam limit, private photo storage and the Report button. (On 2026-11-27 the `cow_herds` table already existed, but the `flags` table from `community.sql` did not.)
  - Check that photos load and that a hidden photo's old link stops working.
  - Fill in the placeholder text and photos through Edit page.
  - Have a coach review `privacy.html`.
- **Known limitations:**
  - The new SQL and the Supabase-side behavior have only been tested in demo mode or against a fake server, not against the live project.
  - Replaced editor photos are not deleted from `site-images`, because Previous versions can restore them.
- **Possible future work (not requested yet):**
  - Herd positions that update over time, or a simulated moving herd.
  - Drawing planned virtual-fence outlines on the map.
  - A hero background photo.
  - Items in `docs/features-to-add.md`. Data download (#8) is already built; the rest are open.
- **Collar companies (researched 2026-11-27):**
  - No virtual-fence vendor publishes a public API, so a live collar link would need a vendor or ranch agreement, or exported files.
  - The vendors are Halter, Vence, eShepherd (Gallagher), Nofence and Monil.
  - The strongest local lead is USU Extension Box Elder County, which is already running virtual-fence trials to graze Phragmites (https://extension.usu.edu/boxelder/virtualfence). The second is the Utah Department of Agriculture and Food's virtual-fencing program after the Monroe Canyon fire.
