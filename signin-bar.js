// The small account button at the end of the menu, and the sign-in panel it opens.
// In the HTML it's a plain "Sign in" link to the Members page, so it works even without this
// script. For signed-out visitors, clicking it opens a one-line email form under the header
// instead; entering an email sends the same sign-in link as the Members page (Supabase creates
// the account the first time, so there is no separate sign-up). For signed-in visitors it reads
// "My account" and goes to the Members page. Needs auth.js loaded first.
(function () {
  const { demo, sb, getMember } = window.phrag;
  const header = document.querySelector(".site-header");
  const account = header && header.querySelector(".nav-account");
  if (!account) return;

  const RESEND_SECONDS = 60;
  const bar = document.createElement("div");
  bar.id = "signin-bar";
  bar.className = "signin-bar";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Sign in");

  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Email";
  const input = document.createElement("input");
  input.type = "email"; input.name = "email"; input.placeholder = "you@example.org";
  input.autocomplete = "email"; input.required = true;
  label.appendChild(input);
  const send = document.createElement("button");
  send.type = "submit"; send.textContent = demo ? "Sign in as demo member" : "Email me a link";
  if (demo) input.required = false;
  form.append(label, send);

  // Team members and experts sign in on the Members page, which brings them back there to
  // check their role and (for experts) open the review dashboard.
  const team = document.createElement("a");
  team.href = "login.html"; team.className = "signin-team"; team.textContent = "Team or expert sign-in";
  const msg = document.createElement("span");
  msg.className = "signin-msg"; msg.setAttribute("role", "status");
  const close = document.createElement("button");
  close.type = "button"; close.className = "signin-close"; close.textContent = "×";
  close.setAttribute("aria-label", "Close sign-in");
  bar.append(form, team, msg, close);
  header.appendChild(bar);

  // The map fills the screen below the header, so tell it how tall this panel is.
  const syncHeight = () => document.documentElement.style.setProperty("--bar-h", bar.hidden ? "0px" : bar.offsetHeight + "px");
  new ResizeObserver(syncHeight).observe(bar);

  let signedIn = null; // null until we know; until then the link behaves like a normal link
  function setOpen(open) {
    bar.hidden = !open;
    if (signedIn === false) account.setAttribute("aria-expanded", String(open));
    syncHeight();
  }

  account.addEventListener("click", (e) => {
    // Signed in, or opening in a new tab: let the link go to the Members page.
    if (signedIn !== false || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    setOpen(bar.hidden);
    if (!bar.hidden) input.focus();
  });
  close.addEventListener("click", () => { setOpen(false); account.focus(); });
  bar.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); account.focus(); } });

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

  // Label the button to match who is here, and close the panel right after a sign-in.
  async function refresh() {
    let member = null;
    try { member = await getMember(); } catch (e) { /* treat as signed out */ }
    signedIn = !!member;
    account.textContent = signedIn ? "My account" : "Sign in";
    if (signedIn) {
      account.removeAttribute("aria-expanded");
      account.removeAttribute("aria-controls");
      setOpen(false);
    } else {
      account.setAttribute("aria-controls", bar.id);
      account.setAttribute("aria-expanded", String(!bar.hidden));
    }
  }
  if (sb) sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(refresh, 0);
  });
  refresh();
})();
