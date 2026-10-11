const STORAGE_API_PATH = "/storage/v1/object";
const SUPABASE_HOST_SUFFIX = ".supabase.co";

/**
 * Build a private-object URL only for the configured Supabase project and
 * bucket. Object keys come from D1, but are still validated as untrusted data.
 */
function storageRequest(env, operation, objectKey) {
  if (!env.SUPABASE_URL || !env.SUPABASE_STORAGE_BUCKET || !env.SUPABASE_SECRET_KEY) {
    throw new Error("supabase_storage_not_configured");
  }
  if (!String(env.SUPABASE_SECRET_KEY).startsWith("sb_secret_")) {
    throw new Error("supabase_secret_key_required");
  }

  const projectUrl = new URL(env.SUPABASE_URL);
  if (
    projectUrl.protocol !== "https:" ||
    !projectUrl.hostname.endsWith(SUPABASE_HOST_SUFFIX) ||
    projectUrl.hostname === SUPABASE_HOST_SUFFIX.slice(1) ||
    projectUrl.username ||
    projectUrl.password ||
    projectUrl.port ||
    projectUrl.search ||
    projectUrl.hash ||
    (projectUrl.pathname !== "/" && projectUrl.pathname !== "")
  ) {
    throw new Error("invalid_supabase_project_url");
  }

  const bucket = String(env.SUPABASE_STORAGE_BUCKET);
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("invalid_supabase_bucket");
  }

  const path = encodeObjectKey(objectKey);
  if (!path) throw new Error("invalid_storage_object_key");

  const url = new URL(`${STORAGE_API_PATH}/${operation}/${encodeURIComponent(bucket)}/${path}`, projectUrl.origin);
  return {
    url,
    init: {
      method: "GET",
      headers: {
        // Supabase secret API keys belong in apikey. Do not also send this
        // opaque key as a Bearer JWT in Authorization.
        apikey: env.SUPABASE_SECRET_KEY,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "manual"
    }
  };
}

function encodeObjectKey(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return null;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((part) => part === "" || part === "." || part === "..")) return null;
  return segments.map(encodeURIComponent).join("/");
}

/** Check object metadata without creating or returning a URL usable by a buyer. */
export async function hasPrivateObject(env, objectKey, fetchImpl = fetch) {
  const request = storageRequest(env, "info", objectKey);
  const response = await fetchImpl(request.url, request.init);
  if (response.status === 404) return false;
  return response.ok;
}

/** Stream a private object through the Worker; never return a Supabase URL. */
export async function getPrivateObject(env, objectKey, fetchImpl = fetch) {
  const request = storageRequest(env, "authenticated", objectKey);
  const response = await fetchImpl(request.url, request.init);
  if (response.status === 404) return null;
  if (!response.ok || !response.body) throw new Error("supabase_storage_unavailable");

  const rawLength = response.headers.get("Content-Length");
  const length = rawLength === null ? Number.NaN : Number(rawLength);
  return {
    body: response.body,
    size: Number.isSafeInteger(length) && length >= 0 ? length : null
  };
}
