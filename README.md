# Phragmites Website

Website and Utah tracking map for our FIRST LEGO League innovation project on invasive Phragmites.

## Files

- `index.html` – project story (Problem, Research, Solution, Experts, Team, Sources)
- `map.html`, `map.js`, `map.css` – Utah map, report form, expert verification
- `identify.html` – guide to telling invasive from native Phragmites
- `login.html`, `login.js` – member sign-in (email link)
- `auth.js` – shared sign-in code; `cms.js` – lets members edit text and photos on the page
- `supabase/cms.sql` – tables and rules for editable content and photos
- `data/inat-utah.json` – Utah observations pulled directly from iNaturalist (newest data)
- `data/gbif-utah.json` – museum/herbarium and other records from GBIF (iNaturalist records are excluded here to avoid duplicates)
- `scripts/fetch-inat.ps1`, `scripts/fetch-gbif.ps1` – re-download those two files (see "Refreshing the data")
- `supabase/schema.sql` – database tables and privacy rules
- `config.js` – database connection settings (empty = demo mode)

## Viewing locally

The map loads its data with `fetch`, so open it through a local server, not by double-clicking the file.
In PowerShell, any static server works; VS Code's "Live Server" extension is the easiest.

## Hosting on GitHub Pages

1. Create a new repository on github.com (e.g. `phragmites-website`), empty, no README.
2. In this folder run:
   ```
   git remote add origin https://github.com/<your-account>/phragmites-website.git
   git push -u origin main
   ```
3. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch > main / (root)**.
4. After a minute the site is live at `https://<your-account>.github.io/phragmites-website/`.

## Connecting the database (needed for real reports)

GitHub Pages only serves static files, so community reports are stored in Supabase (free tier).

1. Make a project at supabase.com.
2. **SQL Editor**: paste and run `supabase/schema.sql`, then run `supabase/cms.sql` as a second query.
3. **Project Settings > API**: copy the Project URL and the `anon` public key into `config.js`.
4. **Authentication > URL Configuration**: set Site URL to your GitHub Pages address.
5. Add members (see "Members and editing" below).
6. Commit and push `config.js`. The anon key is meant to be public; the rules in `schema.sql` protect the data.

Until step 3 is done the map runs in **demo mode** (reports stay in your own browser only).

## How the data works

- GBIF records are colored by subspecies: invasive (*australis*), native (*americanus*), or unspecified (most records).
- Community reports start as **unverified**; experts mark them **verified** or **rejected**.
- Public coordinates for community reports are rounded to ~1 km (the exact point is visible only to experts).

## Refreshing the data

```
powershell -ExecutionPolicy Bypass -File scripts/fetch-inat.ps1
powershell -ExecutionPolicy Bypass -File scripts/fetch-gbif.ps1
```

Records older than 5 years are drawn faded and can be hidden (`OLD_YEARS` in `map.js`). Re-run the scripts every few weeks so the map stays current. GBIF data is licensed per record (CC0, CC-BY, or CC-BY-NC); credit both GBIF and iNaturalist on the site and in Sources. We store only location, date, taxon, and link, never photos or usernames.

## Members and editing

Members sign in at `login.html` with an email link. There are two roles:

- **Editors** can change website text and photos without touching code.
- **Experts** can verify or reject map reports.

**Adding a member** (an admin does this once per person):
1. Have the person open the Members page and request a sign-in link. This creates their account.
2. In Supabase: **Authentication > Users**, copy their user ID (a long code).
3. **Table Editor**: open the `editors` table (or `experts`), click **Insert row**, paste the ID, **Save**.
4. They reload the Members page and see their buttons.

**Editing the site:** sign in, open any page, and press **Edit page** in the bar at the bottom. Click any dashed text to type; click a photo box to upload a photo; press **Save changes**. Changes go live for everyone right away, with no GitHub push.

- Photos are shrunk and re-saved as JPEG, which also removes hidden location data from phone photos. Add a short description for each photo (it is read aloud to blind visitors).
- Blank cards (experts, team members) and blank sources are hidden. To add one, fill in a blank. To remove one, clear its text.
- Text is plain text only (no bold or links). Ask a developer if you need more.
- Every save is also kept in the `site_content_history` table, so an old version can be recovered.
- The text inside the HTML files is just the starting default. Saved edits override it.
- Removing a member: delete their row from `editors` or `experts`.

Supabase's free email sender is limited to a few sign-in emails per hour. If your team needs more, set up a custom SMTP sender under **Authentication > SMTP Settings**.

Until the database is connected, **demo mode** lets you try everything with a "demo member" button; edits then stay in your own browser only.

## Editing code

The starting text of each page is in the HTML files. Anything with `data-edit="..."` or `data-edit-img="..."` can be edited by members.
