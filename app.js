(function () {
  "use strict";

  const app = document.getElementById("app");

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function pageHref(page) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    if (page && page !== "home") url.searchParams.set("page", page);
    return url.pathname + url.search;
  }

  function moneyPlaceholder() {
    return "$XX.00";
  }

  function header(active) {
    function link(page, label, className) {
      const classes = "nav-link" + (className ? " " + className : "");
      const current = active === page ? " aria-current='page'" : "";
      return "<a class='" + classes + "' href='" + escapeHtml(pageHref(page)) + "'" + current + ">" + label + "</a>";
    }
    return [
      "<header class='topbar wrap'>",
      "<a class='brand' href='" + escapeHtml(pageHref("home")) + "' aria-label='Puerto Plata on Foot home'>",
      "<span class='brand-mark' aria-hidden='true'>P<span class='brand-mark-dot'>.</span></span>",
      "<span class='brand-name'>PUERTO PLATA ON FOOT<span class='brand-note'>Taino Bay walking guide</span></span></a>",
      "<nav class='primary-nav' aria-label='Main navigation'>",
      link("home", "Home"),
      link("preview", "Guide preview"),
      link("checkout", "Get your guide", "nav-cta"),
      "</nav></header>"
    ].join("");
  }

  function footer() {
    return [
      "<footer class='footer'><div class='footer-inner wrap'>",
      "<p class='footer-copy'>Puerto Plata on Foot <span aria-hidden='true'>·</span> Preview build. Guide copy, route details, cover art, and price are placeholders.</p>",
      "<p class='footer-status'>Payments are not live. Checkout can run in test mode only after the sandbox backend is configured.</p>",
      "<nav class='footer-nav' aria-label='Footer navigation'><a href='" + escapeHtml(pageHref("home")) + "'>Home</a><a href='" + escapeHtml(pageHref("preview")) + "'>Guide preview</a></nav>",
      "</div></footer>"
    ].join("");
  }

  function pageShell(active, content) {
    return "<div class='site-shell'>" + header(active) + "<main>" + content + "</main>" + footer() + "</div>";
  }

  function coverArt() {
    return [
      "<div class='cover-art' role='img' aria-label='Placeholder illustration of Puerto Plata coast and historic city'>",
      "<svg viewBox='0 0 700 560' preserveAspectRatio='xMidYMid slice' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>",
      "<defs><linearGradient id='cover-sky' x1='0' y1='0' x2='0' y2='1'><stop stop-color='#bddfd8'/><stop offset='1' stop-color='#e7eee0'/></linearGradient>",
      "<linearGradient id='cover-water' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#49a9a8'/><stop offset='1' stop-color='#177c83'/></linearGradient>",
      "<linearGradient id='cover-hill' x1='0' y1='0' x2='0' y2='1'><stop stop-color='#78a994'/><stop offset='1' stop-color='#4c8178'/></linearGradient></defs>",
      "<rect width='700' height='560' fill='url(#cover-sky)'/><circle cx='549' cy='97' r='40' fill='#f3c998' opacity='.9'/>",
      "<path d='M0 242 91 178l52 28 83-87 77 51 74-89 86 86 55-26 113 100v139H0Z' fill='url(#cover-hill)'/>",
      "<path d='m330 215 85-134 89 121 56-25 62 56v96H280Z' fill='#628f80' opacity='.65'/>",
      "<path d='M0 330c93-27 173-16 264 1 132 25 278 7 436-16v245H0Z' fill='url(#cover-water)'/>",
      "<path d='M0 365c121-24 205 14 329 18 145 4 239-28 371-26M0 432c137-29 216 12 330 12 143 0 243-36 370-22' fill='none' stroke='#bee2d8' stroke-width='4' opacity='.48'/>",
      "<path d='M56 315h115v-64H56Z' fill='#e3a477'/><path d='M43 256h141l-70-46Z' fill='#bd7354'/>",
      "<path d='M183 316h113V232H183Z' fill='#f0d8aa'/><path d='m168 238 72-52 73 52Z' fill='#b85e4f'/>",
      "<path d='M291 315h127V204H291Z' fill='#f4e6c6'/><path d='M275 212h159l-80-57Z' fill='#d47d62'/>",
      "<path d='M422 316h118V239H422Z' fill='#e5c99e'/><path d='m410 245 71-46 70 46Z' fill='#b9785b'/>",
      "<path d='M598 326c-11-53-5-94 5-135M604 230c-21-33-41-42-60-47 6 24 24 42 60 47Zm-1 19c15-37 31-52 53-61-2 25-17 45-53 61Z' fill='none' stroke='#34786d' stroke-width='10' stroke-linecap='round'/>",
      "</svg><span class='cover-label'>Cover image placeholder</span><span class='art-caption'>Concept illustration · replace with final cover</span></div>"
    ].join("");
  }

  function icon(name) {
    const paths = {
      pace: "<circle cx='12' cy='12' r='8.5'/><path d='M12 7v5l3.5 2'/>",
      map: "<path d='m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z'/><path d='M9 3v15m6-12v15'/>",
      port: "<path d='M3 13h18l-2 6H5l-2-6Zm9-9v9m-4-5 4-4 4 4'/><path d='M5 22c2-1.5 4-1.5 6 0 2-1.5 4-1.5 6 0'/>"
    };
    return "<svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + paths[name] + "</svg>";
  }

  function landingPage() {
    return pageShell("home", [
      "<section class='hero wrap'><div class='hero-grid'><div class='hero-copy'>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> A SELF-GUIDED TAINO BAY WALK</p>",
      "<h1>Discover Puerto Plata<br><em>at your own pace.</em></h1>",
      "<p class='hero-description'>A premium, self-guided walking tour for cruise passengers arriving at Taino Bay in Puerto Plata, Dominican Republic. Explore the historic center on foot, follow a flexible route, and make your time ashore your own.</p>",
      "<ul class='feature-chips' aria-label='Guide features'><li>Start from Taino Bay</li><li>Explore independently</li><li>Made for port days</li></ul>",
      "<div class='hero-actions'><a class='button button-primary' href='" + escapeHtml(pageHref("checkout")) + "'>Get Your Walking Guide <span aria-hidden='true'>→</span></a>",
      "<a class='button button-secondary' href='" + escapeHtml(pageHref("preview")) + "'>Preview the Guide</a></div>",
      "<p class='price-line'><strong data-product-price>" + moneyPlaceholder() + "</strong> <span>one-time digital guide</span></p>",
      "</div>" + coverArt() + "</div></section>",
      "<section class='benefits-section'><div class='wrap'><div class='section-heading'>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> YOUR DAY, YOUR WAY</p><h2>See more of the city at your own pace.</h2>",
      "<p>A thoughtful route helps you spend less time figuring out where to go and more time enjoying your port day.</p></div>",
      "<div class='benefit-grid'>",
      "<article class='benefit-card'><span class='benefit-icon'>" + icon("pace") + "</span><h3>Choose your own pace</h3><p>Pause for photos, a café, or a closer look whenever you like.</p></article>",
      "<article class='benefit-card'><span class='benefit-icon'>" + icon("map") + "</span><h3>Know what’s nearby</h3><p>Use a simple route preview and clear directions to explore independently.</p></article>",
      "<article class='benefit-card'><span class='benefit-icon'>" + icon("port") + "</span><h3>Make port time count</h3><p>Plan around your ship’s schedule and choose the stops that suit your day.</p></article>",
      "</div></div></section>",
      "<section class='stops-section wrap'><div class='section-heading section-heading-row'><div>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> A TASTE OF THE ROUTE</p><h2>Places to discover in Puerto Plata.</h2></div>",
      "<a class='text-link' href='" + escapeHtml(pageHref("preview")) + "'>See the guide preview <span aria-hidden='true'>→</span></a></div>",
      "<div class='spot-grid'>",
      "<article class='spot-card'><span class='spot-number'>01</span><h3>Historic center</h3><p>Colorful architecture, local streets, and a feel for the city’s everyday rhythm.</p></article>",
      "<article class='spot-card'><span class='spot-number'>02</span><h3>Umbrella Street</h3><p>A cheerful pedestrian street beneath a canopy of bright umbrellas.</p></article>",
      "<article class='spot-card'><span class='spot-number'>03</span><h3>Paseo de Doña Blanca</h3><p>A distinctive pink lane and a memorable photo stop in the city center.</p></article>",
      "<article class='spot-card'><span class='spot-number'>04</span><h3>Fortaleza San Felipe &amp; the Malecón</h3><p>A historic seaside fort and an oceanfront promenade to round out a city walk.</p></article>",
      "</div><p class='content-note'>These are sample places for the preview. The final route, street-by-street directions, operating details, and walking times still need verification.</p></section>",
      "<section class='closing-cta'><div class='wrap closing-cta-inner'><div>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> READY TO EXPLORE?</p><h2>Make Puerto Plata yours for the day.</h2><p>Review the sample route, then see the purchase details.</p></div>",
      "<div class='cta-actions'><a class='button button-light' href='" + escapeHtml(pageHref("checkout")) + "'>Get Your Walking Guide <span aria-hidden='true'>→</span></a>",
      "<a class='cta-text-link' href='" + escapeHtml(pageHref("preview")) + "'>Preview the Guide</a></div></div></section>"
    ].join(""));
  }

  function previewPage() {
    return pageShell("preview", [
      "<section class='page-intro wrap'><p class='eyebrow'><span class='eyebrow-mark'></span> GUIDE PREVIEW</p>",
      "<h1>A first look at the walk.</h1><p>Explore a sample route sequence, map concept, and points of interest. This preview shows the planned style of the guide; final directions and map details still need a local check.</p>",
      "<div class='page-actions'><a class='button button-primary' href='" + escapeHtml(pageHref("checkout")) + "'>Continue to checkout <span aria-hidden='true'>→</span></a>",
      "<a class='text-link' href='" + escapeHtml(pageHref("home")) + "'>Back to home</a></div></section>",
      "<section class='preview-layout wrap'><article class='map-card'><div class='map-card-heading'><div>",
      "<p class='eyebrow'>SAMPLE MAP</p><h2>A simple route at a glance</h2></div><span class='map-tag'>Concept · not to scale</span></div>",
      "<div class='route-map' role='img' aria-label='Concept map showing Taino Bay, the historic center, Umbrella Street, the Malecón, and Fortaleza San Felipe in an illustrative sequence'>",
      "<svg viewBox='0 0 640 390' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>",
      "<rect width='640' height='390' rx='16' fill='#eaf1e9'/><path d='M0 0h640v111c-76 22-137 13-212 32-98 24-163 4-254 30C106 196 60 191 0 211V0Z' fill='#dbece7'/>",
      "<path d='M0 244c100-28 182 7 274-17 107-27 212-7 366-46v209H0V244Z' fill='#cde5df'/><path d='M426 0h214v390H452c-13-69 18-103 0-169-13-48-44-111-26-221Z' fill='#88c7c5'/>",
      "<path d='M40 250 155 208l120 30 91-62 87 50 73-34' fill='none' stroke='#fffefa' stroke-width='18' stroke-linecap='round' stroke-linejoin='round'/>",
      "<path d='M40 250 155 208l120 30 91-62 87 50 73-34' fill='none' stroke='#087e83' stroke-width='5' stroke-dasharray='2 13' stroke-linecap='round' stroke-linejoin='round'/>",
      "<g fill='#163944' font-family='Arial, sans-serif' font-size='14' font-weight='700'>",
      "<circle cx='40' cy='250' r='17' fill='#087e83'/><text x='35' y='255' fill='white'>1</text><circle cx='155' cy='208' r='17' fill='#087e83'/><text x='150' y='213' fill='white'>2</text>",
      "<circle cx='275' cy='238' r='17' fill='#087e83'/><text x='270' y='243' fill='white'>3</text><circle cx='366' cy='176' r='17' fill='#087e83'/><text x='361' y='181' fill='white'>4</text>",
      "<circle cx='453' cy='226' r='17' fill='#087e83'/><text x='448' y='231' fill='white'>5</text></g>",
      "<g fill='#163944' font-family='Arial, sans-serif' font-size='12' font-weight='700'><text x='20' y='293'>TAINO BAY</text><text x='101' y='177'>HISTORIC CENTER</text>",
      "<text x='226' y='278'>UMBRELLA STREET</text><text x='330' y='139'>MALECÓN</text><text x='468' y='266'>FORT SAN FELIPE</text></g>",
      "<path d='M64 301h95m148 25h85' stroke='#a9c8c0' stroke-width='3' stroke-linecap='round'/></svg></div>",
      "<div class='map-legend'><span><i class='legend-dot'></i> Sample stop</span><span><i class='legend-line'></i> Illustrative route</span></div>",
      "<p class='content-note'>Schematic only. It is not a navigational map. Confirm the final path, port exit, distances, and pedestrian access before using the finished guide.</p></article>",
      "<article class='route-card'><p class='eyebrow'><span class='eyebrow-mark'></span> SAMPLE DIRECTION SEQUENCE</p><h2>From the port toward the city.</h2>",
      "<ol class='route-list'>",
      "<li><span class='route-number'>1</span><div><h3>Begin at Taino Bay</h3><p>Start at the port entrance and orient yourself before setting out.</p></div></li>",
      "<li><span class='route-number'>2</span><div><h3>Explore the historic center</h3><p>Head toward Independence Square and the Cathedral of St. Philip the Apostle.</p></div></li>",
      "<li><span class='route-number'>3</span><div><h3>Visit the colorful lanes</h3><p>Continue through the center to Umbrella Street and Paseo de Doña Blanca.</p></div></li>",
      "<li><span class='route-number'>4</span><div><h3>Finish by the waterfront</h3><p>Make your way toward the Malecón and Fortaleza San Felipe, then plan your return to port.</p></div></li>",
      "</ol><p class='route-disclaimer'>Sample order only. Turn-by-turn directions, walking times, accessibility, and port return guidance must be checked before publication.</p></article></section>",
      "<section class='wrap preview-stops'><div class='section-heading'><p class='eyebrow'><span class='eyebrow-mark'></span> SAMPLE POINTS OF INTEREST</p><h2>Small details make a memorable walk.</h2></div>",
      "<div class='preview-stop-grid'><article><h3>Independence Square</h3><p>A central plaza and a natural orientation point for exploring downtown.</p></article>",
      "<article><h3>Umbrella Street</h3><p>A pedestrian street known for its colorful overhead umbrella display.</p></article>",
      "<article><h3>Paseo de Doña Blanca</h3><p>A bright pink lane that brings a little color to a city-center stroll.</p></article>",
      "<article><h3>Fortaleza San Felipe</h3><p>A 16th-century fort and museum overlooking Puerto Plata’s coast.</p></article></div>",
      "<p class='content-note'>Place descriptions are preview copy. Verify opening hours, entry requirements, and current access before the guide is sold.</p>",
      "<div class='preview-bottom-cta'><a class='button button-primary' href='" + escapeHtml(pageHref("checkout")) + "'>Get Your Walking Guide <span aria-hidden='true'>→</span></a>",
      "<a class='text-link' href='" + escapeHtml(pageHref("home")) + "'>Return to the sales page</a></div></section>"
    ].join(""));
  }

  function checkoutPage() {
    return pageShell("checkout", [
      "<section class='checkout-layout wrap'><div class='checkout-copy'><p class='eyebrow'><span class='eyebrow-mark'></span> PURCHASE / CHECKOUT</p>",
      "<h1>Your guide is almost ready.</h1><p class='hero-description'>Review the purchase details. Checkout remains closed until a test backend and provider sandbox are deliberately configured.</p>",
      "<a class='text-link' href='" + escapeHtml(pageHref("home")) + "'>← Return to the sales page</a></div>",
      "<section class='checkout-card' aria-labelledby='checkout-title'><div class='checkout-card-heading'><div><p class='eyebrow'>DIGITAL WALKING GUIDE</p>",
      "<h2 id='checkout-title'>Puerto Plata on Foot</h2></div><span class='format-pill'>PDF · planned</span></div>",
      "<div class='checkout-price'><span>One-time digital guide</span><strong data-product-price>" + moneyPlaceholder() + "</strong></div>",
      "<div class='checkout-status' id='checkout-status' role='status' aria-live='polite'><strong>Test checkout is not configured</strong><p>No payments are accepted until a test backend and provider sandbox are deliberately connected.</p></div>",
      "<div class='provider-options' id='provider-options' hidden><p class='test-mode-note'>TEST MODE · provider sandbox only · no live charges</p>",
      "<button class='button button-primary button-full' id='stripe-checkout-button' type='button' hidden>Pay by card (test)</button>",
      "<div class='paypal-button-wrap' id='paypal-button-container' hidden></div></div>",
      "<p class='checkout-footnote'>The finished PDF is not yet loaded. A clearly marked test placeholder may be used for validation, never as the finished guide.</p>",
      "<div class='checkout-links'><a href='" + escapeHtml(pageHref("preview")) + "'>Review the guide preview</a><a href='" + escapeHtml(pageHref("home")) + "'>Back to home</a></div>",
      "</section></section>"
    ].join(""));
  }

  function paymentGatePage() {
    return pageShell("", [
      "<section class='state-main wrap'><article class='state-card'><p class='eyebrow'><span class='eyebrow-mark'></span> PAYMENT VERIFICATION REQUIRED</p>",
      "<h1>Download access isn’t available yet.</h1>",
      "<p class='state-copy'>This preview has no connected payment provider or server-side order verification. No payment can be confirmed here, so the finished guide is not available for download.</p>",
      "<div class='state-actions'><a class='button button-primary button-full' href='" + escapeHtml(pageHref("home")) + "'>Return to the sales page</a>",
      "<a class='button button-secondary button-full' href='" + escapeHtml(pageHref("checkout")) + "'>View checkout status</a></div></article></section>"
    ].join(""));
  }

  function thankYouPage() {
    return pageShell("", [
      "<section class='state-main wrap'><article class='state-card' id='receipt-card'>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> TEST PURCHASE</p>",
      "<h1 id='receipt-title'>Verifying your purchase…</h1>",
      "<p class='state-copy' id='receipt-message' role='status' aria-live='polite'>The payment provider must confirm the test payment before download access is shown.</p>",
      "<div id='receipt-actions' class='state-actions' hidden></div>",
      "<div class='state-actions' id='receipt-fallback'><a class='button button-secondary button-full' href='" + escapeHtml(pageHref("home")) + "'>Return to the sales page</a></div>",
      "</article></section>"
    ].join(""));
  }

  function downloadPage() {
    return pageShell("", [
      "<section class='state-main wrap'><article class='state-card'>",
      "<p class='eyebrow'><span class='eyebrow-mark'></span> SECURE GUIDE DOWNLOAD</p>",
      "<h1 id='download-title'>Checking download access…</h1>",
      "<p class='state-copy' id='download-message' role='status' aria-live='polite'>Access is checked by the payment backend each time you download.</p>",
      "<button class='button button-primary button-full' id='download-guide-button' type='button' hidden>Download the guide</button>",
      "<p class='content-note' id='download-limit-note' hidden></p>",
      "<div class='state-actions'><a class='button button-secondary button-full' href='" + escapeHtml(pageHref("home")) + "'>Return to the sales page</a></div>",
      "</article></section>"
    ].join(""));
  }

  function render() {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    const legacyDownloadRoute = params.has("download") || params.has("success");
    if (legacyDownloadRoute) window.history.replaceState({}, "", pageHref("home"));

    if (page === "thanks") {
      app.innerHTML = thankYouPage();
      document.title = "Test purchase confirmation | Puerto Plata on Foot";
    } else if (page === "download") {
      app.innerHTML = downloadPage();
      document.title = "Secure guide download | Puerto Plata on Foot";
    } else if (legacyDownloadRoute) {
      app.innerHTML = paymentGatePage();
      document.title = "Payment verification required | Puerto Plata on Foot";
    } else if (page === "preview") {
      app.innerHTML = previewPage();
      document.title = "Guide preview | Puerto Plata on Foot";
    } else if (page === "checkout") {
      app.innerHTML = checkoutPage();
      document.title = "Checkout status | Puerto Plata on Foot";
    } else {
      app.innerHTML = landingPage();
      document.title = "Puerto Plata on Foot | Taino Bay Walking Guide";
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  window.addEventListener("popstate", render);
  render();
})();
