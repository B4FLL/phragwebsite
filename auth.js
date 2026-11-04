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
    const [editor, expert] = await Promise.all([
      sb.from("editors").select("user_id").eq("user_id", user.id).maybeSingle(),
      sb.from("experts").select("user_id").eq("user_id", user.id).maybeSingle(),
    ]);
    return { email: user.email, isEditor: !!editor.data, isExpert: !!expert.data };
  }

  window.phrag = { cfg, demo, sb, getMember };
})();
