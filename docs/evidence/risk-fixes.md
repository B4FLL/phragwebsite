# Risk fixes from the project scan (2026-11-22)

Checked with `tests/risk-fixes.check.js` (7 checks) plus the earlier suites (bug-fixes 6/6, small-features 18/18, cows 14/14, mobile menu). Demo mode and a fake database address answered by the test; the live database was never touched.

| Risk | Fix | Checked |
|---|---|---|
| Rejected report can't be undone | "Rejected reports" list with Undo reject | Reject, then Undo: back in the queue, status unverified |
| Reported flags never clear | "Dismiss reports" button for moderators | Red line and stored flags gone |
| Feed stops at 100 photos | "Show more photos" loads 100 more at a time | 100 shown, click, 150 shown, button gone |
| Hidden photos stay public by address | Private bucket, temporary signed addresses | Photos load from signed addresses |
| Anonymous report flood | Database limit: 6/hour per connection, 100/hour overall | **Not run** (SQL) |
| Two editors overwrite each other | Save asks before replacing a newer version | **Not run** (needs connected mode) |
| Weekly refresh has no retry | 3 tries per download, retried push; scripts now stop on error | **Not run** (needs GitHub and PowerShell) |

Not changed: replaced editor photos stay in storage on purpose, since Previous versions can restore them (see README).

Limits: the SQL in `schema.sql` and `community.sql` has not been run against Supabase, and the workflow has not run on GitHub. Both need a check after merging.
