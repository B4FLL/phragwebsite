// Home page: real record counts, and a small Utah map drawn from the same public records the
// big map uses (no map tiles). If the files can't be loaded, both simply stay hidden.
(function () {
  const FILES = ["data/inat-utah.json", "data/gbif-utah.json"];
  const OLD_YEARS = 5; // same cut-off as map.js
  const figure = document.getElementById("hero-map");
  const stats = document.getElementById("record-stats");
  if (!figure || !stats) return;

  // Utah's outline as [longitude, latitude], including the notch in the north-east corner.
  const OUTLINE = [[-114.05, 42], [-111.05, 42], [-111.05, 41], [-109.05, 41], [-109.05, 37], [-114.05, 37]];
  const SCALE = 100; // drawing units per degree of latitude
  const SQUEEZE = Math.cos((39.5 * Math.PI) / 180); // a degree of longitude is shorter than one of latitude
  const x = (lng) => (lng + 114.05) * SCALE * SQUEEZE;
  const y = (lat) => (42 - lat) * SCALE;

  function svg(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    return el;
  }

  function draw(records) {
    const pic = svg("svg", { viewBox: `-8 -8 ${x(-109.05) + 16} ${y(37) + 16}`, "aria-hidden": "true" });
    pic.appendChild(svg("polygon", { class: "hero-map-state", points: OUTLINE.map(([a, b]) => `${x(a)},${y(b)}`).join(" ") }));
    for (const r of records) {
      if (r.lng < -114.1 || r.lng > -109 || r.lat < 36.9 || r.lat > 42.1) continue;
      pic.appendChild(svg("circle", { class: "hero-map-dot", cx: x(r.lng).toFixed(1), cy: y(r.lat).toFixed(1), r: 3 }));
    }
    figure.querySelector("a").appendChild(pic);
    figure.hidden = false;
  }

  Promise.all(FILES.map((f) => fetch(f).then((res) => {
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    return res.json();
  }))).then((sets) => {
    const records = sets.flatMap((s) => s.records);
    const cutoff = new Date(new Date().setFullYear(new Date().getFullYear() - OLD_YEARS)).toISOString().slice(0, 10);
    const recent = records.filter((r) => r.date && r.date >= cutoff).length;
    document.getElementById("stat-total").textContent = records.length.toLocaleString();
    document.getElementById("stat-recent").textContent = recent.toLocaleString();
    // The older of the two download dates, so the page never claims to be newer than its data.
    const fetched = sets.map((s) => s.fetched).sort()[0];
    document.getElementById("stat-date").textContent =
      new Date(fetched + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    stats.hidden = false;
    draw(records);
  }).catch((e) => console.error(e));
})();
