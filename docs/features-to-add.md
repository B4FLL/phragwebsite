# Features to add

Proposed features, collected from the team's discussions. None of these are built yet unless marked. Each one says what the problem is, what the visitor will notice, what has to change, and what is still undecided.

## Summary

| # | Feature | Why | Status |
|---|---|---|---|
| 1 | Automatic filter for inappropriate photos, with approve-before-showing | Photos go public the moment they are posted | Proposed, service suggested (Sightengine) |
| 2 | Delete photos after 30 days | Keeps storage free and limits how long photos of places stay online | Proposed, decisions open |
| 3 | Google sign-in | Easier sign-in than waiting for an email link | Branch `google-login-feature` created, no changes on it yet |
| 4 | Custom email sender for sign-in links | Supabase's free sender allows only a few emails per hour | Proposed |
| 5 | Storage and usage monitoring, backups | The free plan has size limits and no backup job exists in the repo | Proposed |
| 6 | Treatment and removal tracking | The map guesses that old records "may have been treated" | Idea |
| 7 | Photos on sighting reports | Experts verify from a text description alone | Idea |
| 8 | Data download (CSV / GeoJSON) | Researchers and land managers can't reuse the data | Idea |
| 9 | "Who to tell" panel for the right agency | The site records sightings but doesn't help anyone act on them | Idea |
| 10 | Installable, works offline in the field | Much of Utah has weak phone coverage | Idea |
| 11 | More map filters, spread-over-time slider, summary page | Records have dates and counties that aren't used for filtering | Idea |
| 12 | Community upgrades (ID help, notifications, "my posts") | Better guesses, fewer lost posts, more return visits | Idea |
| 13 | Reach and accessibility (Spanish, QR poster, visit counts) | Wider audience | Idea |
| 14 | Automating routine team tasks | See the last section | Idea |

---

## 1. Automatic filter for inappropriate photos

**The issue:** a neighborhood photo is public as soon as it is posted. An inappropriate photo stays visible until someone reports it and an expert or editor hides it. Today only the file type and size are checked, not what the picture shows.

**What visitors will notice:** a new photo is checked automatically. A clean photo goes live after a few seconds. A flagged photo is held back for review, and the poster sees "your photo is waiting for review".

**What has to change**
- New post status `pending` (the public feed already shows only `visible` posts). Change in `supabase/community.sql` and `community.js`.
- A Supabase Edge Function that runs when a post is created, sends the photo to a moderation service, then sets the post to `visible` or `flagged`. It needs a secret API key kept in Supabase's secret store, never in `config.js`.
- A review queue for experts and editors (similar to the sighting review queue in `map.js`) to approve or delete flagged posts.
- If the service is down, the post stays `pending` for a moderator instead of going live unchecked.
- Update `privacy.html`: photos are sent to the moderation service.
- Clearer posting rules on the form (for example "photos of the plant only, no people's faces").

**Service options:** Sightengine (free tier of 2,000 checks a month and 500 a day, per its pricing page), OpenAI moderation (free, but sources disagree on image support), Google Cloud Vision SafeSearch (needs a billed Google Cloud project). Check each vendor's pricing page before choosing.

**Limits:** it catches inappropriate content only, not whether the plant is Phragmites, and it will sometimes miss things or flag good photos. Keep the Report and Hide buttons.

**Open decisions**
- Which service? (Suggested: Sightengine.)
- Should comments also be checked or approved first?
- Who creates the Sightengine account and holds its keys?

---

## 2. Delete photos after 30 days

**The issue:** nothing deletes photos today, so storage only grows toward the free plan's 1 GB limit, and photos of places stay online indefinitely.

**What visitors will notice:** a photo disappears 30 days after posting. The posting form and the privacy page say so.

**What has to change**
- A daily scheduled job that finds posts older than 30 days, deletes the photo files from the `community-photos` bucket, then deletes or hides the matching rows.
- Recommended way to run it: a GitHub Actions workflow (like `refresh-data.yml`) using Supabase's secret `service_role` key stored as a GitHub secret. Deleting storage records with SQL alone may leave the actual files behind, so the Storage API is safer. This should be checked in Supabase's docs before relying on it.
- Update the posting form and `privacy.html`.

**Open decisions**
- Delete the whole post (photo and comments), or keep the post with the photo removed?
- The purple map pins come from posts, so they would disappear too. Is that acceptable?
- Should experts be able to keep a post longer, for example a verified example?
- The separate `site-images` bucket (editor photos) is not affected.

---

## 3. Google sign-in

**The issue:** members sign in with an emailed link, which depends on the email arriving and is limited by Supabase's free email sender.

**What visitors will notice:** a "Sign in with Google" button on the Members page, in addition to the email link.

**What has to change**
- Turn on the Google provider in Supabase Auth and set up a Google OAuth client.
- Add the button and sign-in call in `login.html` and `login.js`.
- Roles still come from the email in `member_emails`, matched against the verified email from the sign-in (`supabase/members.sql`). Confirm that Google returns a verified email, so a role can't be claimed with an unverified address.
- Update the privacy page: Google handles part of the sign-in.

**Status:** the branch `google-login-feature` exists and currently matches `main`.

**Open decisions**
- Google in addition to the email link, or instead of it?
- Who owns the Google Cloud project?

---

## 4. Custom email sender for sign-in links

**The issue:** Supabase's free email sender allows only a few sign-in emails per hour. If many people try to sign in at once, for example after a presentation, some will not get their link.

**What visitors will notice:** sign-in links arrive reliably when many people sign in at the same time.

**What has to change:** set up a custom SMTP sender under Supabase **Authentication > SMTP Settings**. No code change. The README already mentions this.

**Open decisions:** which email provider, and who pays if it goes beyond a free tier.

---

## 5. Usage monitoring and backups

**The issue:** the free plan has a 500 MB database limit and 1 GB of photo storage, and there is no backup job in the repo. If the project pauses or data is lost, the team may not notice or be able to restore it.

**What the team will have:** a regular check of database and storage size, and a way to restore data.

**What has to change**
- Add a calendar reminder (or a small scheduled job) to check **Reports > Database** and **Storage** in the Supabase dashboard.
- Find out which backups, if any, the free plan includes, and decide whether to export the tables on a schedule.
- Features 1 and 2 reduce how fast storage fills.

**Open decisions:** who checks, how often, and whether a paid plan is needed if the site grows.

---

## 6. Treatment and removal tracking

**The issue:** the map fades records older than 5 years because a patch "may have changed or been treated since", but nobody can say whether it was.
**What visitors will notice:** a sighting can show "treated on <date>" or "removed", with a note.
**What has to change:** new status and date fields on `reports` (an expert sets them, like verify and reject today), shown in the map popup and as a filter in `map.js`.
**Open decisions:** who may mark a patch treated (experts only?), and whether land managers outside the team can.

## 7. Photos on sighting reports

**The issue:** a sighting report has no photo, so experts verify from a description alone.
**What visitors will notice:** an optional photo on the report form, visible to experts in the review queue.
**What has to change:** a photo field and storage folder for reports, reusing the existing shrink-and-upload code from `community.js`. Related: let experts mark a Neighborhood post as verified or "not Phragmites".
**Open decisions:** should photos on reports also go through the filter in feature 1? Should anonymous reporters be allowed to upload (reports currently allow no sign-in)?

## 8. Data download

**The issue:** researchers, teachers and land managers can see the data but not reuse it.
**What visitors will notice:** a button to download map records as CSV or GeoJSON, with the GBIF and iNaturalist credits included.
**What has to change:** build the file in the browser from the data the map already loads. Keep exact coordinates of community reports hidden (use the rounded public view).

## 9. "Who to tell" panel

**The issue:** the site records sightings but doesn't help anyone act on them.
**What visitors will notice:** after reporting, a panel with the county weed-control contact and a pre-filled email.
**What has to change:** a county lookup and a contact list. The contact list must be checked against official sources and kept up to date.

## 10. Installable and offline

**The issue:** much of Utah has weak phone coverage, so reporting in the field can fail.
**What visitors will notice:** the site can be added to a phone's home screen, and a report made without a signal is saved and sent when the connection returns.
**What has to change:** a web app manifest and service worker, and a local queue for pending reports. Photos and sign-in need extra care.

## 11. Map filters, spread over time, summary page

- Filters by county, date range and status; a time slider showing how sightings spread (records already have dates).
- A summary page with counts of verified and unverified reports, by county and over time.
- Share links with a map preview for a specific sighting or area.

## 12. Community upgrades

- Show the invasive-versus-native tips from `identify.html` next to the "Looks invasive / native / not sure" choice in the posting form.
- Optional email when a report near you is verified or someone comments on your post (needs feature 4).
- A "my posts and reports" page showing what is live, pending or hidden.

## 13. Reach and accessibility

- A Spanish version of the main pages.
- A printable poster or QR code linking to the report page.
- Privacy-friendly visit counts, to show the team's reach.

---

## 14. Tasks the team does by hand today that could be automated

These come from the README and the code. "Already automated" items are listed so the team knows what not to redo.

| Task today | How it's done now | Could be automated by | Worth it? |
|---|---|---|---|
| Refresh iNaturalist and GBIF data | Weekly GitHub job | **Already automated** (`refresh-data.yml`) | Done |
| Keep the free database from pausing | Twice-weekly GitHub job | **Already automated** (`keep-database-awake.yml`) | Done |
| Deploying the site | GitHub Pages publishes from `main` | **Already automated** | Done |
| Add or remove members | An admin edits `member_emails` in the Supabase dashboard (about 30 seconds each) | A request form that notifies an admin for one-click approval, or reading the list from a shared sheet | Yes, if membership changes often |
| Run the four SQL scripts in order when setting up or changing the database | Copy and paste each into the Supabase SQL editor | Keep them as migrations and apply them from a GitHub Actions workflow | Yes, it removes a step that is easy to get wrong |
| Un-hide a post or comment | Change `status` back to `visible` in the Table Editor | A "Hidden items" tab for moderators on the Neighborhood page | Yes, small change |
| Review the flags queue | A moderator reads flagged items by hand | Auto-hide an item once several people report it, then review | Partly: keep a human decision on the final outcome |
| Review new sighting reports | Experts open the queue and verify or reject | A weekly email to experts listing reports still waiting; pre-flag likely duplicates of existing iNaturalist records | Yes, reminders and duplicate hints only; verification stays human |
| Check database and storage size | Looking at the Supabase dashboard | A scheduled job that checks size and emails or opens an issue when it passes a limit | Yes, cheap and prevents surprises |
| Back up the data | No backup job in the repo | Scheduled export of the tables and photo list | Yes |
| Check the site still works after a change | Manual clicking | Run the Playwright check in `tests/` on every push with GitHub Actions | Yes, extends the existing check |
| Remove old photos | Not done (feature 2) | Daily deletion job | See feature 2 |
| Credit and licence text for GBIF and iNaturalist data | Written by hand on the pages | Generate the credit line from the `license` and `dataset` fields in the data files | Maybe, if licences change often |

**Not worth automating:** the expert's judgement on whether a sighting is invasive Phragmites, and the final moderation decision on a reported post. These need a person.

---

## Suggested order

1. Feature 1 (filter and approval), because it protects visitors, especially if the site is shared widely.
2. Feature 2 (30-day deletion), which also reduces what the filter has to hold.
3. Features 3 and 4 together, since both are about sign-in.
4. Feature 5 alongside the others, plus the cheap automations from feature 14 (size alerts, Playwright on push, expert reminder email).
5. Then the ideas that make the map more useful to people outside the team: features 6, 7 and 8, followed by the rest.

Whenever a feature is added, update `README.md` and `docs/system-flow.html`.
