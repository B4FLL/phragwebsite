# Phragmites Website

Website and Utah tracking map for our FIRST LEGO League innovation project on invasive Phragmites.

## Files

- `index.html` – project story (Problem, Research, Solution, Experts, Team, Sources)
- `map.html`, `map.js`, `map.css` – Utah map, report form, expert verification
- `identify.html` – guide to telling invasive from native Phragmites
- `login.html`, `login.js` – member sign-in (email link)
- `signin-bar.js` – the "Sign in or sign up" bar shown under the header to signed-out visitors
- `auth.js` – shared sign-in code; `cms.js` – lets members edit text and photos on the page
- `supabase/cms.sql` – tables and rules for editable content and photos
- `supabase/members.sql` – approved-email list for editors and experts
- `community.html`, `community.js`, `community.css` – Neighborhood photo feed with comments and expert tags
- `supabase/community.sql` – tables, privacy rules and photo storage for the Neighborhood feed
- `supabase/herds.sql` – the cow herds table for the map (run it after `members.sql`)
- `privacy.html` – privacy notice and community rules
- `docs/system-flow.html` – open in a browser: diagrams of how the whole system works (pages, database, who can do what)
- `.github/workflows/` – the two automatic jobs (data refresh, database keep-alive)
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
2. **SQL Editor**: paste and run `supabase/schema.sql`, then run `supabase/cms.sql` as a second query, then `supabase/members.sql` as a third, then `supabase/community.sql` as a fourth, then `supabase/herds.sql` as a fifth (cow herds on the map).
3. **Project Settings > API**: copy the Project URL and the `anon` public key into `config.js`.
4. **Authentication > URL Configuration**: set Site URL to your GitHub Pages address.
5. Add members (see "Members and editing" below).
6. Commit and push `config.js`. The anon key is meant to be public; the rules in `schema.sql` protect the data.

Until step 3 is done the map runs in **demo mode** (reports stay in your own browser only).

## How the data works

- GBIF records are colored by subspecies: invasive (*australis*), native (*americanus*), or unspecified (most records).
- Community reports start as **unverified**; experts mark them **verified** or **rejected**.
- Public coordinates for community reports are rounded to ~1 km (the exact point is visible only to experts).

## Neighborhood photos

`community.html` is a photo feed, like a neighborhood app: people share photos of Phragmites near them, with a location, and others comment.

- **Anyone can look; posting and commenting need an email sign-in** (the same link sign-in as members). This keeps spam out and makes the expert tag trustworthy.
- **Location:** read from the photo's GPS data when it has one (phone photos usually do), then adjustable on a small map. Locations must be inside Utah.
- **Privacy:** the saved copy of each photo is re-drawn without hidden data. Locations are shown rounded to about 1 km unless the poster ticks "show my exact location". Experts and moderators always see the exact spot. Only the poster chooses to make it exact.
- **Expert tag:** a green **✓ Expert** tag appears on posts and comments from anyone on the `expert` list in `member_emails`. It's looked up live, so removing someone from the list removes their tag. A commenter's typed name can say anything, so trust the tag, not the name.
- **Moderation:** experts and editors see a **Hide** button on other people's posts and comments (hidden items disappear from the public feed but stay in the database; moderators bring them back with **Restore** in the Hidden items panel, see "Hidden items" below). Authors can delete their own.
- **Limits:** 10 posts and 30 comments per person per hour. Photos are shrunk before upload and capped at 5 MB.
- **On the map:** neighbor photos also appear as purple pins on the map page.

## Reporting problem photos and comments

Signed-in visitors see a **Report** button on other people's photos and comments and give a short reason (once per item). Moderators (experts and editors) see a red "⚑ Reported" line with the reasons under the item, and can press **Hide**. The button appears only after the database script in `supabase/community.sql` has been run (it includes the `flags` table), so re-run that file once after updating.

## Cow herds (digital herding)

The map shows where our herds are and how they relate to Phragmites.

- **Cow herds layer:** each herd is a cow marker with a dashed ring (2 km, roughly how far it can graze). Tick or untick "Cow herds" and "Grazing range" in **Show on map**. The choice is remembered.
- **Connection to Phragmites:** each herd's popup and its entry in the **Cow herds** panel say how many invasive Phragmites records lie within 2 km, or how far away the nearest one is. The count uses the records currently loaded (iNaturalist, GBIF and community reports).
- **Adding herds:** signed-in editors and experts see **Add a herd** in the panel: name, number of cows, activity, date and notes, then click the map for the spot. They can also **Remove herd** from a herd's popup. Everyone else can only look. This needs `supabase/herds.sql` to be run once; until then the herd list says it couldn't load. In demo mode herds stay in the browser.
- **Legend:** the box over the map explains every color and shape. It starts closed on phones.
- **Herd locations are shown exactly as entered.** Put the herd where the grazing area is, not at a private home or corral.

## Experts' photos and social links

- Each card in **Experts We Talked To** has a photo box. Editors add a photo with **Edit page**, same as other photos. Empty boxes are hidden from visitors.
- The footer has social links (Instagram, Facebook, YouTube, TikTok). Editors press **Edit page**, click a name, and type the https:// address. Links with no address stay hidden. Only https:// addresses are accepted. These links appear on the home, identify, privacy, Neighborhood and Members pages.

## Map extras

- **Remembered filters:** the map's checkboxes are restored the next time the same browser opens it.
- **Copy link to this view:** gives a link that opens the map at the same position and zoom.
- **Download shown records:** CSV or GeoJSON of the records that pass the current checkboxes, with a credit for each source. Community reports use the rounded public locations. GBIF and iNaturalist records are licensed per record, so credit them if the data is reused.

## Hidden items

On the Neighborhood page, experts and editors see a **Hidden items** panel listing hidden photos and comments, each with a **Restore** button. This replaces editing `status` in the Table Editor by hand. Restoring a comment whose photo is still hidden won't show it publicly until the photo is restored too. The photo feed also has filter chips (All, Looks invasive, Looks native, Not sure).

## Automatic jobs (GitHub Actions)

Two jobs run on GitHub's servers with nobody online. Check them under the repository's **Actions** tab. To run one now: pick it, then **Run workflow**.

- **Refresh map data** (`.github/workflows/refresh-data.yml`): every Monday it re-downloads the iNaturalist and GBIF records and commits them if they changed. If the new data looks wrong (too few records) it stops and publishes nothing.
- **Keep database awake** (`.github/workflows/keep-database-awake.yml`): twice a week it asks Supabase for one row so the free plan doesn't pause the project after a quiet week. If the project is ever paused, this job fails and GitHub emails the repository admins. Restore the project from the Supabase dashboard.

GitHub switches scheduled jobs off after 60 days with no activity in the repository. The weekly data commits count as activity, so this shouldn't happen while the refresh job is working.

## Privacy page

`privacy.html` explains what the site collects, who else handles it, and the rules for photos and comments. Signed-in editors can fill in the team's contact email on the page itself. A coach or teacher should read it before the site is shared widely; it was written by students and hasn't been reviewed by a lawyer.

## Refreshing the data

```
powershell -ExecutionPolicy Bypass -File scripts/fetch-inat.ps1
powershell -ExecutionPolicy Bypass -File scripts/fetch-gbif.ps1
```

The same two scripts also run automatically every week (see "Automatic jobs"), so you only need to run them by hand to refresh the map between those runs. Records older than 5 years are drawn faded and can be hidden (`OLD_YEARS` in `map.js`). GBIF data is licensed per record (CC0, CC-BY, or CC-BY-NC); credit both GBIF and iNaturalist on the site and in Sources. We store only location, date, taxon, and link, never photos or usernames.

## Members and editing

Members sign in at `login.html` with an email link. There are two roles:

- **Editors** can change website text and photos without touching code.
- **Experts** can verify or reject map reports.

**Adding a member** (an admin does this, about 30 seconds per person):
1. In Supabase open **Table Editor > `member_emails`** and click **Insert row**.
2. Type the person's **email** and pick a **role** (`editor` or `expert`). Save. Use two rows if someone needs both roles.
3. Tell them to sign in at the Members page with that same email. They get the role as soon as they sign in. No user ID copying needed.

Emails can be typed in any capitalization. The sign-in link proves the person owns the address, so only that email can use the role.

**Removing a member:** delete their row from `member_emails`. They lose the role the next time the page checks (immediately on their next page load).

**Editing the site:** sign in, open any page, and press **Edit page** in the bar at the bottom. Click any dashed text to type; click a photo box to upload a photo; press **Save changes**. Changes go live for everyone right away, with no GitHub push.

- Photos are shrunk and re-saved as JPEG, which also removes hidden location data from phone photos. Add a short description for each photo (it is read aloud to blind visitors).
- Blank cards (experts, team members) and blank sources are hidden. To add one, fill in a blank. To remove one, clear its text.
- Text is plain text only (no bold or links). Ask a developer if you need more.
- Every save is also kept in the `site_content_history` table. Press **Previous versions** in the bar (when not editing) to see earlier values of the text and photos on that page and **Restore** one. A restore is saved as a new change, so it can be undone the same way. The original text written in the HTML is not in the history, only values saved through the editor. No database change is needed.
- The text inside the HTML files is just the starting default. Saved edits override it.


Supabase's free email sender is limited to a few sign-in emails per hour. If your team needs more, set up a custom SMTP sender under **Authentication > SMTP Settings**.

Until the database is connected, **demo mode** lets you try everything with a "demo member" button; edits then stay in your own browser only.

## Editing code

The starting text of each page is in the HTML files. Anything with `data-edit="..."` or `data-edit-img="..."` can be edited by members.
