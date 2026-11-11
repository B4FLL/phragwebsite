// Shared sign-in helper. Creates the one Supabase client for the page and tells other
// scripts who is signed in. With no keys in config.js it runs in demo mode: "signing in"
// only sets a flag in this browser, and edits stay in this browser too.
(function () {
  const cfg = window.PHRAG_CONFIG || {};
  const demo = !cfg.supabaseUrl || !cfg.supabaseKey;
  const sb = demo ? null : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  // Returns null when signed out, else { email, isEditor, isExpert }.
  async function getMember() {
    if (demo) {
      return localStorage.getItem("phragDemoMember") === "1"
        ? { email: "Demo member", isEditor: true, isExpert: true }
        : null;
    }
    const { data } = await sb.auth.getSession();
    const user = data.session && data.session.user;
    if (!user) return null;
    const [isEditor, isExpert] = await Promise.all([
      hasRole("is_editor", "editors", user.id),
      hasRole("is_expert", "experts", user.id),
    ]);
    return { email: user.email, isEditor, isExpert };
  }

  // Roles come from the approved-email list or the older user-ID tables, both checked by
  // the database function. If supabase/members.sql hasn't been run yet the function won't
  // exist, so fall back to the user-ID table.
  async function hasRole(fn, table, userId) {
    const { data, error } = await sb.rpc(fn);
    if (!error) return data === true;
    const row = await sb.from(table).select("user_id").eq("user_id", userId).maybeSingle();
    return !!row.data;
  }

  window.phrag = { cfg, demo, sb, getMember };
})();
