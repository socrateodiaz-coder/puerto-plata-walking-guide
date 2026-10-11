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
