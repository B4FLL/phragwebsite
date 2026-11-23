# Testing

The site has no automated test suite. Changes are checked by hand or with one-off Playwright scripts, and each fix gets its own evidence file in [evidence/](evidence/).

## Evidence index

| Date | Fix | Evidence |
|---|---|---|
| 2026-11-19 | Mobile menu hidden behind the map | [evidence/mobile-menu-fix.md](evidence/mobile-menu-fix.md) |
| 2026-11-19 | First batch of small features and bug fixes | [evidence/small-features.md](evidence/small-features.md) |
| 2026-11-21 | Cow herds layer, map legend, expert photos, social links | [evidence/cows-and-herding.md](evidence/cows-and-herding.md) |
| 2026-11-22 | Scan fixes: doubled map records, stale photo count, editor bar over footer | [evidence/bug-fixes.md](evidence/bug-fixes.md) |
| 2026-11-22 | Risk fixes: reject undo, dismiss reports, show more photos, private photos, report limit, edit conflicts, refresh retry | [evidence/risk-fixes.md](evidence/risk-fixes.md) |

Screenshots used by the evidence files are in [testing/](testing/). To add an entry, create `evidence/<fix-name>.md` and add a row above.

## Running the Playwright checks

Install Playwright once in a folder outside the project, so `node_modules` doesn't end up in the repo:

```
mkdir ~/playwright-tools && cd ~/playwright-tools
npm install playwright && npx playwright install chromium
```

Then, from the project root, in two terminals:

```
python3 -m http.server 8000
NODE_PATH=~/playwright-tools/node_modules TARGET_URL=http://localhost:8000 OUT_DIR=/tmp node tests/mobile-menu.check.js
```

Scripts live in [tests/](../tests/). Each prints its results and saves screenshots to `OUT_DIR`. See the evidence file for how to read the output.
