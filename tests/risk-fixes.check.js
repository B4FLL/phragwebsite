// Checks the risk fixes: undo for rejected reports, dismissing reports on photos, "Show more photos",
// and private photo links. Nothing here touches the live database:
//   - demo mode (empty config.js, localStorage) for the undo and dismiss checks
//   - a fake Supabase address, answered by this script, for the photo-list checks
//
// Run (needs Playwright; see docs/testing.md):
//   python3 tests/serve.py                           # in the project root
//   NODE_PATH=$HOME/.claude/skills/playwright/node_modules TARGET_URL=http://localhost:8000 node tests/risk-fixes.check.js
const { chromium } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:8000";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const DEMO_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "", supabaseKey: "" };';
const FAKE_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "https://fake-project.supabase.co", supabaseKey: "sb_publishable_fake" };';

async function newPage(browser, config, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: config }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  page.on("dialog", (d) => d.accept());
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---------- Undo a rejected report (demo mode) ----------
  {
    const page = await newPage(browser, DEMO_CONFIG);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("phragDemoMember", "1");
        if (!localStorage.getItem("phragReports")) {
          localStorage.setItem("phragReports", JSON.stringify([{ id: "demo-1", lat: 40.5, lng: -111.8, observed_on: "2026-01-01", id_guess: "invasive", patch_size: "small", status: "unverified" }]));
        }
      } catch (e) {}
    });
    await page.goto(URL + "/map.html");
    await page.waitForSelector("#expert-section:not([hidden]) .queue-item");
    const reports = () => page.evaluate(() => JSON.parse(localStorage.getItem("phragReports")));
    await page.click("#queue button:has-text('Reject')");
    await page.waitForFunction(() => document.getElementById("rejected-count").textContent === "1");
    check("A rejected report leaves the queue and appears under Rejected reports", (await page.locator("#queue .queue-item").count()) === 0 && (await reports())[0].status === "rejected");
    await page.click(".rejected-panel summary");
    await page.click("#rejected-list button:has-text('Undo reject')");
    await page.waitForFunction(() => document.getElementById("rejected-count").textContent === "0");
    check("Undo puts it back in the queue as unverified", (await page.locator("#queue .queue-item").count()) === 1 && (await reports())[0].status === "unverified");
    await page.context().close();
  }

  // ---------- Dismiss reports on a photo (demo mode) ----------
  {
    const page = await newPage(browser, DEMO_CONFIG);
    await page.addInitScript(() => { try { localStorage.setItem("phragDemoMember", "1"); } catch (e) {} });
    await page.goto(URL + "/community.html");
    await page.waitForSelector("#share-btn:not([hidden])");
    const jpeg = await (async () => {
      const p = await page.context().newPage();
      await p.setContent('<body style="margin:0"><div style="width:320px;height:240px;background:#7a9"></div></body>');
      return p.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 320, height: 240 } });
    })();
    await page.click("#share-btn");
    await page.setInputFiles("[name=photo]", { name: "p.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await page.evaluate(() => setPin(40.2, -111.7));
    await page.fill("[name=author_name]", "Tester");
    await page.click("#post-form [type=submit]");
    await page.waitForFunction(() => document.getElementById("post-form").hidden);
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem("phragPosts"))[0].id);
    await page.evaluate((id) => {
      localStorage.setItem("phragFlags", JSON.stringify([{ user_id: "someone-else", kind: "post", item_id: id, reason: "shows a face" }]));
    }, id);
    await page.reload();
    await page.waitForSelector(".flagged");
    check("A moderator sees the report", (await page.textContent(".flagged")).includes("shows a face"));
    await page.click(".flagged button:has-text('Dismiss reports')");
    await page.waitForFunction(() => !document.querySelector(".flagged"));
    const left = await page.evaluate(() => JSON.parse(localStorage.getItem("phragFlags")).length);
    check("Dismiss removes the red line and the stored reports", left === 0);
    await page.context().close();
  }

  // ---------- Photo list against a fake database ----------
  {
    const page = await newPage(browser, FAKE_CONFIG, 375);
    const TOTAL = 150;
    let signRequests = 0, lastLimit = 0;
    const post = (i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, created_at: new Date(2026, 0, 1, 0, TOTAL - i).toISOString(),
      author_name: "Neighbor", lat: 40.2, lng: -111.7, precise: false, taken_on: "2026-01-01", id_guess: "unsure", caption: "",
      image_path: `11111111-1111-4111-8111-111111111111/p${i}.jpg`, author_is_expert: false, comment_count: 0, is_mine: false,
    });
    // Later routes win, so the catch-alls come first.
    await page.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await page.route("**/storage/v1/object/**", (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: "" }));
    await page.route("**/rest/v1/public_posts*", (r) => {
      const u = new globalThis.URL(r.request().url());
      lastLimit = Number(u.searchParams.get("limit"));
      r.fulfill({ contentType: "application/json", body: JSON.stringify(Array.from({ length: Math.min(lastLimit, TOTAL) }, (_, i) => post(i))) });
    });
    await page.route("**/storage/v1/object/sign/**", (r) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
      if (r.request().method() === "GET") return r.fulfill({ status: 200, contentType: "image/jpeg", body: "" }); // the photo itself
      signRequests++;
      const paths = JSON.parse(r.request().postData()).paths;
      r.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify(paths.map((p) => ({ path: p, signedURL: `/object/sign/community-photos/${p}?token=T` }))) });
    });
    await page.route("**/auth/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
    await page.goto(URL + "/community.html");
    await page.waitForFunction(() => document.querySelectorAll(".post").length > 0);
    check("The first page asks for 100 photos", lastLimit === 100 && (await page.locator(".post").count()) === 100, `limit ${lastLimit}`);
    const src = await page.getAttribute(".post img", "src");
    check("Photos use temporary signed addresses", signRequests === 1 && src.includes("token=T"), src);
    await page.click(".more-btn");
    await page.waitForFunction(() => document.querySelectorAll(".post").length === 150);
    check("Show more photos loads the rest and the button goes away", (await page.locator(".more-btn").count()) === 0 && lastLimit === 200);
    await page.context().close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
