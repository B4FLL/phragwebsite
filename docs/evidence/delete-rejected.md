# Evidence: experts can delete rejected reports for good

Date: 2026-11-28. Branch: `delete-rejected-reports`.

## The issue

A rejected report (spam, a joke, a duplicate) stayed in the database forever. Experts could only reject it or undo the reject. Removing it for good meant opening Supabase's Table Editor.

## The fix

- **Map page:** each item in the expert's **Rejected reports** list has a **Delete forever** button next to Undo reject and Show.
- **Review dashboard:**
  - On the **Rejected** tab, the open report has **Delete forever**.
  - Ticked reports can be removed together with **Delete selected forever**.
  - Neither button shows on the To review or Verified tabs.
- **Asks first:** every delete asks first ("can't be brought back, use Undo reject / Return to review if it might be real"). Deletes are not added to the dashboard's Undo.
- **Database rule:** the new `experts delete rejected` rule in `supabase/members.sql` lets only experts delete, and only reports whose status is `rejected`. The site's request repeats that condition (`status=eq.rejected`). If nothing was deleted (already gone, changed by another expert, or the SQL not yet re-run), the site says it couldn't delete.

## How it was checked

`tests/delete-rejected.check.js`, run on the Mac in Chromium (Playwright) against `tests/serve.py`: **13/13 passed**, twice.

- Demo mode, map:
  - only rejected reports get the button;
  - cancelling the question keeps the report;
  - accepting removes it from storage and the count drops.
- Demo mode, dashboard:
  - the button is hidden on unverified and verified reports;
  - a single delete works, with a "deleted for good" message and no Undo;
  - a batch delete removes the two remaining rejected reports and leaves the verified and unverified ones;
  - the question states the count;
  - the batch button is hidden on other tabs.
- Fake Supabase:
  - the DELETE request is `?id=eq.<id>&status=eq.rejected`;
  - an empty reply is reported as a failure.

The older checks also passed on the same branch: `risk-fixes` 7/7, `bug-fixes` 6/6, `small-features` 18/18, `cows` 14/14.

## Not checked

- The SQL rule against the real database (there is no local Postgres). After re-running `members.sql`, try it once as a real expert on a test report. Check also that a verified report can't be deleted, for example from the browser console.
- Real phones.
