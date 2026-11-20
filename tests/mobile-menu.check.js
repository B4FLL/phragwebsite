const { chromium } = require('playwright');
const SP = process.env.OUT_DIR || '/tmp';
const URL = process.env.TARGET_URL || 'http://localhost:8000';
async function check(page, label, shot) {
  await page.evaluate(() => { const n = document.querySelector('.site-nav'); n.classList.remove('open'); });
  await page.click('.nav-toggle');
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.site-nav a').forEach(a => {
      const r = a.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.push({ text: a.textContent, onTop: top === a || a.contains(top) || (top && top.closest('.site-nav') !== null) });
    });
    return out;
  });
  const bad = res.filter(r => !r.onTop).map(r => r.text);
  console.log(`${label}: ${res.length - bad.length}/${res.length} menu links on top` + (bad.length ? ` | covered: ${bad.join(', ')}` : ''));
  await page.screenshot({ path: `${SP}/${shot}.png` });
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(URL + '/map.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await check(page, 'WITH FIX (map.html)', 'map-fixed');
  await page.addStyleTag({ content: '.map-wrap:not(.full){z-index:auto !important}' });
  await check(page, 'WITHOUT FIX (simulated)', 'map-unfixed');
  await page.addStyleTag({ content: '.map-wrap:not(.full){z-index:0 !important}' });
  // map controls still work and sit above tiles
  const ctl = await page.evaluate(() => {
    const el = document.querySelector('.leaflet-control-zoom a'); if (!el) return 'no zoom control';
    const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return el === t || el.contains(t) ? 'zoom control on top' : 'zoom control covered';
  });
  console.log('Map controls:', ctl);
  // fullscreen
  const fs = await page.$('[title*="ull" i], .fullscreen-btn, a[aria-label*="ull" i]');
  if (fs) {
    await page.evaluate(() => document.querySelector('.site-nav').classList.remove('open'));
    await fs.click(); await page.waitForTimeout(400);
    const covers = await page.evaluate(() => { const w = document.querySelector('.map-wrap'); const r = w.getBoundingClientRect(); const t = document.elementFromPoint(50, 20); return { full: w.classList.contains('full'), topLeftInMap: w.contains(t), rect: [r.x, r.y, r.width, r.height] }; });
    console.log('Fullscreen:', JSON.stringify(covers));
    await page.screenshot({ path: `${SP}/map-fullscreen.png` });
  } else console.log('Fullscreen button not found by selector');
  // community page
  await page.goto(URL + '/community.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  console.log('community.html loaded, title:', await page.title());
  await browser.close();
})();
