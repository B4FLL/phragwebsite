# Bug fixes from the project scan (2026-11-22)

Checked with `tests/bug-fixes.check.js` in demo mode (nothing touched the live database). Each check fails on the old code and passes on the new.

| Bug | Before | After |
|---|---|---|
| Map records doubled when refreshes overlapped | 1,944 records became 5,832 after three overlapping loads | 1,944 |
| Neighborhood photo count stale after choosing All | "1 of 2 photos" while showing both | "2 photos" |
| Editor bar covered the footer (desktop and phone) | footer ended 64 px (desktop) and 99 px (phone) below the bar's top | footer ends exactly at the bar |

Also fixed: the README said to un-hide posts in the Table Editor, but the Hidden items panel does that now.

Limit: only demo mode was tested, not the live database.
