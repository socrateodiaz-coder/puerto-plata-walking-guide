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

Choose the selling price and currency, then complete the backend/provider setup below. Upload the finished PDF to private storage rather than a public Pages folder. Keep credentials in Worker secrets; never put secret keys in browser code.

## Payment and secure-download preparation

The prepared backend is a Cloudflare Worker API, Cloudflare D1 order database, and private Supabase Storage bucket. GitHub Pages remains a static storefront and never receives payment secrets or guide files. The backend lives in `backend/` and is disabled by default (`PAYMENTS_ENABLED=false`). It only accepts test credentials and calls Stripe test APIs or PayPal's sandbox API; live credentials/endpoints are rejected. Cloudflare D1 has been created for testing; no Worker is deployed and no remote migration has been applied.

For a U.S. merchant, the integration uses Stripe Checkout for cards and a separate PayPal sandbox checkout for PayPal. Stripe's PayPal method is not offered to U.S.-based Stripe accounts, so a single Stripe integration cannot reliably cover both methods. PayPal may show card funding depending on account eligibility, but Stripe is the dedicated card path.

### Current implementation

- The existing mobile sales page and guide preview are preserved. Checkout only unlocks when the API reports a configured price, sandbox provider, signed webhook, and token-encryption key.
- The server reads the price from D1; the browser cannot supply it. Stripe webhook signatures and PayPal webhook signatures are verified by the Worker. Provider payment state, order ID, amount, and currency are checked.
- Unique provider event IDs and a guarded `pending` to `paid` transition make repeat payment notifications idempotent.
- Receipt secrets are hashed in D1. A verified order gets a random 256-bit download token; only its hash and AES-GCM encrypted copy are stored. Receipt access can recover the token only for the matching receipt holder.
- Every download checks paid status, revocation, expiry, the order limit, and private Supabase object availability server-side. Before reading object metadata or bytes, the Worker checks the bucket metadata and fails closed unless the configured bucket explicitly reports `public: false`. It streams the object from Supabase; the permanent storage URL and secret key are never returned to the browser. The atomic download count increments only when a valid private object is about to be served.
- Expiry/count defaults are 86,400 seconds and three successful file responses. Each order records its own limit and expiry; change `download_ttl_seconds` or `download_limit` before creating new test orders to configure them.
- Refund webhooks revoke access. The API rejects unpaid, invalid, revoked, expired, exhausted, and missing-file downloads with useful messages.
- `backend/private-assets/TEST_ONLY_NOT_THE_FINISHED_GUIDE.pdf` is local-only and ignored by Git. It is prominently marked and must never be sold or sent as the final guide. No PDF has been uploaded. If a test upload is later approved, it must go only into the private Supabase test bucket.
- Email delivery is not configured. A sender/domain and email-service binding must be selected and connected before order emails can be sent.

### Recommended accounts and settings

1. Cloudflare account with Workers and the existing D1 test database. R2 is not used. Keep any later Worker deployment in test mode.
2. A Supabase Free project and a private Storage bucket named `puerto-plata-guide-private-test`. The project and bucket are not connected yet. Supabase Free currently has storage and bandwidth quotas, and inactive free projects may pause; check the current plan limits before relying on it for production.
3. Stripe account with test mode access, a `sk_test_` secret, and a signing secret for `/api/webhooks/stripe`.
4. PayPal developer/business account with sandbox REST app credentials and a sandbox webhook ID for `/api/webhooks/paypal`.
5. A selling price and ISO currency you choose. They are intentionally blank. Store the amount in minor units (for example, cents for USD) and the currency as lowercase text.
6. A generated 32-byte token-encryption key as a Worker secret. Generate separate values for each environment and keep a secure backup; changing a key prevents decrypting already-issued token values.
7. The Worker URL in `checkout-config.js` and the exact storefront origin in `ALLOWED_ORIGINS`. This URL is public API configuration, not a secret.
8. The finished guide PDF in private Supabase Storage, referenced in D1 with `artifact_kind='final'`. No PDF belongs in the public Pages root.

Payment processing is not live. No API accounts, credentials, price, or Worker deployment are included here. Do not set `PAYMENTS_ENABLED=true` until sandbox setup and webhook delivery are tested. Even then, this Worker supports test mode only.

### Supabase Free test storage setup

The Worker adapter is prepared, but no Supabase project, bucket, URL, or secret key is connected. To prepare the free test storage in the Supabase dashboard:

1. Sign in to Supabase and select an existing Free project or create one on the Free plan. Stop if the dashboard requests a payment method, paid plan, or billing approval.
2. Open **Storage** and create a bucket named `puerto-plata-guide-private-test`. Set it to **Private**; never enable public access. The Worker verifies this setting before each object metadata or download request and fails closed if it cannot confirm the bucket is private.
3. In **Project Settings → API Keys**, obtain the project URL and a new `sb_secret_...` key for server-side use. Do not paste the key into ChatGPT, browser code, GitHub, or `wrangler.toml`.
4. For local testing, put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` into the ignored `backend/.dev.vars` file. The committed `.dev.vars.example` contains placeholders only. The bucket name is a non-secret Worker variable in `wrangler.toml`.
5. For a later Cloudflare test deployment, add the URL as a Worker variable and the `sb_secret_...` value as a Worker secret through the Cloudflare dashboard. Do not deploy as part of initial setup.

The Supabase secret key bypasses Storage access policies, so keep it only in a trusted Worker/local server environment. The Worker requests files through the private authenticated Storage endpoint and streams bytes to a buyer only after checking the D1 token, expiry, revocation, and download count. It does not mint signed or public URLs. A Supabase dashboard owner could still change the bucket to public outside the Worker; the Worker will stop serving it on the next request, so leave the bucket private in the dashboard at all times.

Cloudflare D1 test database `puerto-plata-guide-test` is already created and its ID is in `backend/wrangler.toml`. Its initial schema has **not** been applied remotely. Run the migration only after separately authorizing that step:

```powershell
npx wrangler d1 migrations apply puerto-plata-guide-test --remote
```

Set the price only after you decide it. Replace both bracketed placeholders before running this SQL; no default amount is assumed:

```sql
UPDATE product_config
SET price_minor = <minor-units>, currency = '<currency>', updated_at = unixepoch()
WHERE id = 'pp-walking-guide-v1';
```

If and when you separately approve uploading a test file, use the Supabase dashboard or Storage API to place the local test-only file in the private bucket, then mark it as a placeholder in D1. Do not upload it to GitHub Pages or make the bucket public.

```sql
UPDATE product_config
SET final_pdf_key = 'TEST_ONLY_NOT_THE_FINISHED_GUIDE.pdf', artifact_kind = 'test-placeholder', updated_at = unixepoch()
WHERE id = 'pp-walking-guide-v1';
```

Enter sandbox keys using `npx wrangler secret put STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `TOKEN_ENCRYPTION_KEY`. Do not put values in GitHub, `checkout-config.js`, or committed Wrangler config. For local work, copy `.dev.vars.example` to `.dev.vars`; Git ignores the private copy. Configure Stripe test and PayPal sandbox webhook URLs at their providers, then set `PAYMENTS_ENABLED=true` only in the test Worker environment. If testing from the local static preview, set its local site origin/CORS allowlist in the local `.dev.vars` file.

After the sandbox settings are ready, deploy the test Worker to its `workers.dev` URL. Put that URL in `window.PUERTO_PLATA_CHECKOUT.apiBase` in `checkout-config.js`, then use the existing GitHub Pages site or a local static server. The frontend file contains only the public API address. Production deployment is not part of this prototype.

### Test checklist before launch

- Complete a Stripe card sandbox payment and a PayPal sandbox payment. Confirm provider dashboard and D1 show one paid order at the configured amount/currency.
- Attempt a failed provider payment and cancel checkout. The order must not become paid, and receipt/download routes must withhold access.
- POST a webhook without a signature and another with an invalid signature; both must be rejected.
- Resend the exact same valid webhook event. It must not create a second order, token, or entitlement.
- Download the private test placeholder; confirm the Worker streams the PDF and no Supabase URL or secret key appears in the response.
- Temporarily set `download_ttl_seconds=60` for new test purchases. After 60 seconds, confirm the API rejects the link with an expiry message; restore 86,400 afterward.
- Download three times successfully, then try a fourth time. The server must reject it and D1 must show a count of 3.
- Set a test order's `revoked_at=unixepoch()` and confirm its download token is refused.
- Set the product artifact to `missing` and clear its key. Confirm payment status can be shown while download access reports that the file is not ready.
- Exercise checkout, provider return/cancel, thank-you, and expired-link screens on phone and desktop widths. Check links, network requests, and browser console.
- Before launch, repeat the matrix with the finished PDF stored privately and `artifact_kind='final'`.

Use a separate test database and bucket for these checks. Do not log receipt/download tokens or provider secrets. Connected sandbox payments and webhooks cannot be exercised until you connect the accounts and configure the settings above.

### Local unit checks

Node's built-in test runner covers amount conversion, Stripe signature and live-mode rejection, disabled checkout, private bucket verification and authenticated file access, missing files, the download limit, expired links, revoked access, and unsafe object paths:

```powershell
npm test
```

These checks do not replace the provider sandbox/webhook checklist.

