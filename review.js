// Expert review dashboard: work through map reports quickly, one at a time or in batches,
// or through a spreadsheet. Only approved experts get in. The database enforces that
// (see supabase/members.sql); the check here only decides what to show.
// All report text is written with textContent, never as HTML.
(function () {
  const { demo, sb, getMember } = window.phrag;
  const csv = window.phragCsv;
  const $ = (id) => document.getElementById(id);

  const DEMO_KEY = "phragReports";
  const PAGE_SIZE = 100;   // list rows drawn at a time
  const NEAR_KM = 1;       // "nearby public records" radius
  const DUP_KM = 0.1;      // two reports this close may be the same patch
  const GUESS = { invasive: "Invasive", native: "Native", unsure: "Not sure" };
  const SIZES = { single: "A few stems", small: "Under 10 m²", medium: "10–100 m²", large: "Over 100 m²" };
  const DONE = { verified: "verified", rejected: "rejected", unverified: "returned to review" };
  const QUICK_NOTES = [
    "Confirmed on site.",
    "Matches known stands nearby.",
    "Needs a site visit to confirm.",
    "Duplicate of another report.",
    "Not enough detail to confirm.",
  ];

  // ---------- Data ----------
  const readDemo = () => JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
  const store = {
    async listAll() {
      if (demo) return readDemo();
      const all = [];
      for (let from = 0; ; from += 1000) { // the database returns at most 1000 rows per request
        const { data, error } = await sb.from("reports").select("*").order("created_at").order("id").range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) return all;
      }
    },
    // Saves only if the report still has the status we saw, so two experts can't silently
    // overwrite each other. Throws { code: "STALE" } if someone else got there first.
    async update(id, fromStatus, status, note) {
      if (demo) {
        const all = readDemo();
        const r = all.find((x) => x.id === id);
        if (!r || r.status !== fromStatus) throw { code: "STALE" };
        Object.assign(r, { status, expert_note: note });
        localStorage.setItem(DEMO_KEY, JSON.stringify(all));
        return;
      }
      const { data: auth } = await sb.auth.getUser();
      const { data, error } = await sb.from("reports")
        .update({ status, expert_note: note, verified_by: status === "unverified" ? null : auth.user.id })
        .eq("id", id).eq("status", fromStatus).select("id");
      if (error) throw error;
      if (!data.length) throw { code: "STALE" };
    },
  };

  // ---------- State ----------
  let reports = [];
  let publicRecords = [];   // iNaturalist + GBIF, used as evidence
  let tab = "unverified";
  let currentId = null;
  let shownLimit = PAGE_SIZE;
  let busy = false;
  let undoSteps = [];
  const selected = new Set();
  const drafts = new Map(); // note typed but not yet saved, per report

  // ---------- Helpers ----------
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    for (const k of kids) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  function km(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  const category = (taxon) =>
    /americanus/i.test(taxon) ? "native" : /australis (subsp\. |ssp\. )?australis/i.test(taxon) ? "invasive" : "unspecified";
  const nearRecords = (r) => publicRecords.filter((p) => Math.abs(p.lat - r.lat) < 0.02 && km(r, p) <= NEAR_KM);
  const twins = (r) => reports.filter((o) => o.id !== r.id && o.status !== "rejected" && Math.abs(o.lat - r.lat) < 0.002 && km(r, o) <= DUP_KM);
  const filed = (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "unknown");

  function visible() {
    const q = $("search").value.trim().toLowerCase();
    const guess = $("guess").value;
    const order = {
      oldest: (a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")),
      newest: (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
      seen: (a, b) => String(b.observed_on).localeCompare(String(a.observed_on)),
      north: (a, b) => b.lat - a.lat,
    }[$("sort").value];
    return reports
      .filter((r) => r.status === tab && (!guess || r.id_guess === guess))
      .filter((r) => !q || [r.notes, r.reporter, r.expert_note].some((t) => (t || "").toLowerCase().includes(q)))
      .sort(order);
  }
  const current = () => reports.find((r) => r.id === currentId) || null;

  // ---------- List ----------
  function renderList() {
    const list = visible();
    for (const s of ["unverified", "verified", "rejected"]) $("count-" + s).textContent = reports.filter((r) => r.status === s).length;

    // Only reports you can currently see stay ticked, so a batch never includes hidden ones.
    const inView = new Set(list.map((r) => r.id));
    for (const id of [...selected]) if (!inView.has(id)) selected.delete(id);
    if (!inView.has(currentId)) currentId = list.length ? list[0].id : null;
    const at = list.findIndex((r) => r.id === currentId);
    if (at >= shownLimit) shownLimit = at + PAGE_SIZE;

    const ul = $("list");
    ul.textContent = "";
    for (const r of list.slice(0, shownLimit)) {
      const box = el("input", { type: "checkbox", checked: selected.has(r.id) });
      box.setAttribute("aria-label", `Select report seen ${r.observed_on}`);
      box.addEventListener("change", () => { box.checked ? selected.add(r.id) : selected.delete(r.id); renderBulk(); });
      const open = el("button", { type: "button" },
        el("span", { className: "rv-row-top" },
          el("span", {}, el("span", { className: "rv-dot " + r.id_guess }), GUESS[r.id_guess] || r.id_guess),
          twins(r).length ? el("span", { className: "rv-flag" }, "Possible duplicate") : null),
        el("span", { className: "rv-row-sub" }, `Seen ${r.observed_on} · ${SIZES[r.patch_size] || r.patch_size}`),
        el("span", { className: "rv-row-sub" }, r.notes || "No notes"));
      open.addEventListener("click", () => select(r.id, true));
      ul.append(el("li", { className: "rv-row" + (r.id === currentId ? " current" : ""), id: "row-" + r.id }, box, open));
    }
    if (!list.length) ul.append(el("li", { className: "rv-empty" },
      tab === "unverified" ? "All caught up. Nothing waiting for review." : "No reports here."));
    $("more-btn").hidden = list.length <= shownLimit;
    $("list-summary").textContent = `Select all shown · ${list.length} report${list.length === 1 ? "" : "s"}`;
    renderBulk();
  }

  function renderBulk() {
    const n = selected.size;
    $("bulk").hidden = !n;
    $("bulk-count").textContent = `${n} selected`;
    document.querySelectorAll("[data-bulk]").forEach((b) => (b.hidden = b.dataset.bulk === tab));
    const shown = visible().slice(0, shownLimit);
    $("select-all").checked = shown.length > 0 && shown.every((r) => selected.has(r.id));
  }

  // ---------- Detail ----------
  let detailMap = null, detailLayer = null;
  function initMap() {
    if (detailMap) return;
    detailMap = L.map("detail-map", { minZoom: 5 }).setView([39.3, -111.6], 7);
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics" }).addTo(detailMap);
    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    L.control.layers({ Satellite: satellite, Street: street }).addTo(detailMap);
    detailLayer = L.layerGroup().addTo(detailMap);
  }

  function renderDetail() {
    const r = current();
    $("detail-empty").hidden = !!r;
    $("detail-body").hidden = !r;
    if (!r) { $("detail").classList.remove("open"); return; }

    $("detail-title").textContent = `${GUESS[r.id_guess] || r.id_guess} · seen ${r.observed_on}`;
    const facts = $("detail-facts");
    facts.textContent = "";
    const fact = (label, ...value) => facts.append(el("dt", {}, label), el("dd", {}, ...value));
    fact("Patch size", SIZES[r.patch_size] || r.patch_size);
    fact("Notes", r.notes || "None");
    fact("Reported by", r.reporter || "No name given");
    fact("Filed", filed(r));
    fact("Exact location", `${(+r.lat).toFixed(5)}, ${(+r.lng).toFixed(5)} · `,
      el("a", { href: `https://www.google.com/maps/search/?api=1&query=${+r.lat},${+r.lng}`, target: "_blank", rel: "noopener" }, "Google Maps"));

    const near = nearRecords(r);
    const tally = (c) => near.filter((p) => category(p.taxon) === c).length;
    const evidence = $("detail-evidence");
    evidence.textContent = "";
    evidence.append(el("p", {}, near.length
      ? `${near.length} public record${near.length === 1 ? "" : "s"} within ${NEAR_KM} km: ${tally("invasive")} invasive, ${tally("native")} native, ${tally("unspecified")} not identified.`
      : `No public records within ${NEAR_KM} km. That doesn't mean the report is wrong.`));
    if (near.length) {
      const latest = near.map((p) => p.date || "").sort().pop();
      if (latest) evidence.append(el("p", {}, `Most recent nearby record: ${latest}.`));
    }
    const same = twins(r);
    if (same.length) evidence.append(el("p", {}, `⚠ ${same.length} other report${same.length === 1 ? "" : "s"} within 100 m. Check for duplicates.`));

    $("note").value = drafts.has(r.id) ? drafts.get(r.id) : r.expert_note || "";
    document.querySelectorAll("[data-act]").forEach((b) => (b.hidden = b.dataset.act === r.status));

    initMap();
    detailLayer.clearLayers();
    const colors = { invasive: "#c0392b", native: "#2a6fb0", unspecified: "#b5b5aa" };
    for (const p of near) {
      L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1, fillColor: colors[category(p.taxon)], fillOpacity: 0.95 })
        .bindTooltip(`Public record, ${p.date || "no date"}`).addTo(detailLayer);
    }
    for (const o of same) L.circleMarker([o.lat, o.lng], { radius: 7, color: "#ffd84d", weight: 3, fill: false }).bindTooltip("Another report").addTo(detailLayer);
    L.circleMarker([r.lat, r.lng], { radius: 11, color: "#ffd84d", weight: 4, fillColor: "#d89a1b", fillOpacity: 0.6 })
      .bindTooltip("This report").addTo(detailLayer);
    setTimeout(() => { detailMap.invalidateSize(); detailMap.setView([r.lat, r.lng], 16, { animate: false }); }, 0);
  }

  function select(id, openOnPhone) {
    currentId = id;
    if (openOnPhone) $("detail").classList.add("open");
    renderList();
    renderDetail();
    const row = $("row-" + id);
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  function step(direction) {
    const list = visible();
    if (!list.length) return;
    const at = list.findIndex((r) => r.id === currentId);
    const next = list[Math.min(list.length - 1, Math.max(0, at + direction))];
    select(next.id, $("detail").classList.contains("open"));
  }

  // ---------- Decisions ----------
  function setBusy(on) {
    busy = on;
    document.querySelectorAll("[data-act], [data-bulk], #import-apply, #refresh-btn, #toast-undo").forEach((b) => (b.disabled = on));
  }

  // changes: [{ report, status, note }]. Saved one at a time; reports what worked.
  async function apply(changes, { undoable = true } = {}) {
    if (busy || !changes.length) return;
    setBusy(true);
    const done = [];
    let stale = 0, failed = 0;
    for (const c of changes) {
      const before = { status: c.report.status, note: c.report.expert_note || null };
      try {
        await store.update(c.report.id, before.status, c.status, c.note);
        Object.assign(c.report, { status: c.status, expert_note: c.note });
        drafts.delete(c.report.id);
        selected.delete(c.report.id);
        done.push({ report: c.report, status: c.status, before });
      } catch (err) {
        console.error(err);
        if (err && err.code === "STALE") stale++; else failed++;
      }
      if (changes.length > 1) toast(`Saving ${done.length + stale + failed} of ${changes.length}…`);
    }
    if (stale) await load();
    setBusy(false);

    const parts = [];
    if (done.length) {
      const same = done.every((d) => d.status === done[0].status);
      parts.push(`${done.length} report${done.length === 1 ? "" : "s"} ${same ? DONE[done[0].status] : "updated"}.`);
    }
    if (stale) parts.push(`${stale} skipped: someone else changed ${stale === 1 ? "it" : "them"} first.`);
    if (failed) parts.push(`${failed} couldn't be saved. Check your connection and sign-in, then try again.`);
    undoSteps = undoable ? done : [];
    toast(parts.join(" "), undoSteps.length > 0);
  }

  async function decideCurrent(status) {
    const r = current();
    if (!r || r.status === status || busy) return;
    // Remember what comes next so you can keep going without clicking.
    const list = visible();
    const at = list.findIndex((x) => x.id === r.id);
    const next = list[at + 1] || list[at - 1];
    const note = status === "unverified" ? null : $("note").value.trim() || null;
    await apply([{ report: r, status, note }]);
    if (r.status === status) currentId = next ? next.id : null;
    renderList();
    renderDetail();
  }

  async function decideSelected(status) {
    const chosen = visible().filter((r) => selected.has(r.id) && r.status !== status);
    if (!chosen.length || busy) return;
    const question = status === "verified"
      ? `Verify ${chosen.length} reports?\n\nVerifying tells the public an expert has checked each one.`
      : `${status === "rejected" ? "Reject" : "Return to review"} ${chosen.length} reports?`;
    if (!confirm(question)) return;
    const shared = $("bulk-note").value.trim();
    await apply(chosen.map((r) => ({ report: r, status, note: status === "unverified" ? null : shared || r.expert_note || null })));
    $("bulk-note").value = "";
    renderList();
    renderDetail();
  }

  async function undoLast() {
    const steps = undoSteps;
    undoSteps = [];
    // Use the latest copy of each report, and leave alone any that changed since our action
    // (for example by another expert), so Undo never overwrites someone else's decision.
    const back = [];
    for (const d of steps) {
      const live = reports.find((r) => r.id === d.report.id);
      if (live && live.status === d.status) back.push({ report: live, status: d.before.status, note: d.before.note });
    }
    if (!back.length) { toast("Nothing to undo: those reports have changed since."); return; }
    await apply(back, { undoable: false });
    renderList();
    renderDetail();
  }

  let toastTimer = null;
  function toast(text, canUndo) {
    $("toast").hidden = false;
    $("toast-text").textContent = text;
    $("toast-undo").hidden = !canUndo;
    clearTimeout(toastTimer);
    if (!canUndo) toastTimer = setTimeout(() => ($("toast").hidden = true), 6000);
  }

  // ---------- Spreadsheet ----------
  const COLUMNS = ["id", "current_status", "decision", "expert_note", "observed_on", "reporter_guess", "patch_size",
    "notes", "reporter", "latitude", "longitude", "map_link", "filed_at", "public_records_within_1km", "possible_duplicate"];

  function sheetRows(list) {
    return list.map((r) => ({
      id: r.id, current_status: r.status, decision: "", expert_note: r.expert_note || "", observed_on: r.observed_on,
      reporter_guess: GUESS[r.id_guess] || r.id_guess, patch_size: SIZES[r.patch_size] || r.patch_size,
      notes: r.notes || "", reporter: r.reporter || "", latitude: r.lat, longitude: r.lng,
      map_link: `https://www.google.com/maps/search/?api=1&query=${+r.lat},${+r.lng}`,
      filed_at: r.created_at || "", public_records_within_1km: nearRecords(r).length,
      possible_duplicate: twins(r).length ? "yes" : "",
    }));
  }

  function exportSheet() {
    const list = visible();
    if (!list.length) { toast("There are no reports in this view to download."); return; }
    if (!confirm(`Download ${list.length} report${list.length === 1 ? "" : "s"}?\n\nThe file contains exact locations and reporters' names. Keep it private and delete it when you're done.`)) return;
    const blob = new Blob([csv.build(COLUMNS, sheetRows(list))], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `phragmites-review-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  let pendingImport = [];
  async function previewImport(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("That file is too large. Upload the CSV you downloaded here."); return; }
    const rows = csv.parse(await file.text());
    if (!rows.length || !("id" in rows[0]) || !("decision" in rows[0])) {
      toast("That doesn't look like a review spreadsheet. It needs the id and decision columns, saved as CSV.");
      return;
    }
    await load(); // compare against the very latest reports
    const result = csv.plan(rows, reports);
    pendingImport = result.changes;
    const box = $("import-summary");
    box.textContent = "";
    const n = (s) => result.changes.filter((c) => c.status === s).length;
    box.append(el("ul", {},
      el("li", {}, `${n("verified")} to verify`),
      el("li", {}, `${n("rejected")} to reject`),
      el("li", {}, `${n("unverified")} to return to review`),
      el("li", {}, `${result.blank} left blank (skipped)`),
      el("li", {}, `${result.same} already up to date`)));
    if (result.problems.length) {
      box.append(el("p", {}, el("strong", {}, `${result.problems.length} row${result.problems.length === 1 ? "" : "s"} can't be applied:`)),
        el("ul", {}, ...result.problems.slice(0, 15).map((p) => el("li", {}, p))));
      if (result.problems.length > 15) box.append(el("p", {}, `…and ${result.problems.length - 15} more.`));
    }
    if (result.changes.length) box.append(el("p", { className: "rv-warning" }, "Notes become public on the map. Verifying tells the public an expert checked each report."));
    $("import-apply").hidden = !result.changes.length;
    $("import-dialog").showModal();
  }

  // ---------- Loading ----------
  async function load() {
    try {
      reports = await store.listAll();
    } catch (e) {
      console.error(e);
      toast("Couldn't load reports. Check your connection, then press Refresh.");
    }
  }
  async function loadPublicRecords() {
    const files = ["data/inat-utah.json", "data/gbif-utah.json"];
    const found = await Promise.all(files.map((f) => fetch(f).then((r) => r.json()).then((d) => d.records).catch(() => [])));
    publicRecords = found.flat();
  }
  async function refresh() {
    await load();
    renderList();
    renderDetail();
  }

  // ---------- Wiring ----------
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    selected.clear(); currentId = null; shownLimit = PAGE_SIZE;
    $("detail").classList.remove("open");
    renderList(); renderDetail();
  }));
  for (const id of ["search", "guess", "sort"]) $(id).addEventListener("input", () => { shownLimit = PAGE_SIZE; renderList(); renderDetail(); });
  $("more-btn").addEventListener("click", () => { shownLimit += PAGE_SIZE; renderList(); });
  $("select-all").addEventListener("change", (e) => {
    for (const r of visible().slice(0, shownLimit)) e.target.checked ? selected.add(r.id) : selected.delete(r.id);
    renderList();
  });
  $("bulk-clear").addEventListener("click", () => { selected.clear(); renderList(); });
  document.querySelectorAll("[data-bulk]").forEach((b) => b.addEventListener("click", () => decideSelected(b.dataset.bulk)));
  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => decideCurrent(b.dataset.act)));
  $("skip-btn").addEventListener("click", () => step(1));
  $("back-btn").addEventListener("click", () => $("detail").classList.remove("open"));
  $("note").addEventListener("input", () => { if (currentId) drafts.set(currentId, $("note").value); });
  for (const text of QUICK_NOTES) {
    const chip = el("button", { type: "button" }, text);
    chip.addEventListener("click", () => {
      const had = $("note").value.trim();
      $("note").value = (had ? had + " " : "") + text;
      $("note").dispatchEvent(new Event("input"));
    });
    $("quick-notes").append(chip);
  }
  $("refresh-btn").addEventListener("click", async () => { await refresh(); toast("Up to date."); });
  $("export-btn").addEventListener("click", exportSheet);
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // so the same file can be chosen again
    await previewImport(file);
    renderList(); renderDetail();
  });
  $("import-apply").addEventListener("click", async () => {
    $("import-dialog").close();
    const changes = pendingImport;
    pendingImport = [];
    await apply(changes);
    renderList(); renderDetail();
  });
  $("import-cancel").addEventListener("click", () => { pendingImport = []; $("import-dialog").close(); });
  $("help-btn").addEventListener("click", () => $("help-dialog").showModal());
  $("toast-undo").addEventListener("click", undoLast);
  $("toast-close").addEventListener("click", () => ($("toast").hidden = true));

  document.addEventListener("keydown", (e) => {
    if ($("app").hidden || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    const typing = e.target.matches("textarea, select, input:not([type=checkbox])");
    if (typing) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.target.closest(".leaflet-container")) return; // arrows move the map there
    const key = e.key.toLowerCase();
    const decide = { v: "verified", r: "rejected", u: "unverified" }[key];
    if (decide) { if (!e.repeat) decideCurrent(decide); }  // holding a key must not decide many reports
    else if (key === "j" || e.key === "ArrowDown") step(1);
    else if (key === "k" || e.key === "ArrowUp") step(-1);
    else if (key === "x" && currentId) { selected.has(currentId) ? selected.delete(currentId) : selected.add(currentId); renderList(); }
    else if (key === "n") $("note").focus();
    else if (key === "/") $("search").focus();
    else return;
    e.preventDefault();
  });

  (async function start() {
    let member = null;
    try { member = await getMember(); } catch (e) { console.error(e); }
    if (!member || !member.isExpert) {
      $("gate-msg").textContent = !member ? "This page is for approved experts. Please sign in first."
        : member.roleError ? "We couldn't check your access just now. Reload the page to try again."
        : `You're signed in as ${member.email}, which isn't on the expert list. Ask a team admin to add it.`;
      $("gate-actions").hidden = !!member;
      return;
    }
    $("who").textContent = member.email;
    await Promise.all([load(), loadPublicRecords()]);
    $("gate").hidden = true;
    $("app").hidden = false;
    renderList();
    renderDetail();
  })();
})();
