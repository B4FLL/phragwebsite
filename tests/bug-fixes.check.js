// Checks the three bugs found in the project scan, in DEMO MODE (empty config.js, localStorage only,
// the live Supabase project is never touched).
//
// Run (needs Playwright; see docs/testing.md):
//   python3 -m http.server 8000                      # in the project root
//   NODE_PATH=$HOME/.claude/skills/playwright/node_modules TARGET_URL=http://localhost:8000 node tests/bug-fixes.check.js
const { chromium } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:8000";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const DEMO_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "", supabaseKey: "" };';

async function newPage(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: DEMO_CONFIG }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  await page.addInitScript(() => { try { localStorage.setItem("phragDemoMember", "1"); } catch (e) {} });
  return page;
}

async function makeJpeg(page) {
  await page.setContent('<body style="margin:0"><div style="width:320px;height:240px;background:#7a9"></div></body>');
  return page.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 320, height: 240 } });
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 1. Overlapping map loads must not double the records.
  {
    const page = await newPage(browser, 1280);
    await page.goto(URL + "/map.html");
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));
    const single = await page.evaluate(() => markers.length);
    const doubled = await page.evaluate(async () => { await Promise.all([load(), load(), load()]); return markers.length; });
    check("Three overlapping loads give the same number of records as one", single > 100 && doubled === single, `${single} vs ${doubled}`);
    await page.context().close();
  }

  // 2. The photo count must follow the filter chips.
  {
    const page = await newPage(browser, 375);
    await page.goto(URL + "/community.html");
    await page.waitForSelector("#share-btn:not([hidden])");
    const photo = await makeJpeg(await page.context().newPage());
    for (const guess of ["invasive", "native"]) {
      if (await page.locator("#post-form").isHidden()) await page.click("#share-btn");
      await page.setInputFiles("[name=photo]", { name: "p.jpg", mimeType: "image/jpeg", buffer: photo });
      await page.evaluate(() => setPin(40.2, -111.7));
      await page.fill("[name=author_name]", "Tester");
      await page.selectOption("#post-form [name=id_guess]", guess);
      await page.click("#post-form [type=submit]");
      await page.waitForFunction(() => document.getElementById("post-form").hidden);
    }
    const status = () => page.textContent("#feed-status");
    check("All shows '2 photos'", (await status()).trim() === "2 photos", await status());
    await page.evaluate(() => document.querySelector('[data-guess="invasive"]').click());
    check("A chip shows '1 of 2 photos'", (await status()).trim() === "1 of 2 photos", await status());
    await page.evaluate(() => document.querySelector('[data-guess="all"]').click());
    check("Back to All shows '2 photos' again", (await status()).trim() === "2 photos", await status());
    await page.context().close();
  }

  // 3. The editor bar must not cover the footer.
  for (const width of [1280, 375]) {
    const page = await newPage(browser, width);
    await page.goto(URL + "/index.html");
    await page.waitForSelector(".cms-bar:not([hidden])");
    await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const m = await page.evaluate(() => ({
      footerBottom: document.querySelector(".site-footer").getBoundingClientRect().bottom,
      barTop: document.querySelector(".cms-bar").getBoundingClientRect().top,
    }));
    check(`Footer ends above the editor bar at ${width}px`, m.footerBottom <= m.barTop + 1, `footer ${Math.round(m.footerBottom)}, bar ${Math.round(m.barTop)}`);
    await page.context().close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(failed ? `\n${failed} FAILED` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
