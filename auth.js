// Shared sign-in helper. Creates the one Supabase client for the page and tells other
// scripts who is signed in. With no keys in config.js it runs in demo mode: "signing in"
// only sets a flag in this browser, and edits stay in this browser too.
(function () {
  const cfg = window.PHRAG_CONFIG || {};
  const demo = !cfg.supabaseUrl || !cfg.supabaseKey;
  const sb = demo ? null : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  const ROLE_CACHE = "phragRoles"; // last role check that worked, kept for this browser tab
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Returns null when signed out, else { id, email, isEditor, isExpert, roleError }.
  // Anyone signed in is returned; the flags say whether they also have a member role.
  // roleError is true when the role check itself failed (not the same as "no role"), so pages
  // can say "couldn't check" instead of quietly turning editing off.
  // Callers that ask at the same moment share one check.
  let pending = null;
  function getMember() {
    if (!pending) pending = loadMember().finally(() => { pending = null; });
    return pending;
  }

  async function loadMember() {
    if (demo) {
      return localStorage.getItem("phragDemoMember") === "1"
        ? { id: "demo-user", email: "Demo member", isEditor: true, isExpert: true, roleError: false }
        : null;
    }
    const { data } = await sb.auth.getSession();
    const user = data.session && data.session.user;
    if (!user) return null;

    const [editor, expert] = await Promise.all([
      checkRole("is_editor", "editors", user.id),
      checkRole("is_expert", "experts", user.id),
    ]);
    if (editor.ok && expert.ok) {
      saveCache(user.id, editor.value, expert.value);
      return { id: user.id, email: user.email, isEditor: editor.value, isExpert: expert.value, roleError: false };
    }
    // The check failed (network blip, expired token mid-refresh...). Fall back to the last
    // answer that worked for this same person, if there is one.
    const cached = readCache(user.id);
    return {
      id: user.id, email: user.email,
      isEditor: editor.ok ? editor.value : !!(cached && cached.isEditor),
      isExpert: expert.ok ? expert.value : !!(cached && cached.isExpert),
      roleError: !cached,
    };
  }

  // { ok: true, value } when the database gave a real answer, { ok: false } when it didn't.
  // Roles come from the approved-email list or the older user-ID tables, both checked by the
  // database function. If supabase/members.sql hasn't been run yet the function doesn't exist,
  // so use the user-ID table instead.
  async function checkRole(fn, table, userId) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await sb.rpc(fn);
      if (!error) return { ok: true, value: data === true };
      if (error.code === "PGRST202" || error.status === 404) {
        const row = await sb.from(table).select("user_id").eq("user_id", userId).maybeSingle();
        if (!row.error) return { ok: true, value: !!row.data };
      }
      if (attempt === 0) await sleep(800);
    }
    return { ok: false };
  }

  function saveCache(id, isEditor, isExpert) {
    try { sessionStorage.setItem(ROLE_CACHE, JSON.stringify({ id, isEditor, isExpert })); } catch (e) { /* storage blocked */ }
  }
  function readCache(id) {
    try {
      const c = JSON.parse(sessionStorage.getItem(ROLE_CACHE) || "null");
      return c && c.id === id ? c : null;
    } catch (e) { return null; }
  }

  window.phrag = { cfg, demo, sb, getMember };
})();
