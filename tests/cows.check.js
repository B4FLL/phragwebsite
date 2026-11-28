// Checks the cow herd map layer, the legend, expert photo slots and editable social links.
//
// Runs in DEMO MODE: the script serves an empty config.js, so everything is saved to the browser's
// localStorage and the live Supabase project is never touched.
//
// Run (needs Playwright; see docs/testing.md):
//   python3 -m http.server 8000                      # in the project root
//   NODE_PATH=~/playwright-tools/node_modules TARGET_URL=http://localhost:8000 OUT_DIR=/tmp node tests/cows.check.js
const { chromium } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:8000";
const OUT = process.env.OUT_DIR || "/tmp";
const DEMO_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "", supabaseKey: "" };';

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

async function newPage(browser, { width = 1280, height = 800, member = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: DEMO_CONFIG }));
  if (member) await ctx.addInitScript(() => { try { localStorage.setItem("phragDemoMember", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  page.on("dialog", (d) => d.accept());
  return page;
}
const loaded = (page) => page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---------- Map: herds and legend ----------
  {
    const page = await newPage(browser, { member: true });
    await page.goto(URL + "/map.html");
    await loaded(page);
    await page.waitForSelector("#herd-admin:not([hidden])");

    const legend = await page.evaluate(() => ({ n: document.querySelectorAll(".map-legend li").length, text: document.querySelector(".map-legend").textContent }));
    check("Legend lists the colors and shapes, including cow herds", legend.n >= 11 && /Invasive/.test(legend.text) && /Cow herd/.test(legend.text) && /Grazing range/.test(legend.text), `${legend.n} entries`);

    // Put a herd right on top of a known invasive record so the "near Phragmites" count is not zero.
    const spot = await page.evaluate(() => markers.find((m) => m.cat === "invasive").rec);
    await page.click("#herd-btn");
    await page.evaluate((s) => map.fire("click", { latlng: L.latLng(s.lat, s.lng) }), spot);
    await page.fill("#herd-form [name=name]", "Test herd");
    await page.fill("#herd-form [name=head_count]", "40");
    await page.click("#herd-form [type=submit]");
    await page.waitForSelector(".herd-item");
    check("Saved herd appears in the list and on the map", (await page.locator(".herd-item").count()) === 1 && (await page.locator(".herd-icon").count()) === 1);
    const reach = await page.textContent(".herd-item .reach");
    check("Herd is tied to nearby Phragmites", /\d[\d,]* invasive Phragmites records? within 2 km/.test(reach), reach);
    check("Grazing range ring is drawn", (await page.locator(".leaflet-overlay-pane path[stroke-dasharray='6 5']").count()) === 1);

    // Another herd far from any record says so instead of showing 0 silently.
    await page.evaluate(() => localStorage.setItem("phragHerds", JSON.stringify([...JSON.parse(localStorage.getItem("phragHerds")), { id: "far", name: "Far herd", lat: 37.2, lng: -113.9, head_count: null, activity: "resting", seen_on: "2026-01-01", note: null }])));
    await page.reload();
    await loaded(page);
    await page.waitForSelector(".herd-item");
    const texts = await page.locator(".herd-item .reach").allTextContents();
    check("A herd far from Phragmites says how far the nearest is", texts.some((t) => /No invasive Phragmites within 2 km \(nearest is [\d.]+ km away\)/.test(t) || /No invasive/.test(t)), texts.join(" | "));

    await page.screenshot({ path: `${OUT}/cows-map.png` });

    // Checkbox hides herds and the choice survives a reload.
    await page.click(".filter-fold summary"); // the checkboxes start folded
    await page.uncheck("#show-herds");
    check("Unticking Cow herds hides the markers and rings", (await page.locator(".herd-icon").count()) === 0 && (await page.locator(".leaflet-overlay-pane path[stroke-dasharray='6 5']").count()) === 0);
    await page.reload();
    await loaded(page);
    check("The Cow herds choice is remembered", !(await page.isChecked("#show-herds")) && (await page.locator(".herd-icon").count()) === 0);
    await page.click(".filter-fold summary"); // folded again after the reload
    await page.check("#show-herds");

    // Remove a herd from its popup.
    await page.click(".herd-icon >> nth=0");
    await page.click(".leaflet-popup >> text=Remove herd");
    await page.waitForFunction(() => document.querySelectorAll(".herd-item").length === 1);
    check("Remove herd takes it off the list and map", (await page.locator(".herd-icon").count()) === 1);
    await page.context().close();
  }

  // ---------- Map: visitor and phone ----------
  {
    const visitor = await newPage(browser);
    await visitor.addInitScript(() => { if (!localStorage.getItem("phragHerds")) localStorage.setItem("phragHerds", JSON.stringify([{ id: "v", name: "Visible herd", lat: 40.2, lng: -111.7, head_count: 12, activity: "grazing", seen_on: "2026-01-01", note: null }])); });
    await visitor.goto(URL + "/map.html");
    await loaded(visitor);
    await visitor.waitForSelector(".herd-item");
    check("Visitors see herds but not the add-a-herd form", (await visitor.locator("#herd-admin").isHidden()) && (await visitor.locator(".leaflet-popup >> text=Remove herd").count()) === 0);
    await visitor.context().close();

    const phone = await newPage(browser, { width: 375, height: 800 });
    await phone.goto(URL + "/map.html");
    await loaded(phone);
    check("Legend starts collapsed on a phone", !(await phone.evaluate(() => document.querySelector(".map-legend").open)));
    await phone.context().close();
  }

  // ---------- Home page: expert photos and social links ----------
  {
    const visitor = await newPage(browser);
    await visitor.goto(URL + "/index.html");
    await visitor.waitForTimeout(500);
    check("Empty expert photo slots and links with no address are hidden; the two built-in links show",
      (await visitor.locator('[data-edit-img="expert-1-photo"]').isHidden()) && (await visitor.locator(".social li:visible").count()) === 2);
    await visitor.context().close();

    const page = await newPage(browser, { member: true });
    await page.goto(URL + "/index.html");
    await page.waitForSelector(".cms-bar:not([hidden])");
    await page.click("text=Edit page");
    check("Editors see a photo box on each expert card", (await page.locator('[data-edit-img^="expert-"]:visible').count()) === 6);

    page.removeAllListeners("dialog");
    page.once("dialog", (d) => d.accept("javascript:alert(1)"));
    await page.click('[data-edit-url="social-instagram"]');
    check("A javascript: address is refused", (await page.textContent(".cms-status")).includes("https://") && !(await page.getAttribute('[data-edit-url="social-instagram"]', "href")));

    page.once("dialog", (d) => d.accept("https://www.instagram.com/phragproject"));
    await page.click('[data-edit-url="social-instagram"]');
    page.once("dialog", (d) => d.accept("https://www.youtube.com/@phragproject"));
    await page.click('[data-edit-url="social-youtube"]');
    await page.click("text=Save changes");
    await page.waitForSelector("text=Saved.");
    await page.evaluate(() => localStorage.removeItem("phragDemoMember"));
    await page.reload();
    await page.waitForTimeout(500);
    const shown = await page.evaluate(() => [...document.querySelectorAll(".social li")].filter((li) => !li.hidden).map((li) => li.firstElementChild.textContent + " " + li.firstElementChild.href));
    check("Saved social links replace or add to the built-in ones; the others stay hidden", shown.length === 3 && /Instagram https:\/\/www\.instagram\.com\/phragproject/.test(shown[0]) && /Facebook/.test(shown[1]) && /YouTube/.test(shown[2]), shown.join(" | "));
    await page.screenshot({ path: `${OUT}/cows-footer.png`, clip: { x: 0, y: (await page.evaluate(() => document.body.scrollHeight)) - 160, width: 1280, height: 160 }, fullPage: true });
    await page.context().close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
