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
