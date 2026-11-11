// Supabase project connection. Both values are meant to be public: security comes from the
// row-level security rules in supabase/schema.sql and supabase/cms.sql, not from hiding these.
// NEVER put the "secret" or "service_role" key here.
// Leave both empty to run in demo mode (reports and edits are saved only in your own browser).
window.PHRAG_CONFIG = {
  supabaseUrl: "https://wqtborgrbtmexudnqlfg.supabase.co",
  supabaseKey: "sb_publishable_l4OExOf751hYvtZNXwkPng_GeWcmWPy"
};
