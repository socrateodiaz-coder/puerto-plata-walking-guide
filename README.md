# Puerto Plata on Foot

A mobile-first GitHub Pages prototype for a self-guided Puerto Plata walking tour for cruise passengers arriving at Taino Bay. It contains a sales page, a guide preview with a schematic map and sample stops, and a checkout status page.

## Project files

- index.html: site shell, viewport and page metadata.
- styles.css: mobile-first layout and responsive breakpoints.
- app.js: Home, preview, checkout, and payment-verification-required views.
- puerto-plata-guide-preview.pdf: local placeholder artifact. This file is intentionally not published or linked from the website.

The site uses query routes on the existing homepage. The main URL opens the sales page. The preview and checkout are available through the header and calls to action. Old test success/download query links no longer reveal a file.

## Preview locally

Open PowerShell in this folder and run:

    py -m http.server 8000 --bind 127.0.0.1

If the Python launcher is unavailable, use an installed Python command:

    python -m http.server 8000 --bind 127.0.0.1

Open http://localhost:8000 in a browser. Stop the local server with Ctrl+C.

## Current checkout status

Payments are not configured. The checkout page displays the placeholder price ($XX.00), but has no card form, simulated purchase button, payment processing, or downloadable guide. Thank-you/download routes show a payment-verification-required message and no file access.

The route and point-of-interest content, walking times, operating details, cover image, final PDF, and price are placeholders. Verify the full route, port exit, pedestrian access, opening hours, and return plan locally before selling the guide.

## GitHub Pages

The existing Pages configuration publishes the main branch from the repository root. It is preserved. The public Pages tree excludes the local placeholder PDF; do not add the finished guide or payment credentials to this public repository.

## Needed before accepting orders

Choose a payment provider. Then implement server-side checkout creation, provider test/live configuration stored as server secrets, signed webhook verification, persistent order records, and protected file delivery that checks a verified payment before issuing a time-limited link. Upload the finished PDF to private storage rather than a public Pages folder. Keep test and live credentials separate; never put secret keys in browser code.