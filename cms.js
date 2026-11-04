// Member-editable content.
//   <p data-edit="some-key">   plain text anyone can read; members can edit it
//   <figure data-edit-img="some-key"><img alt=""></figure>   a photo members can replace
// Everyone sees saved edits. Signed-in editors also get an "Edit page" bar.
// Text is always written with textContent, never as HTML, so edits can't inject markup.
(function () {
  const { cfg, demo, sb, getMember } = window.phrag;
  const STORE_KEY = "phragContent";   // demo mode only
  const BUCKET = "site-images";
  const textEls = [...document.querySelectorAll("[data-edit]")];
  const imgEls = [...document.querySelectorAll("[data-edit-img]")];
  if (!textEls.length && !imgEls.length) return;

  const original = {};      // key -> last saved value (text, or JSON string for photos)
  const pending = {};       // photo key -> { blob, alt } to upload, or null to remove
  let editing = false;

  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const parseImg = (v) => { try { const o = JSON.parse(v); return o && o.url ? o : null; } catch (e) { return null; } };
  const safeUrl = (u) =>
    typeof u === "string" &&
    (u.startsWith("data:image/") ||
      (cfg.supabaseUrl && u.startsWith(cfg.supabaseUrl + "/storage/v1/object/public/")));

  // ---------- Reading and showing content ----------
  async function readContent() {
    if (demo) return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    const { data, error } = await sb.from("site_content").select("key,value");
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.key, r.value]));
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
    hideEmpty();
  }

  // ---------- Saving ----------
  async function writeContent(rows) {
    if (demo) {
      const all = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      rows.forEach((r) => (all[r.key] = r.value));
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
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
  const members = document.createElement("a");
  members.href = "login.html"; members.textContent = "Member page";
  bar.append(editBtn, saveBtn, cancelBtn, status, members);
  document.body.appendChild(bar);

  function setBar() {
    editBtn.hidden = editing;
    saveBtn.hidden = cancelBtn.hidden = !editing;
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
    hideEmpty();
    status.textContent = "Click any dashed text to edit it, or a photo box to add a photo.";
    setBar();
    window.addEventListener("beforeunload", warnUnsaved);
  }

  function stopEditing() {
    editing = false;
    document.body.classList.remove("editing");
    for (const el of textEls) el.removeAttribute("contenteditable");
    for (const k of Object.keys(pending)) delete pending[k];
    window.removeEventListener("beforeunload", warnUnsaved);
    hideEmpty();
    setBar();
  }

  function isDirty() {
    return Object.keys(pending).length > 0 ||
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
      if (rows.length) await writeContent(rows);
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
    } catch (e) { console.error(e); }
  })();
})();
