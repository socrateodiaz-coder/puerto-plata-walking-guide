const STORAGE_API_PATH = "/storage/v1";
const SUPABASE_PROJECT_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.supabase\.co$/;

/** Validate the single configured project, bucket, and server-only credential. */
function storageConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_STORAGE_BUCKET || !env.SUPABASE_SECRET_KEY) {
    throw new Error("supabase_storage_not_configured");
  }
  if (!String(env.SUPABASE_SECRET_KEY).startsWith("sb_secret_")) {
    throw new Error("supabase_secret_key_required");
  }

  const projectUrl = new URL(env.SUPABASE_URL);
  if (
    projectUrl.protocol !== "https:" ||
    !SUPABASE_PROJECT_HOST.test(projectUrl.hostname) ||
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

  return { origin: projectUrl.origin, bucket, secretKey: env.SUPABASE_SECRET_KEY };
}

function requestInit(config, accept = "application/json") {
  return {
    method: "GET",
    headers: {
      // Supabase secret API keys belong in apikey. Do not also send this
      // opaque key as a Bearer JWT in Authorization.
      apikey: config.secretKey,
      Accept: accept
    },
    cache: "no-store",
    redirect: "manual"
  };
}

function bucketRequest(config) {
  return {
    url: new URL(`${STORAGE_API_PATH}/bucket/${encodeURIComponent(config.bucket)}`, config.origin),
    init: requestInit(config)
  };
}

function objectRequest(config, operation, objectKey) {
  const path = encodeObjectKey(objectKey);
  if (!path) throw new Error("invalid_storage_object_key");
  const url = new URL(
    `${STORAGE_API_PATH}/object/${operation}/${encodeURIComponent(config.bucket)}/${path}`,
    config.origin
  );
  return { url, init: requestInit(config, operation === "info" ? "application/json" : "*/*") };
}

function encodeObjectKey(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return null;
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((part) => part === "" || part === "." || part === "..")) return null;
  return segments.map(encodeURIComponent).join("/");
}

/** Confirm the configured bucket still exists and is explicitly non-public. */
async function privateBucketConfirmed(config, fetchImpl) {
  const request = bucketRequest(config);
  const response = await fetchImpl(request.url, request.init);
  if (!response.ok) return false;
  const bucket = await response.json().catch(() => null);
  return bucket?.id === config.bucket && bucket?.public === false;
}

/** Check object metadata without creating or returning a URL usable by a buyer. */
export async function hasPrivateObject(env, objectKey, fetchImpl = fetch) {
  const config = storageConfig(env);
  const request = objectRequest(config, "info", objectKey);
  if (!await privateBucketConfirmed(config, fetchImpl)) return false;
  const response = await fetchImpl(request.url, request.init);
  if (response.status === 404) return false;
  return response.ok;
}

/** Stream a private object through the Worker; never return a Supabase URL. */
export async function getPrivateObject(env, objectKey, fetchImpl = fetch) {
  const config = storageConfig(env);
  const request = objectRequest(config, "authenticated", objectKey);
  if (!await privateBucketConfirmed(config, fetchImpl)) throw new Error("supabase_bucket_not_private");
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

