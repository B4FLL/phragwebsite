# Evidence: cow herds layer, legend, expert photos, social links

Date: 2026-11-21. Branch: `cows-digital-herding`.

## What was added (what a visitor sees)

- **Cow herds on the map**: cow markers with a dashed 2 km grazing ring, a panel listing each herd, and for every herd the number of invasive Phragmites records within 2 km (or how far away the nearest is).
- **Add / remove herds**: editors and experts only.
- **Legend**: a box over the map explaining every color and shape.
- **Expert photos**: a photo box on each Experts card.
- **Social links**: footer links editors can fill in on the page.

## Result

`tests/cows.check.js`: **14 of 14 checks passed** in demo mode. The older checks were re-run on the same code: `tests/small-features.check.js` 18/18, `tests/mobile-menu.check.js` 8/8 links on top.

| Check | Result |
|---|---|
| Legend lists colors and shapes including cow herds (11 entries) | pass |
| A saved herd appears in the list and on the map | pass |
| Herd tied to nearby Phragmites (14 invasive records within 2 km in the test) | pass |
| Grazing ring drawn | pass |
| A herd far from Phragmites says how far the nearest one is (31.7 km) | pass |
| Unticking "Cow herds" hides markers and rings | pass |
| The choice survives a reload | pass |
| Remove herd works from the popup | pass |
| Visitors see herds but no add form or Remove button | pass |
| Legend starts collapsed on a phone (375 px) | pass |
| Empty expert photo boxes and social links are hidden from visitors | pass |
| Editors see a photo box on each of the 6 expert cards | pass |
| A `javascript:` link address is refused | pass |
| Saved social links show for visitors, unsaved ones stay hidden | pass |

Screenshot: [../testing/cows-map.png](../testing/cows-map.png) (legend open, two herds).

## How it was tested

Demo mode (empty `config.js` served by the script), so everything was saved in the browser and the live database was never touched. Run it with the steps in [../testing.md](../testing.md).

## Not tested

- **The real database.** `supabase/herds.sql` has not been run. Whether editors and experts can add and remove herds, and that visitors cannot, still needs one check with real accounts after running the SQL.
- Uploading an actual expert photo (the photo boxes use the existing photo code that was already working; only their presence was checked).
- Social links saved to the real `site_content` table.
- Desktop widths other than 1280 px for the new panel, and real phones.
- The herd count uses straight-line distance and the records loaded on the map, so it is a guide, not a survey.
