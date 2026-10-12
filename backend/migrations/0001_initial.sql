PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor > 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  final_pdf_key TEXT,
  artifact_kind TEXT NOT NULL DEFAULT 'missing'
    CHECK (artifact_kind IN ('missing', 'test-placeholder', 'final')),
  download_ttl_seconds INTEGER NOT NULL DEFAULT 86400
    CHECK (download_ttl_seconds > 0),
  download_limit INTEGER NOT NULL DEFAULT 3 CHECK (download_limit > 0),
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO product_config
  (id, name, price_minor, currency, final_pdf_key, artifact_kind,
   download_ttl_seconds, download_limit, updated_at)
VALUES
  ('pp-walking-guide-v1', 'Puerto Plata on Foot', NULL, NULL, NULL,
   'missing', 86400, 3, unixepoch());

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  client_request_id TEXT NOT NULL,
  provider_checkout_id TEXT,
  provider_checkout_url TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'failed', 'refunded')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  receipt_token_hash TEXT NOT NULL,
  download_token_hash TEXT,
  download_token_cipher TEXT,
  paid_at INTEGER,
  download_expires_at INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  download_limit INTEGER NOT NULL CHECK (download_limit > 0),
  download_ttl_seconds INTEGER NOT NULL CHECK (download_ttl_seconds > 0),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, client_request_id),
  UNIQUE (provider, provider_checkout_id),
  UNIQUE (provider, provider_payment_id),
  UNIQUE (receipt_token_hash)
);

CREATE INDEX IF NOT EXISTS orders_receipt_hash_idx
  ON orders (receipt_token_hash);
CREATE INDEX IF NOT EXISTS orders_download_hash_idx
  ON orders (download_token_hash);

CREATE TABLE IF NOT EXISTS payment_events (
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  event_id TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);
