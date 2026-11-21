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

  // The tab is only a label for what the person expects. Real access always comes from their
  // email's row in member_emails; the choice is remembered so the Members page can say so if
  // the email doesn't have the role they picked.
  const KINDS = [
    { id: "community", tab: "Community", text: "Sign in or sign up to share photos and comment", back: false },
    { id: "member", tab: "Team member", text: "Team member sign-in: use the email the admin added, to edit the site", back: true },
    { id: "expert", tab: "Expert", text: "Expert sign-in: use the email the admin added, to verify map reports", back: true },
  ];
  let kind = KINDS[0];
  const tabs = document.createElement("div");
  tabs.className = "signin-tabs";
  tabs.setAttribute("role", "tablist");
  const tabBtns = KINDS.map((k) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = k.tab;
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => pick(k));
    tabs.appendChild(b);
    return b;
  });
  function pick(k) {
    kind = k;
    KINDS.forEach((x, i) => tabBtns[i].setAttribute("aria-selected", x === k ? "true" : "false"));
    label.firstChild.textContent = k.text;
    msg.textContent = "";
  }

  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = KINDS[0].text;
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
  bar.append(tabs, form, msg, close);
  pick(KINDS[0]);
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
    if (demo) { localStorage.setItem("phragDemoMember", "1"); try { localStorage.setItem("phragSignInAs", kind.id); } catch (err) { /* storage blocked */ } location.reload(); return; }
    send.disabled = true;
    try { localStorage.setItem("phragSignInAs", kind.id); } catch (err) { /* storage blocked */ }
    // Team members and experts land on the Members page, which shows their status.
    const { error } = await sb.auth.signInWithOtp({
      email: input.value.trim(),
      options: { emailRedirectTo: location.origin + (kind.back ? location.pathname.replace(/[^/]*$/, "login.html") : location.pathname) },
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
