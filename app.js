(function () {
  "use strict";

  const app = document.getElementById("app");
  const dialog = document.getElementById("checkout-dialog");
  const STORAGE_PREFIX = "ppwg:test-order:";
  const DOWNLOAD_LIMIT = 3;
  const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
  let countdownTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function readOrder(token) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + token);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveOrder(order) {
    localStorage.setItem(STORAGE_PREFIX + order.token, JSON.stringify(order));
  }

  function makeToken() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function routeUrl(route, token) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    if (route && token) url.searchParams.set(route, token);
    return url.toString();
  }

  function setRoute(route, token, replace) {
    const url = routeUrl(route, token);
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    render();
  }

  function moneyPlaceholder() { return "$XX.00"; }

  function header() {
    return `
      <header class="topbar wrap">
        <a class="brand" href="${escapeHtml(routeUrl(null, null))}" aria-label="Puerto Plata on Foot home">
          <span class="brand-mark" aria-hidden="true">P<span style="color:#f3b38e">.</span></span>
          <span class="brand-name">PUERTO PLATA ON FOOT<span class="brand-note">A Taino Bay walking guide</span></span>
        </a>
        <div class="topbar-note" aria-label="Made for cruise port days">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 17s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="7" r="2" stroke="currentColor" stroke-width="1.6"/></svg>
          For your port day
        </div>
      </header>`;
  }

  function footer() {
    return `
      <footer class="footer">
        <div class="footer-inner wrap">
          <p class="footer-copy">Puerto Plata on Foot <span aria-hidden="true">·</span> Guide content and cover art are placeholders.</p>
          <div class="footer-controls"><span class="test-badge">Test mode</span><button class="reset-button" type="button" data-action="reset">Reset demo</button></div>
        </div>
      </footer>`;
  }

  function coverArt() {
    return `
      <div class="cover-art" role="img" aria-label="Placeholder illustration of Puerto Plata's coast and historic city">
        <svg viewBox="0 0 700 560" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#bddfd8"/><stop offset="1" stop-color="#e7eee0"/></linearGradient>
            <linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#49a9a8"/><stop offset="1" stop-color="#177c83"/></linearGradient>
            <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#78a994"/><stop offset="1" stop-color="#4c8178"/></linearGradient>
          </defs>
          <rect width="700" height="560" fill="url(#sky)"/>
          <circle cx="549" cy="97" r="40" fill="#f3c998" opacity=".9"/>
          <path d="M0 242 91 178l52 28 83-87 77 51 74-89 86 86 55-26 113 100v139H0Z" fill="url(#hill)"/>
          <path d="m330 215 85-134 89 121 56-25 62 56v96H280Z" fill="#628f80" opacity=".65"/>
          <path d="M0 330c93-27 173-16 264 1 132 25 278 7 436-16v245H0Z" fill="url(#water)"/>
          <path d="M0 365c121-24 205 14 329 18 145 4 239-28 371-26" fill="none" stroke="#bee2d8" stroke-width="5" opacity=".55"/>
          <path d="M0 432c137-29 216 12 330 12 143 0 243-36 370-22" fill="none" stroke="#bee2d8" stroke-width="3" opacity=".4"/>
          <path d="M56 315h115v-64H56Z" fill="#e3a477"/><path d="M43 256h141l-70-46Z" fill="#bd7354"/>
          <path d="M74 277h22v38H74Zm49 0h22v38h-22Z" fill="#eff0dd"/>
          <path d="M183 316h113V232H183Z" fill="#f0d8aa"/><path d="m168 238 72-52 73 52Z" fill="#b85e4f"/>
          <path d="M205 266h21v49h-21Zm50 0h21v49h-21Z" fill="#8faea0"/>
          <path d="M291 315h127V204H291Z" fill="#f4e6c6"/><path d="M275 212h159l-80-57Z" fill="#d47d62"/>
          <path d="M338 155h34v-64h-34Zm9-65h16V70h-16Z" fill="#e9d9b4"/><path d="M314 245h23v70h-23Zm56 0h23v70h-23Zm-29 10h29v60h-29Z" fill="#839d8d"/>
          <path d="M422 316h118V239H422Z" fill="#e5c99e"/><path d="m410 245 71-46 70 46Z" fill="#b9785b"/>
          <path d="M450 265h22v51h-22Zm49 0h22v51h-22Z" fill="#92aca0"/>
          <path d="M598 326c-11-53-5-94 5-135M604 230c-21-33-41-42-60-47 6 24 24 42 60 47Zm-1 19c15-37 31-52 53-61-2 25-17 45-53 61Z" fill="none" stroke="#34786d" stroke-width="10" stroke-linecap="round"/>
          <path d="M617 328h28l-8 232h-13Z" fill="#a87454"/>
          <path d="M0 329h700v12H0Z" fill="#efe1bf" opacity=".83"/>
          <path d="M90 385h68m191 60h90m92-32h56M40 486h101m292 16h74" stroke="#c6e9dc" stroke-width="2" opacity=".55" stroke-linecap="round"/>
        </svg>
        <span class="cover-label">Cover image placeholder</span>
        <span class="art-caption">Concept illustration · replace with final cover</span>
      </div>`;
  }

  function landingPage() {
    return `
      <div class="site-shell">
        ${header()}
        <main>
          <section class="hero wrap">
            <div class="hero-grid">
              <div class="hero-copy">
                <div class="eyebrow"><span class="eyebrow-mark"></span> YOUR PORT DAY, WALKABLE</div>
                <h1>Puerto Plata,<br><em>on foot.</em></h1>
                <p class="hero-description">Make the most of your time ashore with a self-guided walking guide created for cruise passengers arriving at Taino Bay. Find your way into town, explore at your own pace, and enjoy Puerto Plata one easy stop at a time.</p>
                <ul class="feature-chips" aria-label="Guide features"><li>Start at Taino Bay</li><li>Self-guided</li><li>Made for cruise days</li></ul>
                <div class="purchase-card">
                  <div class="purchase-heading">
                    <div><p class="purchase-title">The Puerto Plata Walking Guide</p><p class="purchase-subtitle">Instant digital download · PDF</p></div>
                    <div class="price">${moneyPlaceholder()}<span class="price-label">one-time</span></div>
                  </div>
                  <button class="button button-primary button-full" type="button" data-action="buy">
                    Buy the Guide <span aria-hidden="true">→</span>
                  </button>
                  <p class="purchase-note"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 7V5.2a4 4 0 0 1 8 0V7m-8 0H3v7h10V7H4Zm4 3v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> Secure digital delivery · No account required</p>
                </div>
              </div>
              ${coverArt()}
            </div>
          </section>
          <section class="reassurance">
            <div class="wrap">
              <p class="reassurance-title">A simpler way to see the city</p>
              <div class="reassurance-grid">
                <article class="reassurance-item"><span class="reassurance-icon" aria-hidden="true">${icon("pin")}</span><div><h2>A clear place to begin</h2><p>Get oriented from Taino Bay, your starting point in port.</p></div></article>
                <article class="reassurance-item"><span class="reassurance-icon" aria-hidden="true">${icon("walk")}</span><div><h2>Walk at your own pace</h2><p>Follow a flexible route that fits your time ashore.</p></div></article>
                <article class="reassurance-item"><span class="reassurance-icon" aria-hidden="true">${icon("sun")}</span><div><h2>Enjoy the day ashore</h2><p>Explore local streets and sights, then head back to your ship.</p></div></article>
              </div>
            </div>
          </section>
        </main>
        ${footer()}
      </div>`;
  }

  function icon(name) {
    const paths = {
      pin: '<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.2"/>',
      walk: '<circle cx="13.5" cy="5" r="2"/><path d="m11 9 2.4 2.3 3.1 1.2M11 9l-2.5 4.3-2.8 1.5m5.5-5.8-1 5 3.5 2.2 1.2 4M10.2 14l-2 5"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    };
    return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  function confirmationPage(token) {
    const order = readOrder(token);
    if (!order) return unavailablePage("This test purchase could not be found in this browser. Complete a test purchase on this device to create a fresh download link.");
    const href = routeUrl("download", token);
    const expired = Date.now() >= order.expiresAt;
    return `
      <div class="site-shell">
        ${header()}
        <main class="state-main wrap">
          <section class="state-card" aria-labelledby="success-title">
            <div class="state-icon" aria-hidden="true">${icon("walk")}</div>
            <div class="eyebrow"><span class="eyebrow-mark"></span> TEST PURCHASE COMPLETE</div>
            <h1 id="success-title">You’re all set for Puerto Plata.</h1>
            <p class="state-copy">Your test purchase was successful. No payment was taken. Your preview guide is ready to download.</p>
            <div class="info-panel">
              <div class="info-row"><span>Test reference</span><strong>${escapeHtml(order.reference)}</strong></div>
              <div class="info-row"><span>Download window</span><strong>24 hours from purchase</strong></div>
              <div class="info-row"><span>Download allowance</span><strong>${order.maxDownloads - order.downloadsUsed} of ${order.maxDownloads} remaining</strong></div>
            </div>
            ${expired ? '<p class="notice">This test link has expired. Reset the demo and complete another test purchase to create a new link.</p>' : `
              <label class="link-label" for="unique-download-link">Your unique test download link</label>
              <input class="download-url" id="unique-download-link" readonly value="${escapeHtml(href)}" aria-label="Unique test download link">
              <div class="state-actions">
                <a class="button button-primary button-full" href="${escapeHtml(href)}">Open download page <span aria-hidden="true">→</span></a>
                <button class="button button-full" style="color:var(--sea-dark);background:var(--sea-light)" type="button" data-action="copy-link" data-url="${escapeHtml(href)}">Copy test link</button>
              </div>`}
            <p class="state-footnote">This browser-only demo link expires at ${escapeHtml(new Date(order.expiresAt).toLocaleString())} and allows up to ${order.maxDownloads} downloads. It works in this browser on this local preview.</p>
          </section>
        </main>
        ${footer()}
      </div>`;
  }

  function downloadPage(token) {
    const order = readOrder(token);
    if (!order) return unavailablePage("This download link is not available in this browser. Test links are stored locally with the browser that creates them.");
    const remaining = order.maxDownloads - order.downloadsUsed;
    const expired = Date.now() >= order.expiresAt;
    if (expired || remaining <= 0) {
      const heading = expired ? "This link has expired." : "Download limit reached.";
      const message = expired
        ? "The 24-hour test download window has ended. Return to the page to reset the demo and create a new test purchase."
        : "This test link has been used for all three allowed download attempts. Reset the demo and complete another test purchase if you want to try again.";
      return statePage(heading, message, "LINK UNAVAILABLE", order);
    }
    return `
      <div class="site-shell">
        ${header()}
        <main class="state-main wrap">
          <section class="state-card" aria-labelledby="download-title">
            <div class="state-icon" aria-hidden="true">${icon("pin")}</div>
            <div class="eyebrow"><span class="eyebrow-mark"></span> YOUR TEST GUIDE</div>
            <h1 id="download-title">Your walk starts here.</h1>
            <p class="state-copy">This is the downloadable preview PDF for the Puerto Plata Walking Guide. Replace it with the finished guide before accepting real orders.</p>
            <div class="info-panel">
              <div class="info-row"><span>Time remaining</span><strong id="countdown" data-expires="${Number(order.expiresAt)}">${formatRemaining(order.expiresAt - Date.now())}</strong></div>
              <div class="info-row"><span>Downloads left</span><strong>${remaining} of ${order.maxDownloads}</strong></div>
              <div class="info-row"><span>Test reference</span><strong>${escapeHtml(order.reference)}</strong></div>
            </div>
            <button class="button button-primary button-full" type="button" data-action="download" data-token="${escapeHtml(token)}">Download preview PDF <span aria-hidden="true">↓</span></button>
            <p class="state-footnote">This one-browser test link expires 24 hours after checkout and allows up to ${order.maxDownloads} downloads in total.</p>
          </section>
        </main>
        ${footer()}
      </div>`;
  }

  function statePage(title, message, eyebrow, order) {
    return `
      <div class="site-shell">
        ${header()}
        <main class="state-main wrap">
          <section class="state-card" aria-labelledby="state-title">
            <div class="eyebrow"><span class="eyebrow-mark"></span> ${escapeHtml(eyebrow)}</div>
            <h1 id="state-title">${escapeHtml(title)}</h1>
            <p class="state-copy">${escapeHtml(message)}</p>
            <div class="info-panel"><div class="info-row"><span>Test reference</span><strong>${escapeHtml(order.reference)}</strong></div><div class="info-row"><span>Downloads used</span><strong>${order.downloadsUsed} of ${order.maxDownloads}</strong></div></div>
            <button class="button button-primary button-full" type="button" data-action="home">Return to guide page</button>
          </section>
        </main>
        ${footer()}
      </div>`;
  }

  function unavailablePage(message) {
    return `
      <div class="site-shell">
        ${header()}
        <main class="state-main wrap">
          <section class="state-card" aria-labelledby="unavailable-title">
            <div class="eyebrow"><span class="eyebrow-mark"></span> DOWNLOAD LINK UNAVAILABLE</div>
            <h1 id="unavailable-title">Let’s make a fresh test link.</h1>
            <p class="state-copy">${escapeHtml(message)}</p>
            <button class="button button-primary button-full" type="button" data-action="home">Return to the guide page</button>
          </section>
        </main>
        ${footer()}
      </div>`;
  }

  function formatRemaining(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(remainder).padStart(2, "0")}s`;
  }

  function render() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    const params = new URLSearchParams(window.location.search);
    const downloadToken = params.get("download");
    const purchaseToken = params.get("success");
    if (downloadToken) app.innerHTML = downloadPage(downloadToken);
    else if (purchaseToken) app.innerHTML = confirmationPage(purchaseToken);
    else app.innerHTML = landingPage();

    const countdown = document.getElementById("countdown");
    if (countdown) {
      countdownTimer = window.setInterval(() => {
        const remaining = Number(countdown.dataset.expires) - Date.now();
        countdown.textContent = formatRemaining(remaining);
        if (remaining <= 0) render();
      }, 1000);
    }
  }

  function startTestPurchase() {
    try {
      const now = Date.now();
      const token = makeToken();
      const reference = "TEST-" + now.toString(36).toUpperCase();
      saveOrder({
        token,
        reference,
        createdAt: now,
        expiresAt: now + LINK_LIFETIME_MS,
        maxDownloads: DOWNLOAD_LIMIT,
        downloadsUsed: 0,
        testMode: true
      });
      setRoute("success", token, false);
    } catch (_) {
      app.innerHTML = unavailablePage("Browser storage is unavailable, so this preview cannot save a test download link. Try the page in a regular browser window with local storage enabled.");
    }
  }

  function downloadPreview(token) {
    const order = readOrder(token);
    if (!order) return render();
    if (Date.now() >= order.expiresAt || order.downloadsUsed >= order.maxDownloads) return render();
    order.downloadsUsed += 1;
    try { saveOrder(order); } catch (_) { return render(); }

    const link = document.createElement("a");
    link.href = "puerto-plata-guide-preview.pdf";
    link.download = "Puerto-Plata-Walking-Guide-Preview.pdf";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(render, 150);
  }

  async function copyLink(button) {
    const url = button.dataset.url;
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = "Copied";
      window.setTimeout(() => { if (button.isConnected) button.textContent = "Copy test link"; }, 1800);
    } catch (_) {
      const field = document.getElementById("unique-download-link");
      if (field) { field.focus(); field.select(); }
      button.textContent = "Select the link above to copy";
    }
  }

  function resetDemo() {
    try {
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
    } catch (_) { /* A blocked store will show an empty page after navigation. */ }
    setRoute(null, null, true);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "buy") dialog.showModal();
    if (action === "reset") resetDemo();
    if (action === "home") setRoute(null, null, false);
    if (action === "download") downloadPreview(button.dataset.token);
    if (action === "copy-link") copyLink(button);
  });

  document.getElementById("complete-test-purchase").addEventListener("click", () => {
    dialog.close();
    startTestPurchase();
  });
  dialog.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  window.addEventListener("popstate", render);
  render();
})();
