# Testing notes

The site has no automated test suite. This file records the checks that were run and how to repeat them.

## Mobile menu hidden behind the map (fixed in commit bf77c1d)

**Issue:** On a phone, tapping **Menu** on `map.html` opened the links, but the map covered them, so visitors had to scroll to reach them.

**Fix:** `.map-wrap` in `map.css` got `z-index: 0` (and `.pick-map` in `community.css` got `isolation: isolate`), so the map's internal layers can no longer paint over the header menu.

### What was tested (Playwright, Chromium, 375x667, touch emulation)

| Check | Result |
|---|---|
| `map.html`, tap Menu, all 8 links visible on top of the map | Pass |
| Same page with the fix switched off (simulated) | Fail: menu hidden behind the map |
| Zoom control, address search box and layers button on top of the map (menu closed) | Pass |
| Fullscreen button makes the map fill the whole screen (375x667) | Pass |
| `community.html` loads | Pass |

Not tested: desktop layout, and the `community.html` location mini-map with the menu open.

### Screenshots

With the fix: the menu opens over the map.

![Menu open over the map, with the fix](testing/mobile-menu-with-fix.png)

Without the fix (simulated): the menu is hidden behind the map.

![Menu hidden behind the map, without the fix](testing/mobile-menu-without-fix.png)

Fullscreen map (with the fix): the map fills the whole screen.

![Fullscreen map on a phone](testing/mobile-map-fullscreen.png)

### Repeat it

```
python3 -m http.server 8000            # in the project root
npm install playwright                  # once, in a scratch folder, plus: npx playwright install chromium
TARGET_URL=http://localhost:8000 OUT_DIR=/tmp node tests/mobile-menu.check.js
```

The script is [tests/mobile-menu.check.js](../tests/mobile-menu.check.js). It prints the results above and saves screenshots to `OUT_DIR`. Its "links on top" count for the simulated no-fix case understated the problem (6 of 8); the screenshot shows the whole menu hidden, so judge by the screenshot.
