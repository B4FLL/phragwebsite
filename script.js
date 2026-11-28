// Mobile menu toggle
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".site-nav");

toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
});

// Close the menu after picking a link
nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", false);
  });
});

// Footer year
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

// Escape closes the open phone menu and puts the keyboard back on its button
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !nav.classList.contains("open")) return;
  nav.classList.remove("open");
  toggle.setAttribute("aria-expanded", false);
  toggle.focus();
});

// "Skip to content" link, the first thing a keyboard user reaches
const main = document.querySelector("main") || document.querySelector(".map-layout");
if (main) {
  if (!main.id) main.id = "main";
  main.tabIndex = -1;
  const skip = document.createElement("a");
  skip.className = "skip-link";
  skip.href = "#" + main.id;
  skip.textContent = "Skip to content";
  skip.addEventListener("click", (e) => { e.preventDefault(); main.focus(); main.scrollIntoView(); });
  document.body.prepend(skip);
}
