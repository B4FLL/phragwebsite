// Member-editable content.
//   <p data-edit="some-key">   plain text anyone can read; members can edit it
//   <figure data-edit-img="some-key"><img alt=""></figure>   a photo members can replace
//   <li hidden><a data-edit-url="some-key">Name</a></li>   a link whose web address members can set
//     (an href in the HTML is the default; with no address the item is hidden from visitors)
// Everyone sees saved edits. Signed-in editors also get an "Edit page" bar.
// Text is always written with textContent, never as HTML, so edits can't inject markup.
(function () {
  const { cfg, demo, sb, getMember } = window.phrag;
  const STORE_KEY = "phragContent";   // demo mode only
  const HISTORY_KEY = "phragContentHistory";   // demo mode only
  const BUCKET = "site-images";
  const textEls = [...document.querySelectorAll("[data-edit]")];
  const imgEls = [...document.querySelectorAll("[data-edit-img]")];
  const urlEls = [...document.querySelectorAll("[data-edit-url]")];
  if (!textEls.length && !imgEls.length && !urlEls.length) return;

  const original = {};      // key -> last saved value (text, or JSON string for photos)
  const pending = {};       // photo key -> { blob, alt } to upload, or null to remove
  const pendingUrls = {};   // link key -> new web address ("" removes it)
  const stamps = {};        // key -> updated_at when this page last read it (connected mode), to spot someone else's edits
  let editing = false;

  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const parseImg = (v) => { try { const o = JSON.parse(v); return o && o.url ? o : null; } catch (e) { return null; } };
  // Only plain https:// addresses are accepted for links, so nobody can save a javascript: link.
  const safeLink = (u) => typeof u === "string" && /^https:\/\/[^\s<>"']{3,500}$/i.test(u);
  const safeUrl = (u) =>
    typeof u === "string" &&
    (u.startsWith("data:image/") ||
      (cfg.supabaseUrl && u.startsWith(cfg.supabaseUrl + "/storage/v1/object/public/")));

  // ---------- Reading and showing content ----------
  async function readContent() {
    if (demo) return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    const { data, error } = await sb.from("site_content").select("key,value,updated_at");
    if (error) throw error;
    data.forEach((r) => (stamps[r.key] = r.updated_at));
    return Object.fromEntries(data.map((r) => [r.key, r.value]));
  }

  // Remember when each key was last changed, so our own saves don't look like someone else's.
  async function refreshStamps(keys) {
    if (demo || !keys.length) return;
    try {
      const { data } = await sb.from("site_content").select("key,updated_at").in("key", keys);
      (data || []).forEach((r) => (stamps[r.key] = r.updated_at));
    } catch (e) { console.error(e); }
  }

  // Keys among `keys` that another editor changed after this page loaded them.
  async function changedByOthers(keys) {
    if (demo || !keys.length) return [];
    const { data, error } = await sb.from("site_content").select("key,updated_at").in("key", keys);
    if (error) throw error;
    return data.filter((r) => !stamps[r.key] || new Date(r.updated_at) > new Date(stamps[r.key])).map((r) => r.key);
  }

  function showImage(fig, o) {
    const img = fig.querySelector("img");
    if (o && safeUrl(o.url)) {
      img.src = o.url;
      img.alt = o.alt || "";
      fig.classList.add("has-image");
    } else {
      img.removeAttribute("src");
      fig.classList.remove("has-image");
    }
  }

  // Empty list items and empty optional cards stay hidden from visitors.
  function hideEmpty() {
    document.querySelectorAll("li[data-edit]").forEach((li) => {
      li.hidden = !editing && !li.textContent.trim();
    });
    for (const a of urlEls) {
      const li = a.closest("li") || a;
      li.hidden = !editing && !safeLink(a.getAttribute("href"));
    }
    document.querySelectorAll(".card[data-optional]").forEach((card) => {
      const any = [...card.querySelectorAll("[data-edit]")].some((e) => e.textContent.trim());
      card.hidden = !editing && !any;
    });
  }

  function apply(content) {
    for (const el of textEls) {
      const key = el.dataset.edit;
      el.textContent = key in content ? content[key] : norm(el.textContent);
      original[key] = el.textContent;
    }
    for (const fig of imgEls) {
      const key = fig.dataset.editImg;
      original[key] = content[key] || "";
      showImage(fig, parseImg(original[key]));
    }
    for (const a of urlEls) {
      const key = a.dataset.editUrl;
      // Like text: the address written in the HTML is the default until an editor saves one.
      // A saved empty address means an editor removed the link.
      const value = key in content ? content[key] : a.getAttribute("href");
      original[key] = safeLink(value) ? value : "";
      if (original[key]) a.href = original[key]; else a.removeAttribute("href");
    }
    hideEmpty();
  }

  // ---------- Saving ----------
  async function writeContent(rows) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      rows.forEach((r) => (all[r.key] = r.value));
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
      // Mirror the database trigger: every save is also kept as a history entry.
      const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      rows.forEach((r) => hist.push({ id: Date.now() + Math.random(), key: r.key, value: r.value, changed_at: new Date().toISOString() }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-200)));
      return;
    }
    const { error } = await sb.from("site_content").upsert(rows, { onConflict: "key" });
    if (error) throw error;
  }

  const toDataUrl = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });

  async function uploadImage(key, blob) {
    if (demo) return toDataUrl(blob);
    const path = `${key}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/jpeg", cacheControl: "31536000",
    });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Re-draws the photo as a JPEG. Shrinks big phone photos and also drops hidden metadata
  // (such as GPS location) that cameras embed.
  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    const maxW = demo ? 1000 : 1600;
    const scale = Math.min(1, maxW / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
  }

  // ---------- Editing UI ----------
  const bar = document.createElement("div");
  bar.className = "cms-bar";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Page editor");
  const status = document.createElement("span");
  status.className = "cms-status";
  status.setAttribute("role", "status");
  const mk = (label, cls, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.className = cls;
    b.addEventListener("click", fn);
    return b;
  };
  const editBtn = mk("Edit page", "cms-primary", () => startEditing());
  const saveBtn = mk("Save changes", "cms-primary", () => save());
  const cancelBtn = mk("Cancel", "", () => cancel());
  const historyBtn = mk("Previous versions", "", () => toggleHistory());
  const members = document.createElement("a");
  members.href = "login.html"; members.textContent = "Member page";
  const historyBox = document.createElement("div");
  historyBox.className = "cms-history";
  historyBox.hidden = true;
  bar.append(editBtn, saveBtn, cancelBtn, historyBtn, status, members, historyBox);
  document.body.appendChild(bar);

  // Keep the bar from covering the footer: pad the page by the bar's current height
  // (it grows when the buttons wrap on a phone or the Previous versions list is open).
  function padForBar() {
    document.body.style.paddingBottom = bar.hidden ? "" : bar.offsetHeight + "px";
  }
  if (window.ResizeObserver) new ResizeObserver(padForBar).observe(bar);

  function setBar() {
    editBtn.hidden = editing;
    saveBtn.hidden = cancelBtn.hidden = !editing;
    historyBtn.hidden = editing;   // restoring while typing would overwrite unsaved edits
    if (editing) historyBox.hidden = true;
  }

  // ---------- Previous versions ----------
  // Lists earlier saved values of the text and photos on THIS page. Restoring saves that old
  // value as a new change, so it is itself kept in history and can be undone the same way.
  async function readHistory() {
    if (demo) return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").reverse();
    const { data, error } = await sb.from("site_content_history")
      .select("id,key,value,changed_at").order("changed_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  }

  const describe = (v) => {
    if (!v) return "(empty)";
    const o = parseImg(v);
    if (o) return "Photo: " + (o.alt || "no description");
    return v.length > 120 ? v.slice(0, 120) + "…" : v;
  };

  async function toggleHistory() {
    if (!historyBox.hidden) { historyBox.hidden = true; return; }
    historyBox.hidden = false;
    historyBox.textContent = "Loading…";
    try {
      const keys = new Set([...textEls.map((e) => e.dataset.edit), ...imgEls.map((f) => f.dataset.editImg), ...urlEls.map((a) => a.dataset.editUrl)]);
      // Skip entries that match what is shown now, and repeats of the same value.
      const seen = new Set();
      const items = (await readHistory()).filter((r) => {
        const id = r.key + "\u0000" + r.value;
        if (!keys.has(r.key) || r.value === original[r.key] || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 15);
      historyBox.textContent = "";
      if (!items.length) { historyBox.textContent = "No earlier versions of anything on this page yet."; return; }
      for (const r of items) {
        const row = document.createElement("div");
        row.className = "cms-history-row";
        const text = document.createElement("span");
        text.textContent = `${new Date(r.changed_at).toLocaleString()} · ${r.key}: ${describe(r.value)}`;
        const b = mk("Restore", "cms-primary", async () => {
          b.disabled = true;
          try {
            await writeContent([{ key: r.key, value: r.value }]);
            await refreshStamps([r.key]);
            apply({ ...original, [r.key]: r.value });
            status.textContent = "Restored.";
            historyBox.hidden = true;
          } catch (err) {
            console.error(err);
            b.disabled = false;
            status.textContent = "Couldn't restore. Check your connection and that you're still signed in.";
          }
        });
        row.append(text, b);
        historyBox.appendChild(row);
      }
    } catch (err) {
      console.error(err);
      historyBox.textContent = "Couldn't load earlier versions.";
    }
  }

  function startEditing() {
    editing = true;
    document.body.classList.add("editing");
    for (const el of textEls) { el.contentEditable = "true"; el.spellcheck = true; }
    for (const fig of imgEls) {
      if (!fig.querySelector(".slot-remove")) {
        const x = document.createElement("button");
        x.type = "button"; x.className = "slot-remove"; x.textContent = "Remove photo";
        x.addEventListener("click", (e) => { e.stopPropagation(); removePhoto(fig); });
        fig.appendChild(x);
      }
      fig.tabIndex = 0;
    }
    for (const a of urlEls) { a.tabIndex = 0; a.title = "Click to set the web address"; }
    hideEmpty();
    status.textContent = "Click any dashed text to edit it, a photo box to add a photo, or a social link name to set its address.";
    setBar();
    window.addEventListener("beforeunload", warnUnsaved);
  }

  function stopEditing() {
    editing = false;
    document.body.classList.remove("editing");
    for (const el of textEls) el.removeAttribute("contenteditable");
    for (const k of Object.keys(pending)) delete pending[k];
    for (const k of Object.keys(pendingUrls)) delete pendingUrls[k];
    for (const a of urlEls) { a.removeAttribute("tabindex"); a.removeAttribute("title"); }
    window.removeEventListener("beforeunload", warnUnsaved);
    hideEmpty();
    setBar();
  }

  function isDirty() {
    return Object.keys(pending).length > 0 || Object.keys(pendingUrls).length > 0 ||
      textEls.some((el) => norm(el.textContent) !== original[el.dataset.edit]);
  }
  function warnUnsaved(e) { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } }

  function cancel() {
    if (isDirty() && !confirm("Throw away your unsaved changes?")) return;
    stopEditing();
    apply(Object.fromEntries(Object.entries(original)));
    status.textContent = "";
  }

  async function save() {
    saveBtn.disabled = true;
    status.textContent = "Saving…";
    try {
      // Two editors can have the page open at once. If someone saved one of the things we are
      // about to change since we loaded it, ask before overwriting (their version stays in Previous versions).
      const touched = [
        ...textEls.filter((el) => norm(el.textContent) !== original[el.dataset.edit]).map((el) => el.dataset.edit),
        ...Object.keys(pending), ...Object.keys(pendingUrls),
      ];
      const clash = await changedByOthers(touched);
      if (clash.length && !confirm(`Someone else changed ${clash.length} of these items since you opened the page (${clash.slice(0, 5).join(", ")}${clash.length > 5 ? ", …" : ""}).\n\nSave anyway and replace their version? (Theirs stays in Previous versions.)\n\nCancel keeps your edits so you can copy them, then reload the page to see theirs.`)) {
        status.textContent = "Not saved: someone else edited this page first.";
        return;
      }
      const rows = [];
      for (const el of textEls) {
        const key = el.dataset.edit, value = norm(el.textContent);
        if (value !== original[key]) rows.push({ key, value });
      }
      for (const [key, p] of Object.entries(pending)) {
        if (!p) { rows.push({ key, value: "" }); continue; }
        const url = await uploadImage(key, p.blob);
        rows.push({ key, value: JSON.stringify({ url, alt: p.alt }) });
      }
      for (const [key, value] of Object.entries(pendingUrls)) rows.push({ key, value });
      if (rows.length) { await writeContent(rows); await refreshStamps(rows.map((r) => r.key)); }
      const saved = Object.fromEntries(Object.entries(original));
      rows.forEach((r) => (saved[r.key] = r.value));
      stopEditing();
      apply(saved);
      status.textContent = rows.length ? "Saved." : "Nothing changed.";
    } catch (err) {
      console.error(err);
      status.textContent = "Couldn't save. Check your connection and that you're still signed in, then try again.";
    } finally {
      saveBtn.disabled = false;
    }
  }

  // Photos
  function pickPhoto(fig) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status.textContent = "Please choose a JPG, PNG or WebP photo."; return; }
      if (file.size > 25 * 1024 * 1024) { status.textContent = "That photo is too large (over 25 MB)."; return; }
      const alt = prompt("Describe this photo for people who can't see it (a short sentence):", fig.dataset.alt || "");
      if (alt === null) return;
      try {
        const blob = await shrink(file);
        pending[fig.dataset.editImg] = { blob, alt: alt.trim().slice(0, 300) };
        const img = fig.querySelector("img");
        img.src = URL.createObjectURL(blob);
        img.alt = alt;
        fig.classList.add("has-image");
        status.textContent = "Photo ready. Press Save changes to publish it.";
      } catch (e) {
        console.error(e);
        status.textContent = "Couldn't read that photo. Try a different one.";
      }
    });
    input.click();
  }

  function removePhoto(fig) {
    pending[fig.dataset.editImg] = null;
    showImage(fig, null);
    status.textContent = "Photo removed. Press Save changes to publish.";
  }

  for (const fig of imgEls) {
    fig.addEventListener("click", () => { if (editing) pickPhoto(fig); });
    fig.addEventListener("keydown", (e) => {
      if (editing && e.target === fig && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickPhoto(fig); }
    });
  }

  // Links: while editing, clicking one asks for its web address instead of following it.
  function editLink(a) {
    const key = a.dataset.editUrl;
    const now = key in pendingUrls ? pendingUrls[key] : original[key];
    const v = prompt(`Web address for ${a.textContent} (starts with https://). Leave empty to hide this link:`, now || "https://");
    if (v === null) return;
    const url = v.trim();
    if (url && !safeLink(url)) { status.textContent = "That address must start with https:// and have no spaces."; return; }
    if (url === original[key]) delete pendingUrls[key]; else pendingUrls[key] = url;
    if (url) a.href = url; else a.removeAttribute("href");
    status.textContent = "Press Save changes to publish the link.";
  }
  for (const a of urlEls) {
    a.addEventListener("click", (e) => { if (editing) { e.preventDefault(); editLink(a); } });
    a.addEventListener("keydown", (e) => { if (editing && e.key === "Enter") { e.preventDefault(); editLink(a); } });
  }

  // Keep every text slot to plain text on one paragraph.
  document.addEventListener("keydown", (e) => {
    if (!editing || !e.target.matches || !e.target.matches("[data-edit]")) return;
    if (e.key === "Enter") e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) e.preventDefault();
  });
  document.addEventListener("paste", (e) => {
    if (!editing || !e.target.matches || !e.target.matches("[data-edit]")) return;
    e.preventDefault();
    document.execCommand("insertText", false, norm(e.clipboardData.getData("text/plain")));
  });
  document.addEventListener("drop", (e) => {
    if (editing && e.target.matches && e.target.matches("[data-edit]")) e.preventDefault();
  });

  // ---------- Start up ----------
  (async function init() {
    let content = {};
    try { content = await readContent(); } catch (e) { console.error(e); }
    apply(content);
    try {
      const member = await getMember();
      if (member && member.isEditor) { bar.hidden = false; setBar(); }
      else if (member && member.roleError) {
        // Signed in, but the access check itself failed. Say so rather than hiding editing silently.
        bar.hidden = false;
        editBtn.hidden = saveBtn.hidden = cancelBtn.hidden = historyBtn.hidden = true;
        status.textContent = "Couldn't check your editor access.";
        bar.insertBefore(mk("Try again", "cms-primary", () => location.reload()), members);
      }
    } catch (e) { console.error(e); }
  })();
})();
