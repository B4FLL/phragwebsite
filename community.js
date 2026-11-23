// Neighborhood photo feed: photos with locations, comments, and an "Expert" tag on comments
// from approved experts. Anyone can read; posting and commenting need a sign-in.
// With no Supabase keys in config.js it runs in demo mode (everything stays in this browser).
// All text is written with textContent, never as HTML.

const { cfg, demo, sb, getMember, photoUrls } = window.phrag;
const $ = (id) => document.getElementById(id);

const BUCKET = "community-photos";
const PAGE_SIZE = 100;  // photos loaded at a time; "Show more photos" asks for another page
const UTAH = { latMin: 36.9, latMax: 42.1, lngMin: -114.1, lngMax: -108.9 };
const ID_LABELS = { invasive: "Looks invasive", native: "Looks native", unsure: "Not sure" };
const SAFE_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;
const inUtah = (lat, lng) => lat >= UTAH.latMin && lat <= UTAH.latMax && lng >= UTAH.lngMin && lng <= UTAH.lngMax;

let me = null;          // signed-in person ({ id, email, isEditor, isExpert }) or null
let posts = [];
let mode = "new";       // "new" or "near"
let userPos = null;     // where the viewer is, for "Near me"
let flagsReady = false; // is the "Report this" table set up?
let flags = {};         // moderators only: item id -> list of reasons people gave
let hashHandled = false; // has the link's #post-... jump already happened?
let postLimit = PAGE_SIZE; // how many photos to ask for (grows with "Show more photos")
let loadFailed = false;  // did the last photo load fail? (keeps the error text from being overwritten)
let guess = "all";       // identification filter: "all", "invasive", "native" or "unsure"

// ---------- Tiny DOM helper ----------
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const badge = () => h("span", { className: "badge-expert", title: "Approved Phragmites expert" }, "✓ Expert");
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// ---------- Data access ----------
const DEMO_POSTS = "phragPosts", DEMO_COMMENTS = "phragComments";
const readDemo = (k) => JSON.parse(localStorage.getItem(k) || "[]");
const writeDemo = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const round = (n) => Math.round(n * 100) / 100;

const store = {
  async listPosts(limit = PAGE_SIZE) {
    if (demo) {
      const comments = readDemo(DEMO_COMMENTS);
      return readDemo(DEMO_POSTS)
        .filter((p) => p.status === "visible")
        .map((p) => ({
          ...p,
          imageUrl: p.image_url,
          lat: p.precise ? p.lat : round(p.lat),
          lng: p.precise ? p.lng : round(p.lng),
          is_mine: !!me && p.user_id === me.id,
          comment_count: comments.filter((c) => c.post_id === p.id && c.status === "visible").length,
        }))
        .reverse();
    }
    const { data, error } = await sb.from("public_posts").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const urls = await photoUrls(BUCKET, data.map((p) => p.image_path).filter((x) => SAFE_PATH.test(x)));
    return data.map((p) => ({ ...p, imageUrl: urls[p.image_path] || "" }));
  },

  async createPost(post, blob) {
    if (demo) {
      const image_url = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const all = readDemo(DEMO_POSTS);
      all.push({ ...post, id: "demo-" + Date.now(), created_at: new Date().toISOString(), user_id: me.id,
        image_url, status: "visible", author_is_expert: me.isExpert });
      writeDemo(DEMO_POSTS, all);
      return;
    }
    const image_path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await sb.storage.from(BUCKET).upload(image_path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (up.error) throw up.error;
    const { error } = await sb.from("posts").insert({ ...post, user_id: me.id, image_path });
    if (error) {
      await sb.storage.from(BUCKET).remove([image_path]); // don't leave an orphan photo behind
      throw error;
    }
  },

  async listComments(postId) {
    if (demo) {
      return readDemo(DEMO_COMMENTS)
        .filter((c) => c.post_id === postId && c.status === "visible")
        .map((c) => ({ ...c, is_mine: !!me && c.user_id === me.id }));
    }
    const { data, error } = await sb.from("public_comments").select("*").eq("post_id", postId).order("created_at");
    if (error) throw error;
    return data;
  },

  async createComment(postId, author_name, body) {
    if (demo) {
      const all = readDemo(DEMO_COMMENTS);
      all.push({ id: "democ-" + Date.now(), post_id: postId, created_at: new Date().toISOString(), user_id: me.id,
        author_name, body, status: "visible", author_is_expert: me.isExpert });
      writeDemo(DEMO_COMMENTS, all);
      return;
    }
    const { error } = await sb.from("comments").insert({ post_id: postId, user_id: me.id, author_name, body });
    if (error) throw error;
  },

  async hide(table, id) {
    if (demo) {
      const key = table === "posts" ? DEMO_POSTS : DEMO_COMMENTS;
      const all = readDemo(key);
      const row = all.find((r) => r.id === id);
      if (row) row.status = "hidden";
      writeDemo(key, all);
      return;
    }
    const { error } = await sb.from(table).update({ status: "hidden", hidden_by: me.id }).eq("id", id);
    if (error) throw error;
  },

  async remove(table, id, imagePath) {
    if (demo) {
      const key = table === "posts" ? DEMO_POSTS : DEMO_COMMENTS;
      writeDemo(key, readDemo(key).filter((r) => r.id !== id));
      return;
    }
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw error;
    if (imagePath && SAFE_PATH.test(imagePath)) await sb.storage.from(BUCKET).remove([imagePath]);
  },

  // Moderators only: posts and comments that were hidden, so they can be put back.
  async listHidden() {
    if (demo) {
      const posts = readDemo(DEMO_POSTS).filter((p) => p.status === "hidden")
        .map((p) => ({ table: "posts", id: p.id, who: p.author_name, text: p.caption || "(no caption)", at: p.created_at, imageUrl: p.image_url }));
      const comments = readDemo(DEMO_COMMENTS).filter((c) => c.status === "hidden")
        .map((c) => ({ table: "comments", id: c.id, who: c.author_name, text: c.body, at: c.created_at }));
      return [...posts, ...comments];
    }
    const [p, c] = await Promise.all([
      sb.from("posts").select("id,author_name,caption,created_at,image_path").eq("status", "hidden").order("created_at", { ascending: false }).limit(50),
      sb.from("comments").select("id,author_name,body,created_at").eq("status", "hidden").order("created_at", { ascending: false }).limit(50),
    ]);
    if (p.error) throw p.error;
    if (c.error) throw c.error;
    const urls = await photoUrls(BUCKET, p.data.map((x) => x.image_path).filter((x) => SAFE_PATH.test(x)));
    return [
      ...p.data.map((x) => ({ table: "posts", id: x.id, who: x.author_name, text: x.caption || "(no caption)", at: x.created_at,
        imageUrl: urls[x.image_path] || "" })),
      ...c.data.map((x) => ({ table: "comments", id: x.id, who: x.author_name, text: x.body, at: x.created_at })),
    ];
  },

  async restore(table, id) {
    if (demo) {
      const key = table === "posts" ? DEMO_POSTS : DEMO_COMMENTS;
      const all = readDemo(key);
      const row = all.find((r) => r.id === id);
      if (row) row.status = "visible";
      writeDemo(key, all);
      return;
    }
    const { error } = await sb.from(table).update({ status: "visible", hidden_by: null }).eq("id", id);
    if (error) throw error;
  },

  // "Report this": is the flags table set up yet? (Lets the site be published before the database
  // script is run: the Report button just stays hidden until the table exists.)
  async flagsAvailable() {
    if (demo) return true;
    const { error } = await sb.from("flags").select("id").limit(1);
    return !(error && (error.code === "PGRST205" || error.status === 404));
  },

  async report(kind, itemId, reason) {
    if (demo) {
      const all = readDemo("phragFlags");
      if (all.some((f) => f.user_id === me.id && f.kind === kind && f.item_id === itemId)) throw { code: "23505" };
      all.push({ user_id: me.id, kind, item_id: itemId, reason });
      writeDemo("phragFlags", all);
      return;
    }
    const { error } = await sb.from("flags").insert({ user_id: me.id, kind, item_id: itemId, reason });
    if (error) throw error;
  },

  async clearFlags(itemId) { // moderators only: the reports were looked at, so stop showing them
    if (demo) { writeDemo("phragFlags", readDemo("phragFlags").filter((f) => f.item_id !== itemId)); return; }
    const { error } = await sb.from("flags").delete().eq("item_id", itemId);
    if (error) throw error;
  },

  async listFlags() { // moderators only
    if (demo) return readDemo("phragFlags");
    const { data, error } = await sb.from("flags").select("kind,item_id,reason");
    if (error) throw error;
    return data;
  },
};

// Moderators see how many people reported an item, and why.
function flagNote(id) {
  const reasons = flags[id];
  if (!reasons || !reasons.length) return [];
  const note = h("p", { className: "flagged" }, `⚑ Reported ${reasons.length}×: ${reasons.join(" · ")} `);
  note.append(actionBtn("Dismiss reports", "link-btn", async () => {
    await store.clearFlags(id);
    delete flags[id];
    note.remove();
  }));
  return [note];
}

async function loadFlags() {
  flags = {};
  if (!me || !flagsReady || !(me.isExpert || me.isEditor)) return;
  try {
    for (const f of await store.listFlags()) (flags[f.item_id] = flags[f.item_id] || []).push(f.reason);
  } catch (e) { console.error(e); }
}

async function reportItem(kind, id) {
  const reason = prompt("Why are you reporting this? (for example: shows a person's face, isn't Phragmites, rude or spam)");
  if (!reason || !reason.trim()) return;
  try {
    await store.report(kind, id, reason.trim().slice(0, 300));
    alert("Thank you. A moderator will take a look.");
  } catch (err) {
    console.error(err);
    alert(err && err.code === "23505" ? "You've already reported this." : friendly(err, "Couldn't send your report. Please try again."));
  }
}

// Server rate-limit messages start with "You've"; show those, keep other errors generic.
const friendly = (err, fallback) => (err && /^You've/.test(err.message || "") ? err.message : fallback);

// ---------- Feed ----------
function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

function coordsText(p) {
  return p.precise
    ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
    : `≈ ${p.lat.toFixed(2)}, ${p.lng.toFixed(2)} (approximate)`;
}

function renderFeed() {
  const feed = $("feed");
  feed.textContent = "";
  let list = posts.filter((p) => guess === "all" || p.id_guess === guess);
  list.forEach((p) => delete p.km);
  if (mode === "new" && !loadFailed) {
    $("feed-status").textContent = guess !== "all"
      ? `${list.length} of ${posts.length} photo${posts.length === 1 ? "" : "s"}`
      : `${posts.length} photo${posts.length === 1 ? "" : "s"}`;
  }
  if (mode === "near" && userPos) {
    list.forEach((p) => (p.km = km(userPos, p)));
    list.sort((a, b) => a.km - b.km);
    const radius = Number($("radius").value); // 0 means all of Utah
    if (radius) list = list.filter((p) => p.km <= radius);
    $("feed-status").textContent = radius
      ? `${list.length} photo${list.length === 1 ? "" : "s"} within ${radius} km of you`
      : `${list.length} photo${list.length === 1 ? "" : "s"}, nearest first`;
  }
  if (!list.length) {
    const nearby = mode === "near" && userPos;
    feed.append(h("p", { className: "empty" }, guess !== "all" && posts.length
      ? "No photos match this filter. Choose All to see every photo."
      : nearby
        ? "No photos near you yet. Try a wider distance, or be the first to share one!"
        : "No photos yet. Be the first to share one!"));
    appendMore(feed);
    return;
  }
  list.forEach((p) => feed.append(renderPost(p)));
  appendMore(feed);
  // Jump to a linked post (#post-...) only when the page first opens, not on every redraw.
  if (!hashHandled) {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
}

// A full page of photos means there may be older ones: offer to load another page.
function appendMore(feed) {
  if (demo || loadFailed || posts.length < postLimit) return;
  const btn = h("button", { type: "button", className: "button more-btn" }, "Show more photos");
  btn.addEventListener("click", async () => { btn.disabled = true; postLimit += PAGE_SIZE; await reload(); });
  feed.append(btn);
}

function renderPost(p) {
  const card = h("article", { className: "post", id: "post-" + p.id });
  const head = h("div", { className: "post-head" }, h("span", { className: "who" }, p.author_name));
  if (p.author_is_expert) head.append(badge());
  head.append(h("span", { className: "tag" }, ID_LABELS[p.id_guess] || ""));
  card.append(head);
  if (p.imageUrl) card.append(h("img", { className: "post-photo", src: p.imageUrl, loading: "lazy",
    alt: p.caption ? "Phragmites photo: " + p.caption : "Photo of Phragmites" }));

  const body = h("div", { className: "post-body" });
  if (p.caption) body.append(h("p", {}, p.caption));
  const meta = h("p", { className: "meta" },
    `Seen ${p.taken_on} · ${coordsText(p)} · `,
    h("a", { href: `map.html?lat=${p.lat}&lng=${p.lng}&zoom=${p.precise ? 16 : 13}` }, "View on map"),
    p.km != null ? ` · ${p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} km away` : "");
  body.append(meta, ...flagNote(p.id));

  const panel = h("div", { className: "comments", hidden: true });
  const toggle = h("button", { type: "button" }, `Comments (${p.comment_count})`);
  toggle.addEventListener("click", async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) await renderComments(p, panel, toggle);
  });
  const actions = h("div", { className: "actions" }, toggle);
  if (me && (me.isExpert || me.isEditor) && !p.is_mine) actions.append(actionBtn("Hide", "", async () => {
    if (!confirm("Hide this photo from the public feed?")) return;
    await store.hide("posts", p.id); await reload();
  }));
  if (p.is_mine) actions.append(actionBtn("Delete", "danger", async () => {
    if (!confirm("Delete your photo and its comments?")) return;
    await store.remove("posts", p.id, p.image_path); await reload();
  }));
  if (me && flagsReady && !p.is_mine) actions.append(actionBtn("Report", "", () => reportItem("post", p.id)));
  body.append(actions);
  card.append(body, panel);
  return card;
}

function actionBtn(label, cls, fn) {
  const b = h("button", { type: "button", className: cls }, label);
  b.addEventListener("click", () => fn().catch((e) => { console.error(e); alert("That didn't work. Please try again."); }));
  return b;
}

async function renderComments(p, panel, toggle) {
  panel.textContent = "Loading…";
  let comments;
  try { comments = await store.listComments(p.id); }
  catch (e) { console.error(e); panel.textContent = "Couldn't load comments."; return; }
  panel.textContent = "";
  toggle.textContent = `Comments (${comments.length})`;
  if (!comments.length) panel.append(h("p", { className: "small" }, "No comments yet."));

  for (const c of comments) {
    const row = h("div", { className: "comment" + (c.author_is_expert ? " by-expert" : "") });
    const who = h("p", {}, h("strong", {}, c.author_name), " ");
    if (c.author_is_expert) who.append(badge(), " ");
    who.append(h("span", { className: "meta" }, when(c.created_at)));
    row.append(who, h("p", {}, c.body), ...flagNote(c.id));
    const acts = h("div", { className: "actions" });
    if (me && (me.isExpert || me.isEditor) && !c.is_mine) acts.append(actionBtn("Hide", "", async () => {
      await store.hide("comments", c.id); await renderComments(p, panel, toggle);
    }));
    if (c.is_mine) acts.append(actionBtn("Delete", "danger", async () => {
      await store.remove("comments", c.id); await renderComments(p, panel, toggle);
    }));
    if (me && flagsReady && !c.is_mine) acts.append(actionBtn("Report", "", () => reportItem("comment", c.id)));
    if (acts.children.length) row.append(acts);
    panel.append(row);
  }

  if (!me) {
    panel.append(h("p", { className: "small" }, h("a", { href: "login.html" }, "Sign in"), " to comment."));
    return;
  }
  const name = h("input", { type: "text", maxLength: 60, placeholder: "Your name", required: true,
    value: localStorage.getItem("phragName") || "" });
  const text = h("textarea", { rows: 3, maxLength: 1000, placeholder: "Add a comment…", required: true });
  const send = h("button", { type: "submit" }, "Post comment");
  const msg = h("p", { className: "small", role: "status" });
  const form = h("form", { className: "comment-form" }, name, text, send, msg);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    send.disabled = true;
    try {
      localStorage.setItem("phragName", name.value.trim());
      await store.createComment(p.id, name.value.trim(), text.value.trim());
      await renderComments(p, panel, toggle);
    } catch (err) {
      console.error(err);
      msg.textContent = friendly(err, "Couldn't post your comment. Please try again.");
      send.disabled = false;
    }
  });
  panel.append(form);
}

async function reload() {
  $("feed-status").textContent = "Loading…";
  loadFailed = false;
  try {
    posts = await store.listPosts(postLimit);
    await loadFlags();
  } catch (e) {
    console.error(e);
    $("feed-status").textContent = "Couldn't load photos.";
    loadFailed = true;
    posts = [];
  }
  renderFeed();
  hashHandled = true;
  await renderHidden();
}

// Experts and editors can see what was hidden and put it back (no database editing needed).
async function renderHidden() {
  const panel = $("hidden-panel");
  const isMod = !!(me && (me.isExpert || me.isEditor));
  panel.hidden = !isMod;
  if (!isMod) return;
  const list = $("hidden-list");
  list.textContent = "Loading…";
  let items;
  try { items = await store.listHidden(); }
  catch (e) { console.error(e); list.textContent = "Couldn't load hidden items."; return; }
  $("hidden-count").textContent = items.length;
  list.textContent = "";
  if (!items.length) { list.append(h("p", { className: "small" }, "Nothing is hidden.")); return; }
  for (const it of items) {
    const row = h("div", { className: "hidden-item" });
    if (it.imageUrl) row.append(h("img", { src: it.imageUrl, alt: "Hidden photo", loading: "lazy" }));
    row.append(h("div", {},
      h("p", {}, h("strong", {}, it.table === "posts" ? "Photo" : "Comment"), ` by ${it.who} · ${when(it.at)}`),
      h("p", { className: "small" }, it.text)));
    row.append(actionBtn("Restore", "", async () => { await store.restore(it.table, it.id); await reload(); }));
    list.append(row);
  }
}

$("new-btn").addEventListener("click", () => {
  mode = "new";
  $("new-btn").classList.add("active"); $("near-btn").classList.remove("active");
  $("radius").hidden = true;
  $("feed-status").textContent = `${posts.length} photo${posts.length === 1 ? "" : "s"}`;
  renderFeed();
});
$("radius").addEventListener("change", renderFeed);
document.querySelectorAll("[data-guess]").forEach((btn) => btn.addEventListener("click", () => {
  guess = btn.dataset.guess;
  document.querySelectorAll("[data-guess]").forEach((b) => b.classList.toggle("active", b === btn));
  renderFeed();
}));
$("near-btn").addEventListener("click", () => {
  if (!navigator.geolocation) { $("feed-status").textContent = "Your browser can't share location."; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mode = "near";
      $("near-btn").classList.add("active"); $("new-btn").classList.remove("active");
      $("radius").hidden = false;
      renderFeed();
    },
    () => { $("feed-status").textContent = "Couldn't get your location."; }
  );
});

// ---------- Composer ----------
const form = $("post-form");
let pickMap = null, pin = null;

function setPin(lat, lng, note) {
  if (!inUtah(lat, lng)) { $("loc-info").textContent = "That spot is outside Utah. Pick a location inside Utah."; return false; }
  if (pin) pin.setLatLng([lat, lng]);
  else {
    pin = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
    pin.on("dragend", () => { const p = pin.getLatLng(); setPin(p.lat, p.lng); });
  }
  $("loc-info").textContent = (note ? note + " " : "") + `Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag the pin to adjust.`;
  return true;
}

function initPickMap() {
  if (pickMap) { pickMap.invalidateSize(); return; }
  pickMap = L.map("pick-map").setView([39.3, -111.6], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(pickMap);
  pickMap.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));
}

function closeComposer() {
  form.reset();
  form.hidden = true;
  $("preview").hidden = true;
  $("post-msg").textContent = "";
  addrResults.hidden = true;
  if (pin && pickMap) { pickMap.removeLayer(pin); pin = null; }
  $("loc-info").textContent = "Choose a photo and we'll use its location if it has one. You can also click the map.";
}

$("share-btn").addEventListener("click", () => {
  form.hidden = false;
  form.taken_on.value = new Date().toISOString().slice(0, 10);
  form.taken_on.max = form.taken_on.value;
  form.author_name.value = localStorage.getItem("phragName") || "";
  initPickMap();
  setTimeout(() => pickMap.invalidateSize(), 50);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("cancel-post").addEventListener("click", closeComposer);

// Search an address instead of clicking the map.
const addrResults = $("addr-results");
async function findAddress() {
  const q = $("addr-input").value.trim();
  if (q.length < 3) return;
  const btn = $("addr-btn");
  btn.disabled = true;
  addrResults.hidden = false;
  addrResults.textContent = "";
  const note = (text) => addrResults.append(h("li", {}, h("div", { className: "note" }, text)));
  const pick = (r) => {
    addrResults.hidden = true;
    if (setPin(r.lat, r.lng, "Using the address you searched.")) pickMap.setView([r.lat, r.lng], 16);
  };
  note("Searching…");
  try {
    const found = await window.phragGeocode.search(q);
    addrResults.textContent = "";
    if (!found.length) { note("No matches in Utah. Try adding the city."); return; }
    if (found.length === 1) { pick(found[0]); return; }
    for (const r of found) {
      const b = h("button", { type: "button" }, r.name);
      b.addEventListener("click", () => pick(r));
      addrResults.append(h("li", {}, b));
    }
  } catch (e) {
    console.error(e);
    addrResults.textContent = "";
    note("Search isn't working right now. Click the map instead.");
  } finally {
    btn.disabled = false;
  }
}
$("addr-btn").addEventListener("click", findAddress);
$("addr-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findAddress(); } });

// Photos carry their GPS position and date. We read them here, then the saved copy is
// re-drawn without that hidden data.
form.photo.addEventListener("change", async () => {
  const file = form.photo.files[0];
  if (!file) return;
  $("preview").src = URL.createObjectURL(file);
  $("preview").hidden = false;
  if (typeof exifr === "undefined") return;
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      if (setPin(gps.latitude, gps.longitude, "Location read from your photo.")) pickMap.setView([gps.latitude, gps.longitude], 14);
      else $("loc-info").textContent = "This photo's location is outside Utah. Click the map to choose where it was taken.";
    } else {
      $("loc-info").textContent = "This photo has no location saved in it. Click the map or use your current location.";
    }
    const meta = await exifr.parse(file, ["DateTimeOriginal"]);
    const d = meta && meta.DateTimeOriginal;
    if (d instanceof Date && !isNaN(d)) {
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (iso <= form.taken_on.max) form.taken_on.value = iso;
    }
  } catch (e) { console.error(e); }
});

$("gps-btn").addEventListener("click", () => {
  if (!navigator.geolocation) { $("loc-info").textContent = "Your browser can't share location."; return; }
  navigator.geolocation.getCurrentPosition(
    (p) => { if (setPin(p.coords.latitude, p.coords.longitude, "Using your current location.")) pickMap.setView([p.coords.latitude, p.coords.longitude], 14); },
    () => { $("loc-info").textContent = "Couldn't get your location. Click the map instead."; }
  );
});

// Re-draws the photo as a JPEG: shrinks big phone photos and drops hidden metadata.
// (Same approach as cms.js; kept separate so each page loads only what it needs.)
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("post-msg");
  const file = form.photo.files[0];
  if (!file) { msg.textContent = "Choose a photo first."; return; }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { msg.textContent = "Please choose a JPG, PNG or WebP photo."; return; }
  if (file.size > 25 * 1024 * 1024) { msg.textContent = "That photo is too large (over 25 MB)."; return; }
  if (!pin) { msg.textContent = "Place the pin where the photo was taken."; return; }
  const { lat, lng } = pin.getLatLng();
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  msg.textContent = "Posting…";
  try {
    const name = form.author_name.value.trim();
    localStorage.setItem("phragName", name);
    const blob = await shrink(file);
    await store.createPost({
      author_name: name, lat, lng, precise: form.precise.checked, taken_on: form.taken_on.value,
      id_guess: form.id_guess.value, caption: form.caption.value.trim() || null,
    }, blob);
    closeComposer();
    await reload();
  } catch (err) {
    console.error(err);
    msg.textContent = friendly(err, "Couldn't post your photo. Please try again.");
  } finally {
    submit.disabled = false;
  }
});

// ---------- Start up ----------
(async function init() {
  $("demo-note").hidden = !demo;
  try { me = await getMember(); } catch (e) { console.error(e); }
  if (me) { try { flagsReady = await store.flagsAvailable(); } catch (e) { console.error(e); } }
  $("share-btn").hidden = !me;
  $("signin-link").hidden = !!me;
  await reload();
})();
