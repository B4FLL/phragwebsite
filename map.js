// Utah Phragmites map: GBIF records + community reports + expert verification.
// With no Supabase keys in config.js this runs in demo mode (reports stay in this browser).

const { cfg, demo, sb, getMember, photoUrls } = window.phrag; // shared sign-in client from auth.js

const COLORS = { invasive: "#c0392b", native: "#2a6fb0", unspecified: "#8a8a80", unsure: "#d89a1b" };
const LABELS = { invasive: "Invasive Phragmites", native: "Native Phragmites", unsure: "Not sure", unspecified: "Not identified to subspecies" };
const SIZES = { single: "A few stems", small: "Under 10 m²", medium: "10–100 m²", large: "Over 100 m²" };
const $ = (id) => document.getElementById(id);

// ---------- Data access ----------
const DEMO_KEY = "phragReports";
const store = {
  async listPublic() {
    if (demo) return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]").filter((r) => r.status !== "rejected");
    const { data, error } = await sb.from("public_reports").select("*");
    if (error) throw error;
    return data;
  },
  async submit(r) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
      all.push({ ...r, id: "demo-" + Date.now(), status: "unverified" });
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      return;
    }
    const { error } = await sb.from("reports").insert(r);
    if (error) throw error;
  },
  async listUnverified() {
    if (demo) return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]").filter((r) => r.status === "unverified");
    const { data, error } = await sb.from("reports").select("*").eq("status", "unverified").order("created_at");
    if (error) throw error;
    return data;
  },
  async listByStatus(status) { // experts only; the 50 most recently filed
    if (demo) return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]").filter((r) => r.status === status).reverse().slice(0, 50);
    const { data, error } = await sb.from("reports").select("*").eq("status", status).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  },
  async setStatus(id, status, expert_note) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
      const r = all.find((x) => x.id === id);
      if (r) Object.assign(r, { status, expert_note });
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      return;
    }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("reports").update({ status, expert_note, verified_by: status === "unverified" ? null : user.id }).eq("id", id);
    if (error) throw error;
  },
};

// Cow herds (team-entered). Real mode: the cow_herds table (supabase/herds.sql). Demo mode: this browser only.
const HERD_KEY = "phragHerds";
const herdStore = {
  async list() {
    if (demo) return JSON.parse(localStorage.getItem(HERD_KEY) || "[]");
    const { data, error } = await sb.from("cow_herds").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
  async add(h) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(HERD_KEY) || "[]");
      all.push({ ...h, id: "demo-herd-" + Date.now() });
      localStorage.setItem(HERD_KEY, JSON.stringify(all));
      return;
    }
    const { error } = await sb.from("cow_herds").insert(h);
    if (error) throw error;
  },
  async remove(id) {
    if (demo) {
      localStorage.setItem(HERD_KEY, JSON.stringify(JSON.parse(localStorage.getItem(HERD_KEY) || "[]").filter((x) => x.id !== id)));
      return;
    }
    const { error } = await sb.from("cow_herds").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------- Map ----------
// leaflet-rotate adds bearing support; touchRotate lets phones twist with two fingers.
// minZoom 5 keeps the whole western US in reach but stops zooming out so far that the world repeats.
const map = L.map("map", { rotate: true, bearing: 0, touchRotate: true, rotateControl: false, minZoom: 5 }).setView([39.3, -111.6], 7);
const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18,
  attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
});
L.control.layers({ Street: street, Satellite: satellite }, null, { position: "topright" }).addTo(map);

// A stack of map buttons. Each item: [label, title, onClick] and returns the <a> it made.
function addButtons(position, className, items) {
  const C = L.Control.extend({
    options: { position },
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar " + className);
      for (const [label, title, fn, id] of items) {
        const a = L.DomUtil.create("a", "", bar);
        a.href = "#"; a.title = title;
        a.setAttribute("role", "button"); a.setAttribute("aria-label", title);
        if (id) a.id = id;
        if (label.nodeType) a.append(label); else a.textContent = label;
        L.DomEvent.on(a, "click", (e) => { L.DomEvent.stop(e); fn(a); });
      }
      L.DomEvent.disableClickPropagation(bar);
      return bar;
    },
  });
  new C().addTo(map);
}

// Rotation: two-finger twist on phones, Shift+drag on a computer (both built in), plus buttons.
// The compass needle turns as the map turns, so it always points to north; tap it to reset.
const needle = document.createElement("span");
needle.className = "compass-needle";
needle.textContent = "▲";
addButtons("topleft", "rotate-bar", [
  ["↺", "Rotate left", () => map.setBearing(((map.getBearing() - 45) % 360 + 360) % 360)],
  ["↻", "Rotate right", () => map.setBearing((map.getBearing() + 45) % 360)],
  [needle, "Compass: tap to point north up", () => map.setBearing(0), "compass-btn"],
]);
map.on("rotate", () => { needle.style.transform = `rotate(${-map.getBearing()}deg)`; });

// Short message over the map (used for the touch tip and location errors).
let hintTimer = null;
function showHint(text, ms = 5000) {
  const el = $("map-hint");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (el.hidden = true), ms);
}
try {
  if (window.matchMedia("(pointer: coarse)").matches && !sessionStorage.getItem("phragMapHint")) {
    sessionStorage.setItem("phragMapHint", "1");
    showHint("Drag to move · two fingers to zoom and twist to rotate", 7000);
  }
} catch (e) { /* storage blocked: skip the tip */ }

// My location and full screen.
let youMarker = null, youAccuracy = null;
function locateMe() {
  if (!navigator.geolocation) { showHint("Your browser can't share location."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      [youMarker, youAccuracy].forEach((l) => l && map.removeLayer(l));
      youAccuracy = L.circle(ll, { radius: pos.coords.accuracy, weight: 1, color: "#2a6fb0", fillOpacity: 0.12 }).addTo(map);
      youMarker = L.circleMarker(ll, { radius: 8, weight: 3, color: "#fff", fillColor: "#2a6fb0", fillOpacity: 1, className: "you-are-here" })
        .bindPopup("You are here").addTo(map);
      map.setView(ll, Math.max(map.getZoom(), 14));
    },
    () => showHint("Couldn't get your location. Check that location is allowed for this site.")
  );
}

const wrap = $("map-wrap");
function setFullscreen(on) {
  wrap.classList.toggle("full", on);
  document.body.style.overflow = on ? "hidden" : "";
  const btn = $("full-btn");
  btn.textContent = on ? "✕" : "⛶";
  btn.title = on ? "Exit full screen" : "Full screen map";
  btn.setAttribute("aria-label", btn.title);
  setTimeout(() => map.invalidateSize(), 50);
}
addButtons("topleft", "map-btn", [
  ["◎", "Show my location", locateMe],
  ["⛶", "Full screen map", () => setFullscreen(!wrap.classList.contains("full")), "full-btn"],
]);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wrap.classList.contains("full")) setFullscreen(false); });

// ---------- Address search ----------
const searchForm = $("map-search"), searchInput = $("search-input"), results = $("search-results");
let searchPin = null, searching = false;

function resultRow(content, isNote) {
  const li = document.createElement("li");
  if (isNote) { const n = document.createElement("div"); n.className = "note"; n.textContent = content; li.append(n); }
  else li.append(content);
  return li;
}

function goTo(r) {
  results.hidden = true;
  if (searchPin) map.removeLayer(searchPin);
  searchPin = L.marker([r.lat, r.lng]).addTo(map).bindPopup(r.name).openPopup();
  if (r.bounds) map.fitBounds(r.bounds, { maxZoom: 17, padding: [30, 30] });
  else map.setView([r.lat, r.lng], 15);
}

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (searching) return;
  const q = searchInput.value.trim();
  if (q.length < 3) return;
  searching = true;
  results.hidden = false;
  results.textContent = "";
  results.append(resultRow("Searching…", true));
  try {
    const found = await window.phragGeocode.search(q);
    results.textContent = "";
    if (!found.length) { results.append(resultRow("No matches in Utah. Try adding the city, like “123 Main St, Provo”.", true)); return; }
    if (found.length === 1) { goTo(found[0]); return; }
    for (const r of found) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = r.name;
      b.addEventListener("click", () => goTo(r));
      results.append(resultRow(b));
    }
  } catch (err) {
    console.error(err);
    results.textContent = "";
    results.append(resultRow("Search isn't working right now. Please try again in a moment.", true));
  } finally {
    searching = false;
  }
});
searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") results.hidden = true; });
map.on("click", () => { results.hidden = true; });

// Records older than this many years are faded and can be hidden: a patch seen long ago
// may have grown, moved, or been treated.
const OLD_YEARS = 5;
const cutoff = new Date(new Date().setFullYear(new Date().getFullYear() - OLD_YEARS)).toISOString().slice(0, 10);
const isOld = (date) => !!date && date < cutoff; // ISO strings compare correctly, even a bare "2009"

// Opened from a Neighborhood post ("View on map"): map.html?lat=..&lng=..&zoom=..
const linked = new URLSearchParams(location.search);
if (linked.has("lat") && linked.has("lng")) {
  const lat = Number(linked.get("lat")), lng = Number(linked.get("lng"));
  if (Number.isFinite(lat) && Number.isFinite(lng)) map.setView([lat, lng], Math.min(18, Number(linked.get("zoom")) || 13));
}

// Neighbor photos from the Neighborhood page, drawn as purple pins.
const photoLayer = L.layerGroup().addTo(map);

// Every marker is kept here so the filters can show/hide them without refetching.
const shown = L.layerGroup().addTo(map);
let markers = [];
// The records that pass the current checkboxes (used for drawing and for downloads).
function visibleMarkers() {
  const on = {};
  document.querySelectorAll("[data-layer]").forEach((box) => (on[box.dataset.layer] = box.checked));
  const showOld = $("show-old").checked;
  return markers.filter(({ cat, old }) => on[cat] && (showOld || !old));
}
function applyFilters() {
  shown.clearLayers();
  for (const { m } of visibleMarkers()) m.addTo(shown);
}

// Remember the checkboxes between visits (this browser only).
const FILTER_KEY = "phragFilters";
const filterBoxes = () => document.querySelectorAll("[data-layer], #show-old, #show-photos, #show-herds, #show-range");
function saveFilters() {
  try {
    const o = {};
    filterBoxes().forEach((b) => (o[b.dataset.layer || b.id] = b.checked));
    localStorage.setItem(FILTER_KEY, JSON.stringify(o));
  } catch (e) { /* storage blocked: filters just aren't remembered */ }
}
function restoreFilters() {
  try {
    const o = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}");
    filterBoxes().forEach((b) => { const k = b.dataset.layer || b.id; if (typeof o[k] === "boolean") b.checked = o[k]; });
  } catch (e) { /* ignore */ }
}

function row(parent, label, value) {
  const p = document.createElement("p");
  const b = document.createElement("strong");
  b.textContent = label + ": ";
  p.append(b, document.createTextNode(value));
  parent.appendChild(p);
}

function gbifCategory(taxon) {
  if (/americanus/i.test(taxon)) return "native";
  // GBIF writes "subsp. australis", iNaturalist writes "Phragmites australis australis"
  if (/australis (subsp\. |ssp\. )?australis/i.test(taxon)) return "invasive";
  return "unspecified";
}

function addPublicRecord(r, source) {
  const cat = gbifCategory(r.taxon);
  const old = isOld(r.date);
  const m = L.circleMarker([r.lat, r.lng], {
    radius: 5, color: "#fff", weight: 1, fillColor: COLORS[cat], fillOpacity: old ? 0.3 : 0.85,
  });
  const el = document.createElement("div");
  el.className = "popup";
  const h = document.createElement("h4");
  h.textContent = LABELS[cat];
  el.appendChild(h);
  if (old) {
    const w = document.createElement("p");
    w.className = "old-warning";
    w.textContent = `Older record (${r.date.slice(0, 4)}). The patch may have changed or been treated since.`;
    el.appendChild(w);
  }
  row(el, "Recorded as", r.taxon);
  if (r.date) row(el, "Date", r.date);
  if (r.dataset) row(el, "Dataset", r.dataset);
  const a = document.createElement("a");
  a.href = r.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = `View on ${source}`;
  el.append(a, document.createTextNode(" · "), googleLink(r.lat, r.lng));
  m.bindPopup(el);
  markers.push({ m, cat, old, rec: {
    source, category: cat, taxon: r.taxon || "", date: r.date || "", lat: r.lat, lng: r.lng, status: "",
    dataset: r.dataset || "", license: r.license || "", url: r.url || "", credit: source === "GBIF" ? "GBIF.org" : "iNaturalist",
  } });
}

function googleLink(lat, lng) {
  const a = document.createElement("a");
  a.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open in Google Maps";
  return a;
}

function addReport(r) {
  const cat = r.id_guess === "invasive" ? "invasive" : r.id_guess === "native" ? "native" : "unsure";
  const verified = r.status === "verified";
  const m = L.circleMarker([r.lat, r.lng], {
    radius: 9, weight: 3, color: verified ? "#1f3d2b" : "#fff", dashArray: verified ? null : "3 3",
    fillColor: COLORS[cat], fillOpacity: 0.9,
  });
  const el = document.createElement("div");
  el.className = "popup";
  const h = document.createElement("h4");
  h.textContent = (verified ? "Verified: " : "Unverified: ") + LABELS[cat];
  el.appendChild(h);
  row(el, "Date", r.observed_on);
  row(el, "Size", SIZES[r.patch_size] || r.patch_size);
  if (r.notes) row(el, "Notes", r.notes);
  if (r.expert_note) row(el, "Expert note", r.expert_note);
  el.appendChild(googleLink(r.lat, r.lng));
  m.bindPopup(el);
  markers.push({ m, cat, old: false, rec: {
    source: "Community report", category: cat, taxon: "", date: r.observed_on, lat: r.lat, lng: r.lng, status: r.status,
    dataset: "Utah Phragmites Project community reports (locations rounded to about 1 km)", license: "", url: "", credit: "Utah Phragmites Project",
  } });
}

const PHOTO_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;

async function listPhotoPosts() {
  if (demo) {
    return JSON.parse(localStorage.getItem("phragPosts") || "[]")
      .filter((p) => p.status === "visible")
      .map((p) => ({
        ...p, imageUrl: p.image_url,
        lat: p.precise ? p.lat : Math.round(p.lat * 100) / 100,
        lng: p.precise ? p.lng : Math.round(p.lng * 100) / 100,
      }));
  }
  const { data, error } = await sb.from("public_posts")
    .select("id,lat,lng,author_name,caption,image_path,author_is_expert,taken_on");
  if (error) throw error;
  const ok = data.filter((p) => PHOTO_PATH.test(p.image_path));
  const urls = await photoUrls("community-photos", ok.map((p) => p.image_path));
  return ok.map((p) => ({ ...p, imageUrl: urls[p.image_path] }));
}

async function addPhotoPins() {
  const photos = await listPhotoPosts();
  photoLayer.clearLayers(); // cleared only after the fetch, so two overlapping loads can't both add pins
  for (const p of photos) {
    const m = L.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#6b3fa0", fillOpacity: 0.95 });
    const el = document.createElement("div");
    el.className = "popup";
    const img = document.createElement("img");
    img.src = p.imageUrl; img.alt = p.caption || "Neighbor photo of Phragmites"; img.style.maxWidth = "200px"; img.style.borderRadius = "6px";
    const h = document.createElement("h4");
    h.textContent = "Neighbor photo";
    el.append(h, img);
    if (p.caption) row(el, "Caption", p.caption);
    row(el, "Posted by", p.author_name + (p.author_is_expert ? " (expert)" : ""));
    const a = document.createElement("a");
    a.href = "community.html#post-" + p.id; a.textContent = "See photo and comments";
    el.append(a);
    m.bindPopup(el);
    m.addTo(photoLayer);
  }
  return photos.length;
}

const SOURCES = [
  { file: "data/inat-utah.json", name: "iNaturalist" },
  { file: "data/gbif-utah.json", name: "GBIF" },
];

// The two record files only change weekly, so fetch each once per visit, not after every report.
const recordCache = {};
function loadRecords(s) {
  if (!recordCache[s.file]) {
    recordCache[s.file] = fetch(s.file)
      .then((res) => { if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`); return res.json(); })
      .catch((err) => { delete recordCache[s.file]; throw err; }); // a failed load can be retried
  }
  return recordCache[s.file];
}

let loadRun = 0; // newest load() call; an older one still running must stop, or its records get added twice
async function load() {
  const run = ++loadRun;
  const stale = () => run !== loadRun;
  markers = [];
  const notes = [];
  let publicCount = 0, reportCount = 0;
  for (const s of SOURCES) {
    try {
      const data = await loadRecords(s);
      if (stale()) return;
      data.records.forEach((r) => addPublicRecord(r, s.name));
      publicCount += data.records.length;
      notes.push(`${s.name} (${data.fetched})`);
    } catch (e) {
      console.error(e);
      notes.push(`${s.name} failed to load`);
    }
  }
  try {
    const reports = await store.listPublic();
    if (stale()) return;
    reports.forEach(addReport);
    reportCount = reports.length;
  } catch (e) {
    console.error(e);
    notes.push("community reports failed to load");
  }
  let photoCount = 0;
  try { photoCount = await addPhotoPins(); } catch (e) { console.error(e); }
  if (stale()) return;
  applyFilters();
  const herdCount = await refreshHerds(); // after the records load, so each herd can count the Phragmites near it
  if (stale()) return;
  const oldCount = markers.filter((x) => x.old).length;
  $("stats").textContent =
    `${publicCount.toLocaleString()} public records from ${notes.join(", ")} + ${reportCount} community report${reportCount === 1 ? "" : "s"}` +
    (photoCount ? ` + ${photoCount} neighbor photo${photoCount === 1 ? "" : "s"}` : "") +
    (herdCount ? ` + ${herdCount} cow herd${herdCount === 1 ? "" : "s"}` : "") +
    `. ${oldCount.toLocaleString()} records are older than ${OLD_YEARS} years.`;
}

document.querySelectorAll("[data-layer], #show-old").forEach((box) => box.addEventListener("change", () => { applyFilters(); saveFilters(); }));
$("show-photos").addEventListener("change", (e) => { (e.target.checked ? photoLayer.addTo(map) : map.removeLayer(photoLayer)); saveFilters(); });

// ---------- Cow herds ----------
// Herds are drawn as cow markers with a dashed ring showing roughly how far they can graze.
// Each herd is tied to Phragmites by counting the invasive records inside that ring.
const RANGE_KM = 2;
const ACTIVITY = { grazing: "Grazing", moving: "Being moved", resting: "Resting" };
const herdLayer = L.layerGroup().addTo(map);
const rangeLayer = L.layerGroup().addTo(map);
let canManageHerds = false;

function distanceKm(aLat, aLng, bLat, bLng) {
  const t = Math.PI / 180, dLat = (bLat - aLat) * t, dLng = (bLng - aLng) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// How much invasive Phragmites a herd can reach: records inside the range, and the closest one.
function herdReach(h) {
  let inRange = 0, nearest = Infinity;
  for (const { cat, rec } of markers) {
    if (cat !== "invasive") continue;
    const d = distanceKm(h.lat, h.lng, rec.lat, rec.lng);
    if (d <= RANGE_KM) inRange++;
    if (d < nearest) nearest = d;
  }
  return { inRange, nearest };
}
const reachText = (r) => r.inRange
  ? `${r.inRange.toLocaleString()} invasive Phragmites record${r.inRange === 1 ? "" : "s"} within ${RANGE_KM} km`
  : r.nearest === Infinity ? "No invasive Phragmites records on the map yet"
  : `No invasive Phragmites within ${RANGE_KM} km (nearest is ${r.nearest.toFixed(1)} km away)`;

function applyHerdVisibility() {
  const on = $("show-herds").checked;
  on ? herdLayer.addTo(map) : map.removeLayer(herdLayer);
  on && $("show-range").checked ? rangeLayer.addTo(map) : map.removeLayer(rangeLayer);
}

async function refreshHerds() {
  const list = $("herd-list");
  let herds = [];
  try { herds = await herdStore.list(); }
  catch (e) {
    console.error(e);
    list.textContent = "Couldn't load the herds.";
    return 0;
  }
  // Clear only now (after the fetch), so two refreshes running at once can't draw the herds twice.
  herdLayer.clearLayers();
  rangeLayer.clearLayers();
  list.textContent = herds.length ? "" : "No herds have been added yet.";
  for (const h of herds) {
    const reach = herdReach(h);
    const icon = L.divIcon({ className: "herd-icon", html: "🐄", iconSize: [30, 30], iconAnchor: [15, 15] });
    const m = L.marker([h.lat, h.lng], { icon, title: h.name, keyboard: true });
    const el = document.createElement("div");
    el.className = "popup";
    const title = document.createElement("h4");
    title.textContent = "Cow herd: " + h.name;
    el.appendChild(title);
    if (h.head_count) row(el, "Cows", String(h.head_count));
    row(el, "Activity", ACTIVITY[h.activity] || h.activity);
    row(el, "Seen", h.seen_on);
    if (h.note) row(el, "Notes", h.note);
    const link = document.createElement("p");
    link.className = "reach";
    link.textContent = reachText(reach);
    el.append(link, googleLink(h.lat, h.lng));
    if (canManageHerds) el.append(document.createTextNode(" · "), removeHerdButton(h));
    m.bindPopup(el);
    m.addTo(herdLayer);
    L.circle([h.lat, h.lng], { radius: RANGE_KM * 1000, color: "#7a4a21", weight: 1.5, dashArray: "6 5", fillColor: "#7a4a21", fillOpacity: 0.08, interactive: false }).addTo(rangeLayer);

    const item = document.createElement("div");
    item.className = "herd-item";
    const name = document.createElement("strong");
    name.textContent = h.name + (h.head_count ? ` (${h.head_count} cows)` : "");
    const detail = document.createElement("p");
    detail.textContent = `${ACTIVITY[h.activity] || h.activity}, seen ${h.seen_on}`;
    const reachP = document.createElement("p");
    reachP.className = "reach";
    reachP.textContent = reachText(reach);
    const show = document.createElement("button");
    show.type = "button"; show.className = "link-btn"; show.textContent = "Show on map";
    show.addEventListener("click", () => { map.setView([h.lat, h.lng], 13); m.openPopup(); });
    item.append(name, detail, reachP, show);
    list.appendChild(item);
  }
  applyHerdVisibility();
  return herds.length;
}

function removeHerdButton(h) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "link-btn"; b.textContent = "Remove herd";
  b.addEventListener("click", async () => {
    if (!confirm(`Remove the herd "${h.name}" from the map?`)) return;
    b.disabled = true;
    try { await herdStore.remove(h.id); await refreshHerds(); }
    catch (err) { console.error(err); b.disabled = false; showHint("Couldn't remove the herd. Check you're still signed in."); }
  });
  return b;
}

$("show-herds").addEventListener("change", () => { applyHerdVisibility(); saveFilters(); });
$("show-range").addEventListener("change", () => { applyHerdVisibility(); saveFilters(); });

// Add-a-herd form (editors and experts only; the section stays hidden for everyone else).
const herdForm = $("herd-form");
let herdPin = null;
const inUtah = ({ lat, lng }) => lat >= 36.9 && lat <= 42.1 && lng >= -114.1 && lng <= -108.9;

function setHerdPin(latlng) {
  if (!inUtah(latlng)) { $("herd-pick-info").textContent = "That spot is outside Utah. Pick a location inside Utah."; return; }
  if (herdPin) herdPin.setLatLng(latlng);
  else {
    herdPin = L.marker(latlng, { draggable: true }).addTo(map);
    herdPin.on("dragend", () => setHerdPin(herdPin.getLatLng()));
  }
  $("herd-pick-info").textContent = `Herd at ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}. Drag the pin to adjust.`;
}
const onHerdMapClick = (e) => setHerdPin(e.latlng);
function closeHerdForm() {
  herdForm.hidden = true;
  $("herd-btn").hidden = false;
  if (herdPin) { map.removeLayer(herdPin); herdPin = null; }
  map.off("click", onHerdMapClick);
}
$("herd-btn").addEventListener("click", () => {
  closeForm(); // only one pin form open at a time
  herdForm.hidden = false;
  $("herd-btn").hidden = true;
  $("herd-msg").textContent = "";
  $("herd-pick-info").textContent = "Click the map to place the herd.";
  herdForm.seen_on.value = new Date().toISOString().slice(0, 10);
  herdForm.seen_on.max = herdForm.seen_on.value;
  map.on("click", onHerdMapClick);
});
$("herd-cancel").addEventListener("click", closeHerdForm);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !herdForm.hidden) closeHerdForm(); });

herdForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!herdPin) { $("herd-msg").textContent = "Place the herd on the map first."; return; }
  const { lat, lng } = herdPin.getLatLng();
  const count = herdForm.head_count.value.trim();
  const herd = {
    name: herdForm.name.value.trim(),
    lat, lng,
    head_count: count ? Math.max(1, Math.min(10000, parseInt(count, 10) || 1)) : null,
    activity: herdForm.activity.value,
    seen_on: herdForm.seen_on.value,
    note: herdForm.note.value.trim() || null,
  };
  if (!herd.name) { $("herd-msg").textContent = "Give the herd a name."; return; }
  try {
    await herdStore.add(herd);
    herdForm.reset();
    closeHerdForm();
    await refreshHerds();
    map.setView([lat, lng], Math.max(map.getZoom(), 11));
  } catch (err) {
    console.error(err);
    $("herd-msg").textContent = "Couldn't save the herd. Check you're signed in as an editor or expert, then try again.";
  }
});

// ---------- Legend ----------
// What every color and shape on the map means. It sits bottom right, away from the map buttons,
// and starts open only on a big screen so it doesn't cover the map.
L.Control.Legend = L.Control.extend({
  options: { position: "bottomright" },
  onAdd() {
    const box = L.DomUtil.create("details", "map-legend");
    box.open = window.matchMedia("(min-width: 761px) and (min-height: 860px)").matches;
    const title = L.DomUtil.create("summary", "", box);
    title.textContent = "Legend";
    const list = L.DomUtil.create("ul", "", box);
    const items = [
      [{ background: COLORS.invasive }, "Invasive Phragmites"],
      [{ background: COLORS.native }, "Native Phragmites"],
      [{ background: COLORS.unspecified }, "Not identified to subspecies"],
      [{ background: COLORS.unsure }, "Community report, unsure"],
      [{ background: COLORS.invasive }, "Small dot: public record (iNaturalist, GBIF)", "small"],
      ["verified", "Large dot, solid ring: expert verified"],
      ["unverified", "Large dot, dashed ring: not yet verified"],
      ["faded", `Faded: older than ${OLD_YEARS} years`],
      [{ background: "#6b3fa0" }, "Neighbor photo"],
      ["herd", "Cow herd", "", "🐄"],
      ["range", `Grazing range (${RANGE_KM} km)`],
    ];
    for (const [look, text, extra, glyph] of items) {
      const li = L.DomUtil.create("li", "", list);
      const sw = L.DomUtil.create("span", "sw " + (typeof look === "string" ? look : "") + (extra ? " " + extra : ""), li);
      if (typeof look === "object") Object.assign(sw.style, look);
      if (glyph) sw.textContent = glyph;
      li.append(document.createTextNode(text));
    }
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);
    return box;
  },
});
new L.Control.Legend().addTo(map);

// ---------- Share and download ----------
$("copy-link").addEventListener("click", async () => {
  const c = map.getCenter();
  const url = `${location.origin}${location.pathname}?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}&zoom=${map.getZoom()}`;
  try {
    await navigator.clipboard.writeText(url);
    showHint("Link copied. It opens the map at this spot.");
  } catch (e) {
    prompt("Copy this link:", url); // clipboard blocked (for example on plain http)
  }
});

function download(filename, type, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Spreadsheet programs run text starting with = + - @ as a formula, so defuse those.
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const FIELDS = ["source", "category", "taxon", "date", "lat", "lng", "status", "dataset", "license", "url", "credit"];
const stamp = () => new Date().toISOString().slice(0, 10);

$("dl-csv").addEventListener("click", () => {
  const rows = visibleMarkers().map((x) => x.rec);
  const csv = [FIELDS.join(","), ...rows.map((r) => FIELDS.map((f) => csvCell(r[f])).join(","))].join("\r\n");
  download(`utah-phragmites-${stamp()}.csv`, "text/csv;charset=utf-8", csv);
  showHint(`Downloaded ${rows.length.toLocaleString()} records.`);
});
$("dl-geojson").addEventListener("click", () => {
  const rows = visibleMarkers().map((x) => x.rec);
  const geo = {
    type: "FeatureCollection",
    credits: "Records from iNaturalist and GBIF.org (licensed per record, see each license field) and community reports from the Utah Phragmites Project. Community report locations are rounded to about 1 km.",
    features: rows.map(({ lat, lng, ...props }) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props })),
  };
  download(`utah-phragmites-${stamp()}.geojson`, "application/geo+json", JSON.stringify(geo));
  showHint(`Downloaded ${rows.length.toLocaleString()} records.`);
});

if (demo) {
  const b = $("mode-banner");
  b.hidden = false;
  b.textContent = "Demo mode: reports are saved only in this browser. The team still needs to connect the database (see README).";
}

restoreFilters();
if (!$("show-photos").checked) map.removeLayer(photoLayer);

// ---------- Report form ----------
let pin = null;
const form = $("report-form");

function setPin(latlng) {
  const { lat, lng } = latlng;
  if (lat < 36.9 || lat > 42.1 || lng < -114.1 || lng > -108.9) {
    $("pick-info").textContent = "That spot is outside Utah. Pick a location inside Utah.";
    return;
  }
  if (pin) pin.setLatLng(latlng);
  else {
    pin = L.marker(latlng, { draggable: true }).addTo(map);
    pin.on("dragend", () => setPin(pin.getLatLng()));
    pin.on("click", removePin);
  }
  $("pick-info").textContent = `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}. Drag it to adjust, or click the pin to remove it.`;
}

// Clicking the pin removes it but keeps the form open so a new spot can be chosen.
function removePin() {
  if (!pin) return;
  map.removeLayer(pin);
  pin = null;
  $("pick-info").textContent = "Pin removed. Click the map to place a new one.";
}

function closeForm() {
  form.hidden = true;
  $("pick-btn").hidden = false;
  if (pin) { map.removeLayer(pin); pin = null; }
  map.off("click", onMapClick);
}
function onMapClick(e) { setPin(e.latlng); }

$("pick-btn").addEventListener("click", () => {
  closeHerdForm(); // only one pin form open at a time
  form.hidden = false;
  $("pick-btn").hidden = true;
  $("form-msg").textContent = "";
  $("pick-info").textContent = "Click the map to place your pin.";
  form.observed_on.value = new Date().toISOString().slice(0, 10);
  form.observed_on.max = form.observed_on.value;
  map.on("click", onMapClick);
});
$("cancel-btn").addEventListener("click", closeForm);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !form.hidden) closeForm(); });

$("gps-btn").addEventListener("click", () => {
  if (!navigator.geolocation) { $("pick-info").textContent = "Your browser can't share location."; return; }
  navigator.geolocation.getCurrentPosition(
    (p) => { const ll = L.latLng(p.coords.latitude, p.coords.longitude); setPin(ll); map.setView(ll, 14); },
    () => { $("pick-info").textContent = "Couldn't get your location. Click the map instead."; }
  );
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (form.website.value) return; // spam trap
  if (!pin) { $("form-msg").textContent = "Place a pin on the map first."; return; }
  const { lat, lng } = pin.getLatLng();
  const report = {
    lat, lng,
    observed_on: form.observed_on.value,
    id_guess: form.id_guess.value,
    patch_size: form.patch_size.value,
    notes: form.notes.value.trim() || null,
    reporter: form.reporter.value.trim() || null,
  };
  try {
    await store.submit(report);
    form.reset();
    closeForm();
    alert("Thank you! Your report is on the map as unverified until an expert reviews it.");
    load();
    if (!$("expert-section").hidden) renderQueue(); // an expert sees their own new report in the queue
  } catch (err) {
    console.error(err);
    $("form-msg").textContent = "Couldn't save your report. Please try again.";
  }
});

// ---------- Expert verification ----------
async function renderQueue() {
  const q = $("queue");
  q.textContent = "Loading…";
  let items;
  try { items = await store.listUnverified(); }
  catch (e) { q.textContent = "Couldn't load reports (is this account an expert?)."; return; }
  q.textContent = items.length ? "" : "Nothing waiting for review.";
  for (const r of items) {
    const box = document.createElement("div");
    box.className = "queue-item";
    row(box, "Guess", LABELS[r.id_guess === "unsure" ? "unsure" : r.id_guess]);
    row(box, "Seen", `${r.observed_on} at ${(+r.lat).toFixed(4)}, ${(+r.lng).toFixed(4)}`);
    row(box, "Size", SIZES[r.patch_size]);
    if (r.notes) row(box, "Notes", r.notes);
    const note = document.createElement("input");
    note.type = "text"; note.placeholder = "Expert note (optional)"; note.maxLength = 1000;
    box.appendChild(note);
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    for (const [status, label, cls] of [["verified", "Verify", "ok"], ["rejected", "Reject", ""]]) {
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = label; btn.className = cls;
      btn.addEventListener("click", async () => {
        const buttons = actions.querySelectorAll("button");
        buttons.forEach((b) => (b.disabled = true)); // no double-sends while saving
        try {
          await store.setStatus(r.id, status, note.value.trim() || null);
          renderQueue(); renderVerified(); renderRejected(); load();
        } catch (err) {
          console.error(err);
          buttons.forEach((b) => (b.disabled = false));
          let msg = box.querySelector(".queue-error");
          if (!msg) { msg = document.createElement("p"); msg.className = "small queue-error"; msg.setAttribute("role", "alert"); box.appendChild(msg); }
          msg.textContent = "Couldn't save. Check your connection and that you're still signed in, then try again.";
        }
      });
      actions.appendChild(btn);
    }
    const go = document.createElement("button");
    go.type = "button"; go.textContent = "Show";
    go.addEventListener("click", () => map.setView([r.lat, r.lng], 14));
    actions.appendChild(go);
    box.appendChild(actions);
    q.appendChild(box);
  }
}

// Reports that have already been decided are listed with an Undo, in case of a wrong click.
// Undo puts the report back as unverified (it shows on the map as unverified and returns to the
// queue). It also clears the expert note.
async function renderDecided({ fetchItems, boxId, countId, emptyText, errorText, undoLabel }) {
  const box = $(boxId);
  let items;
  try { items = await fetchItems(); }
  catch (e) { console.error(e); box.textContent = errorText; return; }
  $(countId).textContent = items.length;
  box.textContent = "";
  if (!items.length) { box.textContent = emptyText; return; }
  for (const r of items) {
    const item = document.createElement("div");
    item.className = "queue-item";
    row(item, "Guess", LABELS[r.id_guess === "unsure" ? "unsure" : r.id_guess]);
    row(item, "Seen", `${r.observed_on} at ${(+r.lat).toFixed(4)}, ${(+r.lng).toFixed(4)}`);
    if (r.notes) row(item, "Notes", r.notes);
    if (r.expert_note) row(item, "Expert note", r.expert_note);
    const undo = document.createElement("button");
    undo.type = "button"; undo.textContent = undoLabel;
    undo.addEventListener("click", async () => {
      undo.disabled = true;
      try {
        await store.setStatus(r.id, "unverified", null);
        renderVerified(); renderRejected(); renderQueue(); load();
      } catch (err) {
        console.error(err);
        undo.disabled = false;
        undo.textContent = "Couldn't undo, try again";
      }
    });
    const go = document.createElement("button");
    go.type = "button"; go.textContent = "Show";
    go.addEventListener("click", () => map.setView([r.lat, r.lng], 14));
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    actions.append(undo, go);
    item.appendChild(actions);
    box.appendChild(item);
  }
}

const renderVerified = () => renderDecided({
  fetchItems: () => store.listByStatus("verified"), boxId: "verified-list", countId: "verified-count",
  emptyText: "No verified reports.", errorText: "Couldn't load verified reports.", undoLabel: "Undo approval",
});
// Rejected reports vanish from the map and the queue, so this list is the only way to reach them here.
const renderRejected = () => renderDecided({
  fetchItems: () => store.listByStatus("rejected"), boxId: "rejected-list", countId: "rejected-count",
  emptyText: "No rejected reports.", errorText: "Couldn't load rejected reports.", undoLabel: "Undo reject",
});

// Experts see the review queue; everyone else never sees this section.
(async function showExpertQueue() {
  try {
    const member = await getMember();
    if (member && (member.isEditor || member.isExpert)) {
      canManageHerds = true;
      $("herd-admin").hidden = false;
      refreshHerds(); // redraw so the popups get their Remove button
    }
    if (!member || !member.isExpert) return;
    $("expert-section").hidden = false;
    $("expert-email").textContent = member.email;
    renderQueue();
    renderVerified();
    renderRejected();
  } catch (e) { console.error(e); }
})();

load();
