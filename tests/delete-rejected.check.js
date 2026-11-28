// Checks that experts can permanently delete rejected reports, and nothing else.
// Demo mode (empty config.js, localStorage) for the map list and the review dashboard, plus a
// fake Supabase address, answered by this script, to check what the delete request asks for.
// The live database is never touched.
//
// Run (needs Playwright; see docs/testing.md):
//   python3 tests/serve.py                           # in the project root
//   NODE_PATH=$HOME/.claude/skills/playwright/node_modules TARGET_URL=http://localhost:8000 node tests/delete-rejected.check.js
const { chromium } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:8000";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const DEMO_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "", supabaseKey: "" };';
const FAKE_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "https://fake-project.supabase.co", supabaseKey: "sb_publishable_fake" };';
const report = (id, status) => ({ id, lat: 40.5, lng: -111.8, observed_on: "2026-01-01", id_guess: "invasive", patch_size: "small", notes: "note " + id, status, created_at: "2026-01-01T00:00:00Z" });
const SEED = [report("r1", "rejected"), report("r2", "rejected"), report("r3", "rejected"), report("v1", "verified"), report("u1", "unverified")];

async function newPage(browser, config, { width = 1280, dialogs } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: config }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  page.on("dialog", (d) => { if (dialogs) dialogs.push(d.message()); d.accept(); });
  return page;
}
const seed = (page) => page.addInitScript((seed) => {
  try {
    localStorage.setItem("phragDemoMember", "1");
    if (!localStorage.getItem("phragReports")) localStorage.setItem("phragReports", JSON.stringify(seed));
  } catch (e) {}
}, SEED);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("phragReports")).map((r) => r.id).sort().join(","));

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---------- Map: Rejected reports list ----------
  {
    const dialogs = [];
    const page = await newPage(browser, DEMO_CONFIG, { dialogs });
    await seed(page);
    await page.goto(URL + "/map.html");
    await page.waitForFunction(() => document.getElementById("rejected-count").textContent === "3");
    await page.click(".rejected-panel summary");
    check("Only rejected reports have Delete forever on the map",
      (await page.locator("#rejected-list button:has-text('Delete forever')").count()) === 3 &&
      (await page.locator("#verified-list button:has-text('Delete forever'), #queue button:has-text('Delete forever')").count()) === 0);

    page.removeAllListeners("dialog");
    page.once("dialog", (d) => d.dismiss());
    await page.locator("#rejected-list button:has-text('Delete forever')").first().click();
    await page.waitForTimeout(300);
    check("Cancelling the question keeps the report", (await stored(page)) === "r1,r2,r3,u1,v1");

    page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
    await page.locator("#rejected-list button:has-text('Delete forever')").first().click();
    await page.waitForFunction(() => document.getElementById("rejected-count").textContent === "2");
    check("Accepting deletes it for good and the list updates", (await stored(page)).split(",").length === 4 && /can't be brought back/.test(dialogs.pop()));
    await page.context().close();
  }

  // ---------- Review dashboard: one, then a batch ----------
  {
    const dialogs = [];
    const page = await newPage(browser, DEMO_CONFIG, { dialogs });
    await seed(page);
    await page.goto(URL + "/review.html");
    await page.waitForSelector("#app:not([hidden])");
    check("Delete forever is hidden on reports waiting for review", await page.locator("#delete-btn").isHidden());
    await page.click("[data-tab=verified]");
    check("Delete forever is hidden on verified reports", await page.locator("#delete-btn").isHidden());

    await page.click("[data-tab=rejected]");
    await page.waitForSelector("#delete-btn:visible");
    await page.click("#delete-btn");
    await page.waitForFunction(() => document.getElementById("count-rejected").textContent === "2");
    const left = await stored(page);
    check("Deleting the open rejected report removes only that one", left.split(",").length === 4 && left.includes("u1") && left.includes("v1"), left);
    check("The message says it's gone for good, with no Undo", (await page.textContent("#toast-text")).includes("deleted for good") && (await page.locator("#toast-undo").isHidden()));

    await page.check("#select-all");
    check("Delete selected forever shows on the Rejected tab", await page.locator("#bulk-delete").isVisible());
    await page.click("#bulk-delete");
    await page.waitForFunction(() => document.getElementById("count-rejected").textContent === "0");
    check("Batch delete removes every selected rejected report and leaves the others", (await stored(page)) === "u1,v1", await stored(page));
    check("The batch question gives the count", /Delete 2 rejected reports for good/.test(dialogs.pop()));

    await page.click("[data-tab=verified]");
    await page.check("#select-all");
    check("Delete selected forever doesn't show on other tabs", await page.locator("#bulk-delete").isHidden());
    await page.context().close();
  }

  // ---------- Fake database: the request only targets rejected reports ----------
  {
    const page = await newPage(browser, FAKE_CONFIG);
    let deleteUrl = "";
    await page.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await page.route("**/auth/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
    await page.route("**/rest/v1/reports*", (r) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      if (r.request().method() === "DELETE") { deleteUrl = r.request().url(); return r.fulfill({ headers: cors, contentType: "application/json", body: "[]" }); }
      r.fulfill({ headers: cors, contentType: "application/json", body: "[]" });
    });
    await page.goto(URL + "/map.html");
    const outcome = await page.evaluate(async () => {
      try { await store.removeRejected("abc"); return "no error"; } catch (e) { return String(e.message || e); }
    });
    const u = new globalThis.URL(deleteUrl);
    check("The delete asks only for that id while it is still rejected", u.searchParams.get("id") === "eq.abc" && u.searchParams.get("status") === "eq.rejected", u.search);
    check("If the database deleted nothing, the site reports a failure", /not deleted/.test(outcome), outcome);
    await page.context().close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
