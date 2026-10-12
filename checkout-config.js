// Public frontend configuration only. Never put provider keys or secrets here.
// Local previews use the local Worker. The published site remains unconfigured.
const localPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
window.PUERTO_PLATA_CHECKOUT = Object.freeze({
  apiBase: localPreview ? "http://127.0.0.1:8787" : ""
});
