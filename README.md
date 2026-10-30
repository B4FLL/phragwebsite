# Phragmites Website

Website and Utah tracking map for our FIRST LEGO League innovation project on invasive Phragmites.

## Files

- `index.html` – project story (Problem, Research, Solution, Experts, Team, Sources)
- `map.html`, `map.js`, `map.css` – Utah map, report form, expert verification
- `identify.html` – guide to telling invasive from native Phragmites
- `data/gbif-utah.json` – imported public records (1,273 Utah observations from GBIF)
- `scripts/fetch-gbif.ps1` – re-downloads that data (see "Refreshing the data")
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
2. **SQL Editor**: paste and run `supabase/schema.sql`.
3. **Project Settings > API**: copy the Project URL and the `anon` public key into `config.js`.
4. **Authentication > URL Configuration**: set Site URL to your GitHub Pages address.
5. Make each expert: have them sign in once on the map page (this creates their user), then in the SQL Editor run
   `insert into experts (user_id) select id from auth.users where email = 'expert@example.org';`
6. Commit and push `config.js`. The anon key is meant to be public; the rules in `schema.sql` protect the data.

Until step 3 is done the map runs in **demo mode** (reports stay in your own browser only).

## How the data works

- GBIF records are colored by subspecies: invasive (*australis*), native (*americanus*), or unspecified (most records).
- Community reports start as **unverified**; experts mark them **verified** or **rejected**.
- Public coordinates for community reports are rounded to ~1 km (the exact point is visible only to experts).

## Refreshing the data

```
powershell -ExecutionPolicy Bypass -File scripts/fetch-gbif.ps1
```

GBIF data is licensed per record (CC0, CC-BY, or CC-BY-NC). The license is saved in each record; keep the "GBIF" credit on the site and list it in Sources.

## Editing

Look for `TODO` comments in `index.html` and `identify.html` for places that need the team's own content.
