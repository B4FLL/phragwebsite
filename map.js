// Utah Phragmites map: GBIF records + community reports + expert verification.
// With no Supabase keys in config.js this runs in demo mode (reports stay in this browser).

const cfg = window.PHRAG_CONFIG || {};
const demo = !cfg.supabaseUrl || !cfg.supabaseKey;
const sb = demo ? null : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

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
  async setStatus(id, status, expert_note) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
      const r = all.find((x) => x.id === id);
      if (r) Object.assign(r, { status, expert_note });
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      return;
    }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("reports").update({ status, expert_note, verified_by: user.id }).eq("id", id);
    if (error) throw error;
  },
};

// ---------- Map ----------
// leaflet-rotate adds bearing support; touchRotate lets phones twist with two fingers.
const map = L.map("map", { rotate: true, bearing: 0, touchRotate: true, rotateControl: false }).setView([39.3, -111.6], 7);
const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18,
  attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
});
L.control.layers({ Street: street, Satellite: satellite }, null, { position: "topright" }).addTo(map);

// Rotate buttons: 45 degrees left/right, and a compass that resets to north.
const RotateControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const bar = L.DomUtil.create("div", "leaflet-bar rotate-bar");
    const add = (text, title, fn) => {
      const a = L.DomUtil.create("a", "", bar);
      a.href = "#"; a.title = title; a.textContent = text;
      a.setAttribute("role", "button"); a.setAttribute("aria-label", title);
      L.DomEvent.on(a, "click", (e) => { L.DomEvent.stop(e); fn(); });
    };
    add("↺", "Rotate left", () => map.setBearing(((map.getBearing() - 45) % 360 + 360) % 360));
    add("↻", "Rotate right", () => map.setBearing((map.getBearing() + 45) % 360));
    add("N", "Reset to north", () => map.setBearing(0));
    L.DomEvent.disableClickPropagation(bar);
    return bar;
  },
});
new RotateControl().addTo(map);

// Records older than this many years are faded and can be hidden: a patch seen long ago
// may have grown, moved, or been treated.
const OLD_YEARS = 5;
const cutoff = new Date(new Date().setFullYear(new Date().getFullYear() - OLD_YEARS)).toISOString().slice(0, 10);
const isOld = (date) => !!date && date < cutoff; // ISO strings compare correctly, even a bare "2009"

// Every marker is kept here so the filters can show/hide them without refetching.
const shown = L.layerGroup().addTo(map);
let markers = [];
function applyFilters() {
  const on = {};
  document.querySelectorAll("[data-layer]").forEach((box) => (on[box.dataset.layer] = box.checked));
  const showOld = $("show-old").checked;
  shown.clearLayers();
  for (const { m, cat, old } of markers) if (on[cat] && (showOld || !old)) m.addTo(shown);
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
  markers.push({ m, cat, old });
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
  markers.push({ m, cat, old: false });
}

const SOURCES = [
  { file: "data/inat-utah.json", name: "iNaturalist" },
  { file: "data/gbif-utah.json", name: "GBIF" },
];

async function load() {
  markers = [];
  const notes = [];
  let publicCount = 0, reportCount = 0;
  for (const s of SOURCES) {
    try {
      const data = await (await fetch(s.file)).json();
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
    reports.forEach(addReport);
    reportCount = reports.length;
  } catch (e) {
    console.error(e);
    notes.push("community reports failed to load");
  }
  applyFilters();
  const oldCount = markers.filter((x) => x.old).length;
  $("stats").textContent =
    `${publicCount.toLocaleString()} public records from ${notes.join(", ")} + ${reportCount} community report${reportCount === 1 ? "" : "s"}. ` +
    `${oldCount.toLocaleString()} are older than ${OLD_YEARS} years.`;
}

document.querySelectorAll("[data-layer], #show-old").forEach((box) => box.addEventListener("change", applyFilters));

if (demo) {
  const b = $("mode-banner");
  b.hidden = false;
  b.textContent = "Demo mode: reports are saved only in this browser. The team still needs to connect the database (see README).";
}

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
  }
  $("pick-info").textContent = `Pin at ${lat.toFixed(4)}, ${lng.toFixed(4)}. Drag it to adjust.`;
}

function closeForm() {
  form.hidden = true;
  $("pick-btn").hidden = false;
  if (pin) { map.removeLayer(pin); pin = null; }
  map.off("click", onMapClick);
}
function onMapClick(e) { setPin(e.latlng); }

$("pick-btn").addEventListener("click", () => {
  form.hidden = false;
  $("pick-btn").hidden = true;
  $("form-msg").textContent = "";
  $("pick-info").textContent = "Click the map to place your pin.";
  form.observed_on.value = new Date().toISOString().slice(0, 10);
  form.observed_on.max = form.observed_on.value;
  map.on("click", onMapClick);
});
$("cancel-btn").addEventListener("click", closeForm);

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
        await store.setStatus(r.id, status, note.value.trim() || null);
        renderQueue(); load();
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

function showExpert(email) {
  $("expert-login").hidden = true;
  $("expert-queue").hidden = false;
  $("expert-email").textContent = email || "Demo expert";
  renderQueue();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (demo) { showExpert(); return; }
  const email = e.target.email.value.trim();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  $("login-msg").textContent = error ? "Couldn't send the link. Try again." : "Check your email for the sign-in link.";
});

$("logout-btn").addEventListener("click", async () => {
  if (sb) await sb.auth.signOut();
  $("expert-queue").hidden = true;
  $("expert-login").hidden = false;
});

if (sb) {
  sb.auth.getSession().then(({ data }) => { if (data.session) showExpert(data.session.user.email); });
}

load();
