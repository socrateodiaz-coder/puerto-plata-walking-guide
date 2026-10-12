(function () {
  "use strict";

  const settings = window.PUERTO_PLATA_CHECKOUT || {};
  const apiBase = String(settings.apiBase || "").replace(/\/+$/, "");
  const app = document.getElementById("app");
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page") || "home";

  function token() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function requestId() {
    return crypto.randomUUID();
  }

  function attempt(provider) {
    const receiptKey = "pp-guide-receipt-" + provider;
    const requestKey = "pp-guide-request-" + provider;
    let receiptToken = sessionStorage.getItem(receiptKey);
    let id = sessionStorage.getItem(requestKey);
    if (!/^[a-f0-9]{64}$/i.test(receiptToken || "")) {
      receiptToken = token();
      sessionStorage.setItem(receiptKey, receiptToken);
    }
    if (!/^[a-f0-9-]{36}$/i.test(id || "")) {
      id = requestId();
      sessionStorage.setItem(requestKey, id);
    }
    return { receiptToken: receiptToken, requestId: id };
  }

  function clearAttempts() {
    ["stripe", "paypal"].forEach(function (provider) {
      sessionStorage.removeItem("pp-guide-receipt-" + provider);
      sessionStorage.removeItem("pp-guide-request-" + provider);
    });
  }

  async function api(path, body) {
    if (!apiBase) throw new Error("The test API URL has not been configured.");
    const response = await fetch(apiBase + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    const contentType = response.headers.get("Content-Type") || "";
    const result = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(result?.message || result?.error || "The request could not be completed.");
    return result;
  }

  function setCheckoutStatus(title, message, kind) {
    const box = document.getElementById("checkout-status");
    if (!box) return;
    box.className = "checkout-status" + (kind ? " checkout-status-" + kind : "");
    box.replaceChildren();
    const strong = document.createElement("strong");
    const paragraph = document.createElement("p");
    strong.textContent = title;
    paragraph.textContent = message;
    box.append(strong, paragraph);
  }

  function showPrice(config) {
    if (!config?.priceConfigured || !config.currency || !config.price) return;
    let value;
    try {
      value = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: config.currency,
        minimumFractionDigits: Number(config.price) % 1 ? 2 : 0
      }).format(Number(config.price));
    } catch {
      value = config.currency + " " + config.price;
    }
    document.querySelectorAll("[data-product-price]").forEach(function (element) {
      element.textContent = value;
    });
  }

  function routeWithToken(targetPage, value) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("page", targetPage);
    url.hash = value;
    return url.pathname + url.search + url.hash;
  }

  async function startStripeCheckout(button) {
    const attemptData = attempt("stripe");
    button.disabled = true;
    setCheckoutStatus("Opening secure card checkout…", "A Stripe test checkout will open. No live card charge will be made.");
    try {
      const result = await api("/api/stripe/checkout", attemptData);
      if (!result.checkoutUrl || !result.checkoutUrl.startsWith("https://checkout.stripe.com/")) throw new Error("The test checkout link was not valid.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      sessionStorage.removeItem("pp-guide-request-stripe");
      sessionStorage.removeItem("pp-guide-receipt-stripe");
      button.disabled = false;
      setCheckoutStatus("Card test checkout did not start", error.message, "error");
    }
  }

  async function loadPayPal(config) {
    const container = document.getElementById("paypal-button-container");
    if (!container || !config.paypalEnabled || !config.paypalClientId || !config.currency) return;
    try {
      const sdk = document.createElement("script");
      const query = new URLSearchParams({
        "client-id": config.paypalClientId,
        currency: config.currency,
        intent: "capture",
        components: "buttons"
      });
      sdk.src = "https://www.paypal.com/sdk/js?" + query.toString();
      sdk.async = true;
      sdk.referrerPolicy = "no-referrer";
      document.head.appendChild(sdk);
      await new Promise(function (resolve, reject) {
        sdk.onload = resolve;
        sdk.onerror = function () { reject(new Error("PayPal sandbox could not be loaded.")); };
      });
      if (!window.paypal) throw new Error("PayPal sandbox is unavailable.");
      window.paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "paypal", color: "gold" },
        createOrder: async function () {
          const data = attempt("paypal");
          const result = await api("/api/paypal/orders", data);
          if (!result.orderId) throw new Error("PayPal did not create a sandbox order.");
          return result.orderId;
        },
        onApprove: async function (data) {
          const dataForCapture = attempt("paypal");
          await api("/api/paypal/capture", { orderId: data.orderID, receiptToken: dataForCapture.receiptToken });
          window.location.assign(routeWithToken("thanks", dataForCapture.receiptToken));
        },
        onCancel: function () {
          sessionStorage.removeItem("pp-guide-request-paypal");
          sessionStorage.removeItem("pp-guide-receipt-paypal");
          setCheckoutStatus("PayPal test checkout cancelled", "No payment was confirmed and no download access was granted.");
        },
        onError: function () {
          setCheckoutStatus("PayPal test checkout could not be completed", "No download access is granted unless the server confirms a completed sandbox payment.", "error");
        }
      }).render(container);
      container.hidden = false;
    } catch (error) {
      setCheckoutStatus("PayPal sandbox unavailable", error.message, "error");
    }
  }

  function showReceiptMessage(title, message, kind) {
    const titleNode = document.getElementById("receipt-title");
    const messageNode = document.getElementById("receipt-message");
    if (titleNode) titleNode.textContent = title;
    if (messageNode) {
      messageNode.textContent = message;
      messageNode.className = "state-copy" + (kind ? " status-" + kind : "");
    }
  }

  function addReceiptAction(label, href, primary) {
    const actions = document.getElementById("receipt-actions");
    const fallback = document.getElementById("receipt-fallback");
    if (!actions) return;
    const link = document.createElement("a");
    link.className = "button " + (primary ? "button-primary" : "button-secondary") + " button-full";
    link.href = href;
    link.textContent = label;
    actions.appendChild(link);
    actions.hidden = false;
    if (fallback) fallback.hidden = true;
  }

  async function refreshReceipt() {
    const hashValue = window.location.hash.slice(1);
    const storedStripe = sessionStorage.getItem("pp-guide-receipt-stripe");
    const storedPayPal = sessionStorage.getItem("pp-guide-receipt-paypal");
    const receiptToken = /^[a-f0-9]{64}$/i.test(hashValue) ? hashValue : (storedStripe || storedPayPal || "");
    if (!receiptToken) {
      showReceiptMessage("Purchase verification is unavailable", "This page needs the secure receipt reference from your checkout. Return to checkout and complete a sandbox purchase.", "error");
      return;
    }
    sessionStorage.setItem("pp-guide-last-receipt", receiptToken);
    if (window.location.hash) window.history.replaceState({}, "", window.location.pathname + window.location.search);
    try {
      const result = await api("/api/orders/receipt", { receiptToken: receiptToken });
      if (result.revoked) {
        showReceiptMessage("Download access was revoked", "The payment was refunded or access was revoked. Contact support if you think this is a mistake.", "error");
        return;
      }
      if (!result.paid) {
        showReceiptMessage("Payment is awaiting verification", result.message || "The provider has not confirmed payment. Refresh this page after the test checkout finishes.", "pending");
        addReceiptAction("Check payment again", routeWithToken("thanks", receiptToken), false);
        return;
      }
      if (result.expiresAt && result.expiresAt <= Math.floor(Date.now() / 1000)) {
        showReceiptMessage("Your download link has expired", "The secure link expired 24 hours after issue. Contact support to request a new link.", "error");
        return;
      }
      if (result.downloadCount >= result.downloadLimit) {
        showReceiptMessage("Download limit reached", "This order has used its allowed successful downloads. Contact support if you need help.", "error");
        return;
      }
      if (!result.downloadReady || !result.downloadToken) {
        showReceiptMessage("Test purchase verified", "The provider confirmed this test purchase, but the PDF is not in private storage yet. Add the test placeholder or final PDF to the private bucket, then check again.", "pending");
        addReceiptAction("Check file availability", routeWithToken("thanks", receiptToken), false);
        return;
      }
      const testNote = result.artifactKind === "test-placeholder" ? " This is a test-only placeholder, not the finished guide." : "";
      const expiry = new Date(result.expiresAt * 1000).toLocaleString();
      showReceiptMessage("Test payment verified", "Your secure download is ready and expires " + expiry + ". Up to " + result.downloadLimit + " successful downloads are allowed." + testNote, "success");
      addReceiptAction(result.artifactKind === "test-placeholder" ? "Download test placeholder" : "Download the guide", routeWithToken("download", result.downloadToken), true);
    } catch (error) {
      showReceiptMessage("Could not verify this purchase", error.message + " Download access stays locked until the server confirms the test payment.", "error");
    }
  }

  function setDownloadMessage(title, message, kind) {
    const titleNode = document.getElementById("download-title");
    const messageNode = document.getElementById("download-message");
    if (titleNode) titleNode.textContent = title;
    if (messageNode) {
      messageNode.textContent = message;
      messageNode.className = "state-copy" + (kind ? " status-" + kind : "");
    }
  }

  function initDownload() {
    const button = document.getElementById("download-guide-button");
    const note = document.getElementById("download-limit-note");
    const hashValue = window.location.hash.slice(1);
    if (!button) return;
    if (!/^[a-f0-9]{64}$/i.test(hashValue)) {
      setDownloadMessage("Download link is missing", "Return to the verified test purchase confirmation to open its secure download link.", "error");
      return;
    }
    setDownloadMessage("Ready to check your link", "The server will validate payment, expiry, revocation, the download limit, and private file availability when you select the button.");
    button.hidden = false;
    if (note) {
      note.textContent = "Each successful file response counts toward the three-download limit. The server enforces the 24-hour expiry.";
      note.hidden = false;
    }
    button.addEventListener("click", async function () {
      button.disabled = true;
      button.textContent = "Checking secure link…";
      try {
        const response = await fetch(apiBase + "/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadToken: hashValue }),
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer"
        });
        if (!response.ok) {
          const result = await response.json().catch(function () { return {}; });
          throw new Error(result.message || result.error || "Download could not be authorized.");
        }
        const file = await response.blob();
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = response.headers.get("X-Guide-Test-Placeholder") === "true" ? "TEST_ONLY_NOT_THE_FINISHED_GUIDE.pdf" : "Puerto-Plata-Walking-Guide.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60_000);
        const remaining = response.headers.get("X-Downloads-Remaining");
        setDownloadMessage("Download started", remaining === null ? "The server authorized your file." : "The server authorized your file. " + (3 - Number(remaining)) + " of 3 successful downloads used.", "success");
      } catch (error) {
        setDownloadMessage("Download unavailable", error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Try secure download again";
      }
    });
  }

  async function init() {
    if (page === "checkout" && params.get("status") === "cancelled") {
      clearAttempts();
      window.history.replaceState({}, "", window.location.pathname + "?page=checkout");
      setCheckoutStatus("Checkout cancelled", "No verified payment was received and no download access was granted.");
    }
    if (page === "thanks") {
      await refreshReceipt();
      return;
    }
    if (page === "download") {
      initDownload();
      return;
    }
    if (!apiBase) {
      if (page === "checkout") setCheckoutStatus("Test checkout is not configured", "Set the public test API URL after deploying the Worker. No payment controls are available yet.");
      return;
    }
    try {
      const config = await api("/api/config");
      showPrice(config);
      if (page !== "checkout") return;
      const providers = document.getElementById("provider-options");
      const stripeButton = document.getElementById("stripe-checkout-button");
      const paypalContainer = document.getElementById("paypal-button-container");
      if (!config.priceConfigured) {
        setCheckoutStatus("Price setup required", "The product price and currency have not been configured. No checkout can start.");
        return;
      }
      if (!config.checkoutEnabled) {
        setCheckoutStatus("Sandbox checkout is disabled", "Purchases are unavailable until the backend is enabled and all test settings are ready. No payment has been processed.");
        return;
      }
      providers.hidden = false;
      setCheckoutStatus("Test checkout ready", "Choose a provider sandbox. This prototype can never accept live credentials or create a live charge.", "success");
      if (config.stripeCardsEnabled) {
        stripeButton.hidden = false;
        stripeButton.addEventListener("click", function () { startStripeCheckout(stripeButton); });
      }
      if (config.paypalEnabled) {
        paypalContainer.hidden = false;
        await loadPayPal(config);
      }
      if (!config.artifact?.ready) {
        const detail = document.createElement("p");
        detail.className = "checkout-footnote";
        detail.textContent = "Checkout is available in test mode, but downloads remain unavailable until a file is loaded into private storage.";
        providers.appendChild(detail);
      }
    } catch (error) {
      if (page === "checkout") setCheckoutStatus("Test backend unavailable", error.message + " No payment has been processed.", "error");
    }
  }

  if (app) init();
})();
