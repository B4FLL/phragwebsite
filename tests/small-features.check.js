// Checks the "small features and bug fixes" batch in a real browser.
//
// The site runs in DEMO MODE here: the script serves an empty config.js, so every save goes to the
// browser's localStorage and the live Supabase project is never touched. (The login check serves a
// fake Supabase address and answers the sign-in request itself.)
//
// Run (needs Playwright; see docs/testing.md):
//   python3 -m http.server 8000                      # in the project root
//   NODE_PATH=~/playwright-tools/node_modules TARGET_URL=http://localhost:8000 OUT_DIR=/tmp node tests/small-features.check.js
const { chromium } = require("playwright");
const URL = process.env.TARGET_URL || "http://localhost:8000";
const OUT = process.env.OUT_DIR || "/tmp";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
};

const DEMO_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "", supabaseKey: "" };';
const FAKE_CONFIG = 'window.PHRAG_CONFIG = { supabaseUrl: "https://fake-project.supabase.co", supabaseKey: "sb_publishable_fake" };';

async function newPage(browser, { config = DEMO_CONFIG, width = 375, height = 800 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: config }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  page.on("dialog", (d) => d.accept());
  return page;
}

// A real JPEG to upload, made by screenshotting a page.
async function makeJpeg(page) {
  await page.setContent('<body style="margin:0"><div style="width:320px;height:240px;background:linear-gradient(#7a9,#243)"></div></body>');
  return page.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 320, height: 240 } });
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ---------- Map page ----------
  {
    const page = await newPage(browser);
    let inatRequests = 0;
    page.on("request", (r) => { if (r.url().endsWith("data/inat-utah.json")) inatRequests++; });
    await page.goto(URL + "/map.html");
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));

    // Make an expert and file one report (also exercises the record cache).
    await page.evaluate(() => localStorage.setItem("phragDemoMember", "1"));
    await page.reload();
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));
    inatRequests = 0;
    await page.click("#pick-btn");
    await page.evaluate(() => map.fire("click", { latlng: L.latLng(40.5, -111.8) }));
    await page.selectOption("[name=id_guess]", "invasive");
    await page.click("#report-form [type=submit]");
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("1 community report"));
    check("Record files are not downloaded again after a report", inatRequests === 0, `${inatRequests} extra requests`);

    // Verify/Reject: failure shows a message and re-enables the buttons.
    await page.waitForSelector("#queue .queue-item");
    await page.evaluate(() => { store.setStatus = async () => { throw new Error("simulated failure"); }; });
    await page.click("#queue .queue-actions button.ok");
    await page.waitForSelector("#queue .queue-error");
    const stillDisabled = await page.evaluate(() => [...document.querySelectorAll("#queue .queue-actions button")].some((b) => b.disabled));
    check("Verify failure shows an error and re-enables the buttons", !stillDisabled);

    // Remembered filters.
    await page.uncheck('[data-layer="unspecified"]');
    await page.reload();
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));
    check("Filter choices are remembered after a reload", !(await page.isChecked('[data-layer="unspecified"]')));

    // Copy link reopens the same view.
    await page.evaluate(() => map.setView([39.1234, -111.5678], 10));
    await page.click(".panel-fold summary"); // "Share and download" starts folded
    await page.click("#copy-link");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const page2 = await newPage(browser);
    await page2.goto(link);
    await page2.waitForFunction(() => typeof map !== "undefined");
    const view = await page2.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, z: map.getZoom() }));
    check("Copied link reopens the same view", Math.abs(view.lat - 39.1234) < 0.01 && Math.abs(view.lng + 111.5678) < 0.01 && view.z === 10, JSON.stringify(view));
    await page2.context().close();

    // Downloads follow the filters and carry credits.
    await page.waitForFunction(() => document.getElementById("stats").textContent.includes("public records"));
    const expected = await page.evaluate(() => visibleMarkers().length);
    const [csvDl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-csv")]);
    const csv = require("fs").readFileSync(await csvDl.path(), "utf8").trim().split("\r\n");
    check("CSV has a header and one row per shown record", csv[0].startsWith("source,category,taxon") && csv.length - 1 === expected, `${csv.length - 1} rows, expected ${expected}`);
    check("CSV leaves out the hidden category", !csv.slice(1).some((l) => l.split(",")[1] === "unspecified"));
    check("CSV rows carry a credit", csv.slice(1).every((l) => /iNaturalist|GBIF\.org|Utah Phragmites Project$/.test(l)));
    const [geoDl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-geojson")]);
    const geo = JSON.parse(require("fs").readFileSync(await geoDl.path(), "utf8"));
    const f = geo.features[0];
    check("GeoJSON has credits and [lng, lat] points", !!geo.credits && geo.features.length === expected && f.geometry.coordinates[0] < 0 && f.geometry.coordinates[1] > 30);

    await page.screenshot({ path: `${OUT}/small-map.png` });
    await page.context().close();
  }

  // ---------- Neighborhood page ----------
  {
    const page = await newPage(browser);
    await page.goto(URL + "/community.html");
    await page.waitForFunction(() => document.getElementById("feed-status").textContent !== "Loading…");
    await page.evaluate(() => localStorage.setItem("phragDemoMember", "1"));
    await page.reload();
    await page.waitForSelector("#share-btn:not([hidden])");

    const photo = await makeJpeg(await page.context().newPage());
    check("Posting rules are shown on the photo form", await (async () => { await page.click("#share-btn"); return (await page.textContent(".rules")).includes("public land"); })());
    for (const guess of ["invasive", "native"]) {
      if (await page.locator("#post-form").isHidden()) await page.click("#share-btn");
      await page.setInputFiles("[name=photo]", { name: "p.jpg", mimeType: "image/jpeg", buffer: photo });
      await page.evaluate(() => setPin(40.2, -111.7));
      await page.fill("[name=author_name]", "Tester");
      await page.selectOption("#post-form [name=id_guess]", guess);
      await page.click("#post-form [type=submit]");
      await page.waitForFunction(() => document.getElementById("post-form").hidden);
    }
    check("Two posts are in the feed", (await page.locator(".post").count()) === 2);

    await page.click('[data-guess="invasive"]');
    check("'Looks invasive' chip shows only invasive guesses", (await page.locator(".post").count()) === 1 && (await page.textContent(".post .tag")) === "Looks invasive");
    await page.click('[data-guess="unsure"]');
    check("A chip with no matches says so", (await page.textContent("#feed .empty")).includes("No photos match"));
    await page.click('[data-guess="all"]');

    // Hash jump happens once, not on every redraw.
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("phragPosts")).map((p) => p.id));
    // The site scrolls smoothly; switch that off so the measurements below aren't taken mid-animation.
    await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
    await page.goto(`${URL}/community.html#post-${ids[0]}`);
    await page.waitForSelector(".post");
    await page.waitForTimeout(300);
    const jumped = await page.evaluate(() => scrollY);
    await page.evaluate(() => scrollTo(0, 0));
    // Click from script: Playwright's own click would scroll the chip into view and hide the result.
    await page.evaluate(() => document.querySelector('[data-guess="all"]').click());
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => scrollY);
    check("Page opens at the linked post, then stays put when the feed redraws", jumped > 0 && after === 0, `first ${jumped}px, after redraw ${after}px`);

    // Hidden items: hide one post, see it listed, restore it.
    await page.evaluate(() => {
      const all = JSON.parse(localStorage.getItem("phragPosts"));
      all[0].status = "hidden";
      localStorage.setItem("phragPosts", JSON.stringify(all));
    });
    await page.goto(URL + "/community.html");
    await page.waitForSelector("#hidden-panel:not([hidden])");
    check("Moderator panel lists the hidden post", (await page.textContent("#hidden-count")) === "1" && (await page.locator(".post").count()) === 1);
    await page.click("#hidden-panel summary");
    await page.click("#hidden-list >> text=Restore");
    await page.waitForFunction(() => document.querySelectorAll(".post").length === 2);
    check("Restore puts the post back in the feed", (await page.textContent("#hidden-count")) === "0");
    await page.screenshot({ path: `${OUT}/small-community.png`, fullPage: false });

    // A visitor who is not a moderator never sees the panel.
    await page.evaluate(() => localStorage.removeItem("phragDemoMember"));
    await page.reload();
    await page.waitForSelector(".post");
    check("Visitors do not see the hidden-items panel", await page.locator("#hidden-panel").isHidden());
    await page.context().close();
  }

  // ---------- Sign-in page ----------
  {
    const page = await newPage(browser, { config: FAKE_CONFIG });
    let sent = 0;
    await page.route("**/auth/v1/otp*", (r) => { sent++; r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
    await page.clock.install();
    await page.goto(URL + "/login.html");
    await page.fill("[name=email]", "someone@example.org");
    await page.click("#login-form [type=submit]");
    await page.waitForFunction(() => document.getElementById("login-msg").textContent.includes("Link sent"));
    const disabled = await page.isDisabled("#login-form [type=submit]");
    await page.click("#login-form [type=submit]", { force: true, timeout: 1000 }).catch(() => {});
    check("Sign-in button turns off after sending, and a second tap sends nothing", disabled && sent === 1, `${sent} request(s)`);
    await page.clock.runFor(61000);
    await page.waitForFunction(() => !document.querySelector("#login-form [type=submit]").disabled);
    check("Sign-in button turns back on after 60 seconds", true);
    await page.context().close();
  }

  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
