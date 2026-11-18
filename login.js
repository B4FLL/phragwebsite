const { demo, sb, getMember } = window.phrag;
const $ = (id) => document.getElementById(id);

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
  $("no-role").hidden = member.isEditor || member.isExpert;
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
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  msg.textContent = error
    ? "Couldn't send the link. Wait a minute and try again."
    : "Check your email for the sign-in link (look in spam too).";
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

if (sb) sb.auth.onAuthStateChange(() => render());
render();
