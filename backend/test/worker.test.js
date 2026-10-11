import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  amountToDecimal,
  currencyScale,
  evaluateDownloadAccess,
  mayTransitionToPaid,
  verifyStripeSignature
} from "../src/index.js";

const baseOrder = {
  status: "paid",
  revoked_at: null,
  download_expires_at: 2_000_000_000,
  download_count: 0,
  download_limit: 3
};
const finalPdf = { final_pdf_key: "private/guide.pdf", artifact_kind: "final" };
const DOWNLOAD_TOKEN = "d".repeat(64);

async function hashToken(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeDownloadEnv(orderOverrides = {}, productOverrides = {}) {
  const state = {
    order: {
      id: "order-test-1",
      status: "paid",
      revoked_at: null,
      download_expires_at: Math.floor(Date.now() / 1000) + 3600,
      download_count: 0,
      download_limit: 3,
      download_token_hash: await hashToken(DOWNLOAD_TOKEN),
      ...orderOverrides
    },
    product: {
      id: "pp-walking-guide-v1",
      final_pdf_key: "private/guide.pdf",
      artifact_kind: "final",
      ...productOverrides
    }
  };

  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...boundValues) { values = boundValues; return this; },
        async first() {
          if (sql.startsWith("SELECT * FROM orders WHERE download_token_hash = ?")) {
            return values[0] === state.order.download_token_hash ? { ...state.order } : null;
          }
          if (sql.startsWith("SELECT * FROM product_config WHERE id = ?")) return { ...state.product };
          if (sql.startsWith("UPDATE orders SET download_count = download_count + 1")) {
            const [, orderId, at] = values;
            if (
              state.order.id !== orderId || state.order.status !== "paid" || state.order.revoked_at != null ||
              state.order.download_expires_at <= at || state.order.download_count >= state.order.download_limit
            ) return null;
            state.order.download_count += 1;
            return { download_count: state.order.download_count };
          }
          if (sql.startsWith("SELECT * FROM orders WHERE id = ?")) {
            return values[0] === state.order.id ? { ...state.order } : null;
          }
          throw new Error(`Unexpected test SQL: ${sql}`);
        }
      };
    }
  };

  return {
    state,
    env: {
      DB,
      APP_ENV: "test",
      PAYMENTS_ENABLED: "false",
      SUPABASE_URL: "https://test-project.supabase.co",
      SUPABASE_STORAGE_BUCKET: "puerto-plata-guide-private-test",
      SUPABASE_SECRET_KEY: "sb_secret_unit_test_only"
    }
  };
}

async function requestDownload(env, token = DOWNLOAD_TOKEN) {
  return worker.fetch(new Request("https://worker.example/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadToken: token })
  }), env);
}

async function withFetch(fetchImpl, action) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await action(); }
  finally { globalThis.fetch = originalFetch; }
}

function privateBucketInfo() {
  return Response.json({ id: "puerto-plata-guide-private-test", public: false });
}

async function signedStripeWebhook(event, secret) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request("https://worker.example/api/webhooks/stripe", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body
  });
}

test("formats configured amounts using provider minor units", () => {
  assert.equal(currencyScale("USD"), 2);
  assert.equal(amountToDecimal(1234, "usd"), "12.34");
  assert.equal(amountToDecimal(1234, "jpy"), "1234");
  assert.equal(amountToDecimal(1234, "kwd"), "1.234");
});

test("download policy allows paid orders only while valid, private file is configured, and under limit", () => {
  assert.deepEqual(evaluateDownloadAccess(baseOrder, 1_900_000_000, finalPdf), { allowed: true, reason: "ok" });
  assert.equal(evaluateDownloadAccess(null, 1_900_000_000, finalPdf).reason, "invalid");
  assert.equal(evaluateDownloadAccess({ ...baseOrder, status: "pending" }, 1_900_000_000, finalPdf).reason, "unpaid");
  assert.equal(evaluateDownloadAccess({ ...baseOrder, download_expires_at: 1_900_000_000 }, 1_900_000_000, finalPdf).reason, "expired");
  assert.equal(evaluateDownloadAccess({ ...baseOrder, download_count: 3 }, 1_900_000_000, finalPdf).reason, "exhausted");
  assert.equal(evaluateDownloadAccess({ ...baseOrder, revoked_at: 1_850_000_000 }, 1_900_000_000, finalPdf).reason, "revoked");
  assert.equal(evaluateDownloadAccess(baseOrder, 1_900_000_000, { artifact_kind: "missing" }).reason, "missing_file");
  assert.equal(evaluateDownloadAccess(baseOrder, 1_900_000_000, { final_pdf_key: "test.pdf", artifact_kind: "test-placeholder" }, "production").reason, "placeholder_prohibited");
  assert.deepEqual(evaluateDownloadAccess(baseOrder, 1_900_000_000, { final_pdf_key: "test.pdf", artifact_kind: "test-placeholder" }, "test"), { allowed: true, reason: "ok" });
});

test("only a pending order can transition to paid, so repeat events cannot grant twice", () => {
  assert.equal(mayTransitionToPaid("pending"), true);
  assert.equal(mayTransitionToPaid("paid"), false);
  assert.equal(mayTransitionToPaid("refunded"), false);
  assert.equal(mayTransitionToPaid("cancelled"), false);
});

test("Stripe signatures must be valid and within the timestamp tolerance", async () => {
  const body = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const secret = "whsec_unit_test_only";
  const timestamp = 1_800_000_000;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const signature = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.equal(await verifyStripeSignature(body, `t=${timestamp},v1=${"0".repeat(64)}`, secret, timestamp), false);
  assert.equal(await verifyStripeSignature(body, `t=${timestamp - 301},v1=${signature}`, secret, timestamp), false);
});

test("Stripe live-mode events and Checkout Sessions are rejected despite valid signatures", async () => {
  const secret = "whsec_unit_test_only";
  const events = [
    {
      id: "evt_live_mode",
      livemode: true,
      type: "checkout.session.completed",
      data: { object: { livemode: false } }
    },
    {
      id: "evt_live_session",
      livemode: false,
      type: "checkout.session.completed",
      data: { object: { livemode: true } }
    }
  ];

  for (const event of events) {
    const response = await worker.fetch(await signedStripeWebhook(event, secret), {
      APP_ENV: "test",
      STRIPE_WEBHOOK_SECRET: secret
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "live_mode_not_allowed");
  }
});

test("default worker configuration exposes no working payment controls", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/config"), {
    APP_ENV: "test",
    PAYMENTS_ENABLED: "false",
    ALLOWED_ORIGINS: "https://shop.example"
  });
  const config = await response.json();
  assert.equal(response.status, 200);
  assert.equal(config.mode, "test");
  assert.equal(config.priceConfigured, false);
  assert.equal(config.checkoutEnabled, false);
  assert.equal(config.stripeCardsEnabled, false);
  assert.equal(config.paypalEnabled, false);
});

test("checkout stays disabled and forged Stripe webhook requests are rejected", async () => {
  const disabled = await worker.fetch(new Request("https://worker.example/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: "12345678-1234-1234-1234-123456789012", receiptToken: "a".repeat(64) })
  }), { APP_ENV: "test", PAYMENTS_ENABLED: "false" });
  assert.equal(disabled.status, 503);

  const forged = await worker.fetch(new Request("https://worker.example/api/webhooks/stripe", {
    method: "POST",
    headers: { "Stripe-Signature": "t=1800000000,v1=0000000000000000000000000000000000000000000000000000000000000000" },
    body: JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", data: { object: {} } })
  }), { APP_ENV: "test", STRIPE_WEBHOOK_SECRET: "whsec_unit_test_only" });
  assert.equal(forged.status, 400);
});

test("private guide files are streamed through the Worker with a server-only Supabase key", async () => {
  const { env, state } = await makeDownloadEnv();
  const response = await withFetch(async (input, init) => {
    const target = new URL(input);
    assert.equal(target.origin, "https://test-project.supabase.co");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.apikey, "sb_secret_unit_test_only");
    assert.equal(init.headers.authorization, undefined);
    if (target.pathname === "/storage/v1/bucket/puerto-plata-guide-private-test") return privateBucketInfo();
    assert.equal(target.pathname, "/storage/v1/object/authenticated/puerto-plata-guide-private-test/private/guide.pdf");
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { "Content-Length": "4", "Content-Type": "application/pdf" }
    });
  }, () => requestDownload(env));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("X-Downloads-Remaining"), "2");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="Puerto-Plata-Walking-Guide.pdf"');
  assert.equal(response.headers.get("X-Supabase-URL"), null);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [37, 80, 68, 70]);
  assert.equal(state.order.download_count, 1);
});

test("public config checks private object metadata without exposing Supabase settings", async () => {
  const { env } = await makeDownloadEnv();
  const response = await withFetch(async (input, init) => {
    const target = new URL(input);
    assert.equal(init.headers.apikey, "sb_secret_unit_test_only");
    assert.equal(init.headers.authorization, undefined);
    if (target.pathname === "/storage/v1/bucket/puerto-plata-guide-private-test") return privateBucketInfo();
    assert.equal(target.pathname, "/storage/v1/object/info/puerto-plata-guide-private-test/private/guide.pdf");
    return Response.json({ name: "guide.pdf", size: 4 });
  }, () => worker.fetch(new Request("https://worker.example/api/config"), env));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.artifact.ready, true);
  assert.equal(JSON.stringify(body).includes("sb_secret_unit_test_only"), false);
  assert.equal(JSON.stringify(body).includes("test-project.supabase.co"), false);
});

test("a missing private object returns a useful unavailable response without consuming a download", async () => {
  const { env, state } = await makeDownloadEnv();
  const response = await withFetch(async (input) => {
    const target = new URL(input);
    if (target.pathname === "/storage/v1/bucket/puerto-plata-guide-private-test") return privateBucketInfo();
    assert.equal(target.pathname, "/storage/v1/object/authenticated/puerto-plata-guide-private-test/private/guide.pdf");
    return new Response("not found", { status: 404 });
  }, () => requestDownload(env));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, "missing_file");
  assert.match(body.message, /guide file is not ready/i);
  assert.equal(state.order.download_count, 0);
});

test("the Worker enforces the three-download limit before another storage request", async () => {
  const { env, state } = await makeDownloadEnv({ download_count: 2 });
  let bucketChecks = 0;
  let objectRequests = 0;
  const response = await withFetch(async (input) => {
    const target = new URL(input);
    if (target.pathname === "/storage/v1/bucket/puerto-plata-guide-private-test") {
      bucketChecks += 1;
      return privateBucketInfo();
    }
    objectRequests += 1;
    assert.equal(target.pathname, "/storage/v1/object/authenticated/puerto-plata-guide-private-test/private/guide.pdf");
    return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
  }, async () => {
    const allowed = await requestDownload(env);
    assert.equal(allowed.status, 200);
    await allowed.arrayBuffer();
    return requestDownload(env);
  });

  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, "exhausted");
  assert.equal(state.order.download_count, 3);
  assert.equal(bucketChecks, 1);
  assert.equal(objectRequests, 1);
});

test("a public Supabase bucket is rejected before file metadata or bytes are requested", async () => {
  const { env, state } = await makeDownloadEnv();
  const response = await withFetch(async (input, init) => {
    const target = new URL(input);
    assert.equal(target.pathname, "/storage/v1/bucket/puerto-plata-guide-private-test");
    assert.equal(init.headers.apikey, "sb_secret_unit_test_only");
    assert.equal(init.headers.authorization, undefined);
    return Response.json({ id: "puerto-plata-guide-private-test", public: true });
  }, () => requestDownload(env));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing_file");
  assert.equal(state.order.download_count, 0);
});

test("expired download links are rejected before private storage is contacted", async () => {
  const { env, state } = await makeDownloadEnv({ download_expires_at: Math.floor(Date.now() / 1000) - 1 });
  const response = await withFetch(async () => { throw new Error("storage must not be contacted"); }, () => requestDownload(env));

  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, "expired");
  assert.equal(state.order.download_count, 0);
});

test("revoked purchases are rejected before private storage is contacted", async () => {
  const { env, state } = await makeDownloadEnv({ revoked_at: Math.floor(Date.now() / 1000) - 1 });
  const response = await withFetch(async () => { throw new Error("storage must not be contacted"); }, () => requestDownload(env));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "revoked");
  assert.equal(state.order.download_count, 0);
});

test("invalid storage keys fail closed without contacting Supabase", async () => {
  const { env } = await makeDownloadEnv({}, { final_pdf_key: "../public/guide.pdf" });
  const response = await withFetch(async () => { throw new Error("storage must not be contacted"); }, () => requestDownload(env));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing_file");
});

test("Supabase URLs with extra hostname labels fail closed before sending the secret key", async () => {
  const { env, state } = await makeDownloadEnv();
  env.SUPABASE_URL = "https://attacker.supabase.co.evil.supabase.co";
  const response = await withFetch(async () => { throw new Error("invalid host must not receive a request"); }, () => requestDownload(env));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing_file");
  assert.equal(state.order.download_count, 0);
});

test("storage access refuses a Supabase publishable key", async () => {
  const { env, state } = await makeDownloadEnv();
  env.SUPABASE_SECRET_KEY = "sb_publishable_not_a_server_secret";
  const response = await withFetch(async () => { throw new Error("storage must not be contacted"); }, () => requestDownload(env));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing_file");
  assert.equal(state.order.download_count, 0);
});

