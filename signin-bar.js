// "Sign in or sign up" bar under the site header, shown to visitors who are signed out.
// Entering an email sends the same sign-in link as the Members page (Supabase creates the
// account the first time, so there is no separate sign-up). Needs auth.js loaded first.
// The bar can be closed for the rest of the visit. It never shows on the Members page.
(function () {
  const { demo, sb, getMember } = window.phrag;
  const header = document.querySelector(".site-header");
  if (!header || /login\.html$/.test(location.pathname)) return;
  try { if (sessionStorage.getItem("phragBarClosed") === "1") return; } catch (e) { /* storage blocked */ }

  const RESEND_SECONDS = 60;
  const bar = document.createElement("div");
  bar.className = "signin-bar";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Sign in");

  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Sign in or sign up to share photos and comment";
  const input = document.createElement("input");
  input.type = "email"; input.name = "email"; input.placeholder = "you@example.org";
  input.autocomplete = "email"; input.required = true;
  label.appendChild(input);
  const send = document.createElement("button");
  send.type = "submit"; send.textContent = demo ? "Sign in as demo member" : "Email me a link";
  if (demo) input.required = false;
  form.append(label, send);

  const msg = document.createElement("span");
  msg.className = "signin-msg"; msg.setAttribute("role", "status");
  const close = document.createElement("button");
  close.type = "button"; close.className = "signin-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close sign-in bar");
  bar.append(form, msg, close);
  header.appendChild(bar);

  // The map fills the screen below the header, so tell it how tall this bar is.
  const syncHeight = () => document.documentElement.style.setProperty("--bar-h", bar.hidden ? "0px" : bar.offsetHeight + "px");
  new ResizeObserver(syncHeight).observe(bar);

  function dismiss() {
    bar.hidden = true;
    syncHeight();
    try { sessionStorage.setItem("phragBarClosed", "1"); } catch (e) { /* storage blocked */ }
  }
  close.addEventListener("click", dismiss);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (send.disabled) return;
    if (demo) { localStorage.setItem("phragDemoMember", "1"); location.reload(); return; }
    send.disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email: input.value.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) {
      msg.textContent = "Couldn't send the link. Wait a minute and try again.";
      setTimeout(() => (send.disabled = false), 5000);
      return;
    }
    let left = RESEND_SECONDS;
    const tick = () => {
      msg.textContent = `Link sent. Check your email (look in spam too). Resend in ${left}s.`;
      if (left-- <= 0) { msg.textContent = "Didn't get it? You can send another now."; send.disabled = false; }
      else setTimeout(tick, 1000);
    };
    tick();
  });

  // Show only when nobody is signed in; hide again right after a sign-in.
  async function refresh() {
    let member = null;
    try { member = await getMember(); } catch (e) { /* treat as signed out */ }
    bar.hidden = !!member;
    syncHeight();
  }
  if (sb) sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(refresh, 0);
  });
  refresh();
})();
