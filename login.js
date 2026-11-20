const { demo, sb, getMember } = window.phrag;
const $ = (id) => document.getElementById(id);
const RESEND_SECONDS = 60;

async function render() {
  $("demo-note").hidden = !demo;
  $("demo-btn").hidden = !demo;
  const member = await getMember();
  $("signed-out").hidden = !!member;
  $("signed-in").hidden = !member;
  if (!member) return;
  $("who").textContent = member.email;
  $("edit-link").hidden = !member.isEditor;
  $("review-link").hidden = !member.isExpert;
  $("role-error").hidden = !member.roleError;
  $("no-role").hidden = member.isEditor || member.isExpert || member.roleError;
}

// The sign-in email links back to whatever address this page is on. From a local preview
// (localhost) that link only works on this computer while the preview server is running,
// so say so instead of letting members hit a dead page.
if (["localhost", "127.0.0.1"].includes(location.hostname)) {
  const note = document.createElement("p");
  note.className = "notice";
  note.textContent = "You're on a local preview. The sign-in link will open localhost, which only works on this computer. To sign in as a real member, use the live website address.";
  $("login-form").before(note);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("login-msg");
  if (demo) { msg.textContent = "Demo mode has no email. Use the demo button instead."; return; }
  const email = e.target.email.value.trim();
  // Supabase's free email sender allows only a few emails per hour, so block repeat taps.
  const button = e.target.querySelector("[type=submit]");
  if (button.disabled) return;
  button.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) {
    msg.textContent = "Couldn't send the link. Wait a minute and try again.";
    setTimeout(() => (button.disabled = false), 5000);
    return;
  }
  let left = RESEND_SECONDS;
  const tick = () => {
    msg.textContent = `Link sent. Check your email (look in spam too). You can send another in ${left} seconds.`;
    if (left-- <= 0) {
      msg.textContent = "Check your email for the sign-in link (look in spam too). Didn't get it? You can send another now.";
      button.disabled = false;
    } else setTimeout(tick, 1000);
  };
  tick();
});

$("demo-btn").addEventListener("click", () => {
  localStorage.setItem("phragDemoMember", "1");
  render();
});

$("logout-btn").addEventListener("click", async () => {
  if (demo) localStorage.removeItem("phragDemoMember");
  else await sb.auth.signOut();
  render();
});

// Only react to real sign-in/sign-out. The callback must not wait on other Supabase calls
// (Supabase's docs warn that can freeze its auth lock), so it just schedules a redraw.
if (sb) sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(render, 0);
});
render();
