# Testing

The site has no automated test suite. Changes are checked by hand or with one-off Playwright scripts, and each fix gets its own evidence file in [evidence/](evidence/).

## Evidence index

| Date | Fix | Evidence |
|---|---|---|
| 2026-11-19 | Mobile menu hidden behind the map | [evidence/mobile-menu-fix.md](evidence/mobile-menu-fix.md) |

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
