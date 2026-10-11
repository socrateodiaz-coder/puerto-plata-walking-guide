const PRODUCT_ID = "pp-walking-guide-v1";
const encoder = new TextEncoder();
const MAX_JSON_BYTES = 32_768;
const WEBHOOK_MAX_BYTES = 1_048_576;
const STRIPE_API = "https://api.stripe.com/v1";
const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";

const CURRENCY_SCALE_0 = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const CURRENCY_SCALE_3 = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/webhooks/stripe" && request.method === "POST") {
        return await stripeWebhook(request, env);
      }
      if (url.pathname === "/api/webhooks/paypal" && request.method === "POST") {
        return await paypalWebhook(request, env);
      }
      return await handleApiRequest(request, env, url);
    } catch (error) {
      if (error instanceof ApiInputError) return json({ error: error.code, message: error.message }, error.status);
      console.error("API request failed", error instanceof Error ? error.message : "unknown error");
      return json({ error: "server_error", message: "The request could not be completed. Please try again." }, 500);
    }
  }
};

export function currencyScale(currency) {
  const normalized = String(currency || "").toLowerCase();
  if (CURRENCY_SCALE_0.has(normalized)) return 0;
  if (CURRENCY_SCALE_3.has(normalized)) return 3;
  return 2;
}

export function amountToDecimal(minor, currency) {
  if (!Number.isSafeInteger(minor) || minor < 1) throw new Error("invalid_amount");
  const scale = currencyScale(currency);
  return (minor / (10 ** scale)).toFixed(scale);
}

export function evaluateDownloadAccess(order, nowSeconds, product, appEnv = "test") {
  if (!order) return { allowed: false, reason: "invalid" };
  if (order.revoked_at != null) return { allowed: false, reason: "revoked" };
  if (order.status !== "paid") return { allowed: false, reason: "unpaid" };
  if (!Number.isInteger(order.download_expires_at) || order.download_expires_at <= nowSeconds) {
    return { allowed: false, reason: "expired" };
  }
  if (order.download_count >= order.download_limit) return { allowed: false, reason: "exhausted" };
  if (!product?.final_pdf_key || product.artifact_kind === "missing") {
    return { allowed: false, reason: "missing_file" };
  }
  if (product.artifact_kind === "test-placeholder" && appEnv !== "test") {
    return { allowed: false, reason: "placeholder_prohibited" };
  }
  return { allowed: true, reason: "ok" };
}

export function mayTransitionToPaid(currentStatus) {
  return currentStatus === "pending";
}

export async function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!rawBody || !header || !secret) return false;
  const pieces = header.split(",").map((part) => part.split("=", 2));
  const timestamp = pieces.find(([key]) => key === "t")?.[1];
  const signatures = pieces.filter(([key]) => key === "v1").map(([, value]) => value);
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > 300 || signatures.length === 0) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = bytesToHex(new Uint8Array(digest));
  return signatures.some((signature) => constantTimeEqual(signature.toLowerCase(), expected));
}

export function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function handleApiRequest(request, env, url) {
  const origin = request.headers.get("Origin");
  const allowed = originAllowed(origin, env);
  if (request.method === "OPTIONS") {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!allowed && origin) return json({ error: "origin_not_allowed" }, 403);
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const path = url.pathname;
  let response;
  if (path === "/api/config" && request.method === "GET") response = await publicConfig(env);
  else if (path === "/api/stripe/checkout" && request.method === "POST") response = await stripeCheckout(request, env);
  else if (path === "/api/paypal/orders" && request.method === "POST") response = await paypalCreateOrder(request, env);
  else if (path === "/api/paypal/capture" && request.method === "POST") response = await paypalCapture(request, env);
  else if (path === "/api/orders/receipt" && request.method === "POST") response = await receiptStatus(request, env);
  else if (path === "/api/download" && request.method === "POST") response = await downloadGuide(request, env);
  else response = json({ error: "not_found" }, 404);

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function publicConfig(env) {
  const product = await getProduct(env);
  const priceConfigured = Boolean(product && Number.isSafeInteger(product.price_minor) && product.price_minor > 0 && /^[a-z]{3}$/i.test(product.currency || ""));
  const keyReady = await encryptionKeyReady(env);
  const commonReady = env.APP_ENV === "test" && env.PAYMENTS_ENABLED === "true" && priceConfigured && keyReady;
  const stripeEnabled = Boolean(commonReady && env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"));
  const paypalEnabled = Boolean(commonReady && env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID && paypalApiBase(env) === PAYPAL_SANDBOX_API);
  let filePresent = false;
  if (product?.final_pdf_key && env.GUIDE_FILES) {
    try { filePresent = Boolean(await env.GUIDE_FILES.head(product.final_pdf_key)); } catch { filePresent = false; }
  }
  return json({
    product: product ? { id: product.id, name: product.name } : { id: PRODUCT_ID, name: "Puerto Plata on Foot" },
    mode: "test",
    priceConfigured,
    price: priceConfigured ? amountToDecimal(product.price_minor, product.currency) : null,
    currency: priceConfigured ? product.currency.toUpperCase() : null,
    stripeCardsEnabled: stripeEnabled,
    paypalEnabled,
    paypalClientId: paypalEnabled ? env.PAYPAL_CLIENT_ID : null,
    checkoutEnabled: stripeEnabled || paypalEnabled,
    artifact: {
      kind: product?.artifact_kind || "missing",
      ready: filePresent && product?.artifact_kind !== "missing",
      testOnly: product?.artifact_kind === "test-placeholder"
    },
    downloadPolicy: {
      expirationSeconds: product?.download_ttl_seconds ?? 86400,
      limit: product?.download_limit ?? 3
    }
  });
}

async function stripeCheckout(request, env) {
  const body = await readJson(request);
  const readiness = await checkoutReadiness(env, "stripe");
  if (!readiness.ok) return readiness.response;
  const orderResult = await getOrCreateOrder(env, "stripe", body, readiness.product);
  if (orderResult.response) return orderResult.response;
  const { order } = orderResult;
  if (order.status === "paid") return json({ error: "already_paid" }, 409);
  if (order.provider_checkout_url) return json({ checkoutUrl: order.provider_checkout_url });

  const site = siteOrigin(env);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${site}/?page=thanks#${body.receiptToken}`);
  form.set("cancel_url", `${site}/?page=checkout&status=cancelled`);
  form.set("client_reference_id", order.id);
  form.set("metadata[order_id]", order.id);
  form.set("payment_method_types[0]", "card");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", order.currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(order.amount_minor));
  form.set("line_items[0][price_data][product_data][name]", readiness.product.name);
  let providerResponse;
  try {
    providerResponse = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `pp-guide-${order.id}`
      },
      body: form
    });
  } catch {
    return json({ error: "provider_unavailable", message: "Test checkout is temporarily unavailable." }, 502);
  }
  const session = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok || typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) {
    return json({ error: "provider_unavailable", message: "Test checkout could not be started." }, 502);
  }
  await env.DB.prepare("UPDATE orders SET provider_checkout_id = ?, provider_checkout_url = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(session.id, session.url, nowSeconds(), order.id).run();
  return json({ checkoutUrl: session.url });
}

async function paypalCreateOrder(request, env) {
  const body = await readJson(request);
  const readiness = await checkoutReadiness(env, "paypal");
  if (!readiness.ok) return readiness.response;
  const orderResult = await getOrCreateOrder(env, "paypal", body, readiness.product);
  if (orderResult.response) return orderResult.response;
  const { order } = orderResult;
  if (order.status === "paid") return json({ error: "already_paid" }, 409);
  if (order.provider_checkout_id) return json({ orderId: order.provider_checkout_id });

  const token = await paypalAccessToken(env);
  if (!token) return json({ error: "provider_unavailable", message: "PayPal sandbox is temporarily unavailable." }, 502);
  const site = siteOrigin(env);
  const providerResponse = await fetch(`${PAYPAL_SANDBOX_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `pp-guide-${order.id}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: order.id,
        custom_id: order.id,
        invoice_id: `PP-${order.id}`,
        description: readiness.product.name,
        amount: { currency_code: order.currency.toUpperCase(), value: amountToDecimal(order.amount_minor, order.currency) }
      }],
      application_context: { brand_name: "Puerto Plata on Foot", user_action: "PAY_NOW", return_url: `${site}/?page=thanks#${body.receiptToken}`, cancel_url: `${site}/?page=checkout&status=cancelled` }
    })
  }).catch(() => null);
  const paypalOrder = await providerResponse?.json().catch(() => ({}));
  if (!providerResponse?.ok || typeof paypalOrder.id !== "string") {
    return json({ error: "provider_unavailable", message: "PayPal sandbox could not start checkout." }, 502);
  }
  await env.DB.prepare("UPDATE orders SET provider_checkout_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(paypalOrder.id, nowSeconds(), order.id).run();
  return json({ orderId: paypalOrder.id });
}

async function paypalCapture(request, env) {
  const body = await readJson(request);
  const readiness = await checkoutReadiness(env, "paypal");
  if (!readiness.ok) return readiness.response;
  if (!isProviderId(body.orderId) || !isToken(body.receiptToken)) return json({ error: "invalid_request" }, 400);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE provider = 'paypal' AND provider_checkout_id = ?").bind(body.orderId).first();
  if (!order || !constantTimeEqual(await sha256Hex(body.receiptToken), order.receipt_token_hash)) return json({ error: "invalid_order" }, 404);
  if (order.status === "paid") return json({ paid: true });
  if (order.status !== "pending") return json({ error: "order_not_payable" }, 409);

  const token = await paypalAccessToken(env);
  if (!token) return json({ error: "provider_unavailable" }, 502);
  const captureResponse = await fetch(`${PAYPAL_SANDBOX_API}/v2/checkout/orders/${encodeURIComponent(body.orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `pp-capture-${order.id}` },
    body: "{}"
  }).catch(() => null);
  const captured = await captureResponse?.json().catch(() => ({}));
  if (!captureResponse?.ok || captured.status !== "COMPLETED") return json({ error: "payment_not_completed", message: "PayPal did not confirm a completed test payment." }, 402);
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  const unit = captured.purchase_units?.[0];
  if (unit?.custom_id !== order.id || capture?.status !== "COMPLETED" || !matchesProviderAmount(capture?.amount, order)) {
    return json({ error: "payment_not_verified" }, 400);
  }
  await grantPaidOrder(env, {
    provider: "paypal",
    eventId: `capture:${capture.id}`,
    orderId: order.id,
    paymentId: capture.id,
    product: readiness.product
  });
  return json({ paid: true });
}

async function stripeWebhook(request, env) {
  if (env.APP_ENV !== "test" || !env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) return json({ error: "webhook_not_configured" }, 503);
  const raw = await readTextLimited(request, WEBHOOK_MAX_BYTES);
  const signature = request.headers.get("Stripe-Signature");
  if (!await verifyStripeSignature(raw, signature, env.STRIPE_WEBHOOK_SECRET)) return json({ error: "invalid_signature" }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "invalid_payload" }, 400); }
  if (event.livemode !== false) return json({ error: "live_mode_not_allowed" }, 400);
  const completedSession = event.type === "checkout.session.completed" ? event.data?.object : null;
  if (event.type === "checkout.session.completed" && completedSession?.livemode !== false) {
    return json({ error: "live_mode_not_allowed" }, 400);
  }
  const product = await getProduct(env);
  if (!product) return json({ error: "product_not_configured" }, 503);

  if (event.type === "checkout.session.completed") {
    const session = completedSession;
    const orderId = session?.metadata?.order_id;
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'stripe'").bind(orderId || "").first();
    if (!order || session?.id !== order.provider_checkout_id || session?.client_reference_id !== order.id || session?.mode !== "payment" || session?.payment_status !== "paid" || !matchesStripeSession(session, order)) {
      return json({ error: "payment_not_verified" }, 400);
    }
    if (!event.id) return json({ error: "invalid_event" }, 400);
    await grantPaidOrder(env, { provider: "stripe", eventId: event.id, orderId: order.id, paymentId: providerId(session.payment_intent), product });
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data?.object;
    if (session?.id && event.id) await markOrderStatus(env, "stripe", event.id, session.id, event.type.endsWith("expired") ? "cancelled" : "failed");
  } else if (event.type === "charge.refunded") {
    const charge = event.data?.object;
    if (charge?.payment_intent && event.id) await revokePaidOrder(env, "stripe", event.id, String(charge.payment_intent));
  }
  return json({ received: true });
}

async function paypalWebhook(request, env) {
  if (env.APP_ENV !== "test" || !env.PAYPAL_WEBHOOK_ID || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ error: "webhook_not_configured" }, 503);
  const raw = await readTextLimited(request, WEBHOOK_MAX_BYTES);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "invalid_payload" }, 400); }
  const verified = await verifyPaypalWebhook(request.headers, event, env);
  if (verified === null) return json({ error: "signature_verification_unavailable" }, 503);
  if (!verified) return json({ error: "invalid_signature" }, 400);
  const product = await getProduct(env);
  if (!product) return json({ error: "product_not_configured" }, 503);

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const resource = event.resource || {};
    const captureId = providerId(resource.id);
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;
    const token = await paypalAccessToken(env);
    const response = token && paypalOrderId
      ? await fetch(`${PAYPAL_SANDBOX_API}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      : null;
    const providerOrder = await response?.json().catch(() => ({}));
    const customId = providerOrder?.purchase_units?.[0]?.custom_id;
    const order = customId ? await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = 'paypal'").bind(customId).first() : null;
    const capture = providerOrder?.purchase_units?.[0]?.payments?.captures?.find((item) => item.id === captureId);
    if (!order || order.provider_checkout_id !== paypalOrderId || providerOrder?.status !== "COMPLETED" || capture?.status !== "COMPLETED" || !matchesProviderAmount(capture.amount, order)) {
      return json({ error: "payment_not_verified" }, 400);
    }
    if (!event.id) return json({ error: "invalid_event" }, 400);
    await grantPaidOrder(env, { provider: "paypal", eventId: event.id, orderId: order.id, paymentId: captureId, product });
  } else if (event.event_type === "CHECKOUT.ORDER.VOIDED") {
    const paypalOrderId = providerId(event.resource?.id);
    if (paypalOrderId && event.id) await markOrderStatus(env, "paypal", event.id, paypalOrderId, "cancelled");
  } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" || event.event_type === "PAYMENT.CAPTURE.REVERSED") {
    const captureId = providerId(event.resource?.id);
    if (captureId && event.id) await revokePaidOrder(env, "paypal", event.id, captureId);
  }
  return json({ received: true });
}

async function receiptStatus(request, env) {
  const body = await readJson(request);
  if (!isToken(body.receiptToken)) return json({ error: "invalid_receipt" }, 400);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE receipt_token_hash = ? ORDER BY created_at DESC LIMIT 1")
    .bind(await sha256Hex(body.receiptToken)).first();
  if (!order) return json({ error: "invalid_receipt", message: "This purchase link is invalid." }, 404);
  if (order.status === "refunded" || order.revoked_at != null) return json({ paid: false, revoked: true, status: order.status, message: "Download access for this purchase has been revoked." });
  if (order.status !== "paid") return json({ paid: false, status: order.status, message: "The payment provider has not verified this purchase yet." });
  const product = await getProduct(env);
  const artifact = await artifactIsAvailable(env, product);
  const result = {
    paid: true,
    status: order.status,
    expiresAt: order.download_expires_at,
    downloadCount: order.download_count,
    downloadLimit: order.download_limit,
    downloadReady: artifact.ready && !order.revoked_at && order.download_expires_at > nowSeconds() && order.download_count < order.download_limit,
    artifactKind: product?.artifact_kind || "missing",
    revoked: order.revoked_at != null
  };
  if (result.downloadReady && order.download_token_cipher) result.downloadToken = await decryptToken(order.download_token_cipher, env);
  return json(result);
}

async function downloadGuide(request, env) {
  const body = await readJson(request);
  if (!isToken(body.downloadToken)) return json(downloadError("invalid"), 400);
  const tokenHash = await sha256Hex(body.downloadToken);
  let order = await env.DB.prepare("SELECT * FROM orders WHERE download_token_hash = ?").bind(tokenHash).first();
  const product = await getProduct(env);
  const now = nowSeconds();
  const access = evaluateDownloadAccess(order, now, product, env.APP_ENV);
  if (!access.allowed) return json(downloadError(access.reason), downloadErrorStatus(access.reason));

  const object = await env.GUIDE_FILES.get(product.final_pdf_key);
  if (!object) return json(downloadError("missing_file"), 503);
  const incremented = await env.DB.prepare(
    "UPDATE orders SET download_count = download_count + 1, updated_at = ? WHERE id = ? AND status = 'paid' AND revoked_at IS NULL AND download_expires_at > ? AND download_count < download_limit RETURNING download_count"
  ).bind(now, order.id, now).first();
  if (!incremented) {
    order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(order.id).first();
    const refreshedAccess = evaluateDownloadAccess(order, nowSeconds(), product, env.APP_ENV);
    return json(downloadError(refreshedAccess.reason), downloadErrorStatus(refreshedAccess.reason));
  }
  const isPlaceholder = product.artifact_kind === "test-placeholder";
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${isPlaceholder ? "TEST_ONLY_NOT_THE_FINISHED_GUIDE.pdf" : "Puerto-Plata-Walking-Guide.pdf"}"`,
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Guide-Test-Placeholder": isPlaceholder ? "true" : "false",
      "X-Downloads-Remaining": String(order.download_limit - incremented.download_count),
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function checkoutReadiness(env, provider) {
  const product = await getProduct(env);
  if (env.APP_ENV !== "test" || env.PAYMENTS_ENABLED !== "true") return { ok: false, response: json({ error: "checkout_disabled", message: "Test checkout is disabled until sandbox setup is complete." }, 503) };
  if (!Number.isSafeInteger(product?.price_minor) || product.price_minor < 1 || !/^[a-z]{3}$/i.test(product.currency || "")) {
    return { ok: false, response: json({ error: "price_not_configured", message: "Set the product price and currency before enabling sandbox checkout." }, 503) };
  }
  if (!await encryptionKeyReady(env)) return { ok: false, response: json({ error: "token_encryption_not_configured" }, 503) };
  if (provider === "stripe" && (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"))) {
    return { ok: false, response: json({ error: "stripe_test_not_configured" }, 503) };
  }
  if (provider === "paypal" && (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID || paypalApiBase(env) !== PAYPAL_SANDBOX_API)) {
    return { ok: false, response: json({ error: "paypal_sandbox_not_configured" }, 503) };
  }
  return { ok: true, product };
}

async function getOrCreateOrder(env, provider, body, product) {
  if (!isToken(body.receiptToken) || !isRequestId(body.requestId)) return { response: json({ error: "invalid_request" }, 400) };
  const receiptHash = await sha256Hex(body.receiptToken);
  const existing = await env.DB.prepare("SELECT * FROM orders WHERE provider = ? AND client_request_id = ?").bind(provider, body.requestId).first();
  if (existing) {
    if (!constantTimeEqual(existing.receipt_token_hash, receiptHash)) return { response: json({ error: "request_conflict" }, 409) };
    if (existing.status !== "pending" && existing.status !== "paid") return { response: json({ error: "order_not_payable" }, 409) };
    return { order: existing };
  }
  const id = crypto.randomUUID();
  const timestamp = nowSeconds();
  try {
    await env.DB.prepare(
      "INSERT INTO orders (id, provider, client_request_id, status, amount_minor, currency, receipt_token_hash, download_limit, download_ttl_seconds, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, provider, body.requestId, product.price_minor, product.currency.toLowerCase(), receiptHash, product.download_limit, product.download_ttl_seconds, timestamp, timestamp).run();
  } catch {
    const concurrent = await env.DB.prepare("SELECT * FROM orders WHERE provider = ? AND client_request_id = ?").bind(provider, body.requestId).first();
    if (!concurrent || !constantTimeEqual(concurrent.receipt_token_hash, receiptHash)) return { response: json({ error: "order_creation_failed" }, 409) };
    return { order: concurrent };
  }
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  return { order };
}

async function grantPaidOrder(env, { provider, eventId, orderId, paymentId, product }) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND provider = ?").bind(orderId, provider).first();
  if (!order) return false;
  if (order.status === "paid") return false;
  if (!mayTransitionToPaid(order.status)) return false;
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const tokenCipher = await encryptToken(token, env);
  const timestamp = nowSeconds();
  const expiry = timestamp + order.download_ttl_seconds;
  const results = await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (provider, event_id, processed_at) VALUES (?, ?, ?) ON CONFLICT(provider, event_id) DO NOTHING")
      .bind(provider, eventId, timestamp),
    env.DB.prepare(
      "UPDATE orders SET status = 'paid', provider_payment_id = ?, paid_at = ?, download_expires_at = ?, download_token_hash = ?, download_token_cipher = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ).bind(paymentId || null, timestamp, expiry, tokenHash, tokenCipher, timestamp, orderId)
  ]);
  return changes(results?.[1]) === 1;
}

async function revokePaidOrder(env, provider, eventId, paymentId) {
  const timestamp = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (provider, event_id, processed_at) VALUES (?, ?, ?) ON CONFLICT(provider, event_id) DO NOTHING").bind(provider, eventId, timestamp),
    env.DB.prepare("UPDATE orders SET status = 'refunded', revoked_at = ?, updated_at = ? WHERE provider = ? AND provider_payment_id = ? AND status = 'paid'").bind(timestamp, timestamp, provider, paymentId)
  ]);
}

async function markOrderStatus(env, provider, eventId, providerCheckoutId, status) {
  const timestamp = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO payment_events (provider, event_id, processed_at) VALUES (?, ?, ?) ON CONFLICT(provider, event_id) DO NOTHING").bind(provider, eventId, timestamp),
    env.DB.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE provider = ? AND provider_checkout_id = ? AND status = 'pending'").bind(status, timestamp, provider, providerCheckoutId)
  ]);
}

function matchesStripeSession(session, order) {
  return Number(session.amount_total) === Number(order.amount_minor) && String(session.currency || "").toLowerCase() === String(order.currency).toLowerCase();
}

function matchesProviderAmount(amount, order) {
  if (!amount || String(amount.currency_code || amount.currency || "").toLowerCase() !== String(order.currency).toLowerCase()) return false;
  const scale = currencyScale(order.currency);
  const numeric = Number(amount.value);
  return Number.isFinite(numeric) && Math.round(numeric * (10 ** scale)) === Number(order.amount_minor);
}

async function verifyPaypalWebhook(headers, event, env) {
  const token = await paypalAccessToken(env);
  if (!token) return null;
  const verification = {
    auth_algo: headers.get("PAYPAL-AUTH-ALGO"),
    cert_url: headers.get("PAYPAL-CERT-URL"),
    transmission_id: headers.get("PAYPAL-TRANSMISSION-ID"),
    transmission_sig: headers.get("PAYPAL-TRANSMISSION-SIG"),
    transmission_time: headers.get("PAYPAL-TRANSMISSION-TIME"),
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: event
  };
  if (Object.values(verification).some((value) => !value)) return false;
  const response = await fetch(`${PAYPAL_SANDBOX_API}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(verification)
  }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  if (!response?.ok) return null;
  return result.verification_status === "SUCCESS";
}

async function paypalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || paypalApiBase(env) !== PAYPAL_SANDBOX_API) return null;
  const response = await fetch(`${PAYPAL_SANDBOX_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  }).catch(() => null);
  const result = await response?.json().catch(() => ({}));
  return response?.ok && typeof result.access_token === "string" ? result.access_token : null;
}

function paypalApiBase(env) {
  return env.PAYPAL_API_BASE || PAYPAL_SANDBOX_API;
}

async function getProduct(env) {
  if (!env.DB) return null;
  return env.DB.prepare("SELECT * FROM product_config WHERE id = ?").bind(PRODUCT_ID).first();
}

async function artifactIsAvailable(env, product) {
  if (!product?.final_pdf_key || product.artifact_kind === "missing" || !env.GUIDE_FILES) return { ready: false };
  if (product.artifact_kind === "test-placeholder" && env.APP_ENV !== "test") return { ready: false };
  try { return { ready: Boolean(await env.GUIDE_FILES.head(product.final_pdf_key)) }; } catch { return { ready: false }; }
}

async function encryptionKeyReady(env) {
  try { decodeEncryptionKey(env.TOKEN_ENCRYPTION_KEY); return true; } catch { return false; }
}

async function encryptToken(token, env) {
  const rawKey = decodeEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(token));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptToken(cipherText, env) {
  const [ivText, payloadText] = String(cipherText).split(".");
  const key = await crypto.subtle.importKey("raw", decodeEncryptionKey(env.TOKEN_ENCRYPTION_KEY), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivText) }, key, base64ToBytes(payloadText));
  return new TextDecoder().decode(plain);
}

function decodeEncryptionKey(value) {
  if (!value) throw new Error("token_key_missing");
  const bytes = base64ToBytes(value);
  if (bytes.length !== 32) throw new Error("token_key_must_be_32_bytes");
  return bytes;
}

async function sha256Hex(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function readJson(request) {
  const text = await readTextLimited(request, MAX_JSON_BYTES);
  try { return JSON.parse(text || "{}"); } catch { throw new ApiInputError(400, "invalid_json", "The request body must be valid JSON."); }
}

async function readTextLimited(request, maxBytes) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiInputError(413, "payload_too_large", "The request body is too large.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiInputError(413, "payload_too_large", "The request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ApiInputError(400, "invalid_encoding", "The request body must be UTF-8 text."); }
}

function siteOrigin(env) {
  const value = String(env.SITE_ORIGIN || "").replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && env.APP_ENV !== "test") throw new Error("site_origin_must_be_https");
  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
}

function originAllowed(origin, env) {
  if (!origin) return true;
  return String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}

function corsHeaders(origin) {
  if (!origin) return { "Vary": "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Guide-Test-Placeholder, X-Downloads-Remaining",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
}

function downloadError(reason) {
  const messages = {
    invalid: "This download link is invalid.",
    unpaid: "No verified payment is attached to this download link.",
    revoked: "Download access for this purchase has been revoked. Contact support if you think this is a mistake.",
    expired: "This download link expired 24 hours after it was issued. Please contact support to request a refreshed link.",
    exhausted: "This purchase has reached its download limit. Contact support if you need help.",
    missing_file: "Payment is verified, but the guide file is not ready yet. Please check back or contact support.",
    placeholder_prohibited: "The test placeholder is not available outside the test environment."
  };
  return { error: reason, message: messages[reason] || "This download is unavailable." };
}

function downloadErrorStatus(reason) {
  if (reason === "expired") return 410;
  if (reason === "missing_file") return 503;
  if (reason === "invalid") return 404;
  if (reason === "unpaid" || reason === "revoked" || reason === "placeholder_prohibited") return 403;
  return 429;
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function providerId(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isRequestId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

function isProviderId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{4,128}$/.test(value);
}

function randomToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

class ApiInputError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
