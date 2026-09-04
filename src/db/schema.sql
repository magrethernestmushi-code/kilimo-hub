-- ══════════════════════════════════════════
--  Digital Kilimo Hub — Database Schema
--  Runs automatically on server startup (CREATE TABLE IF NOT EXISTS),
--  so there is no separate migration step to remember.
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('mkulima','dereva','biashara','admin')),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(200),
  region        VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  last_login    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS farmer_profiles (
  id              UUID PRIMARY KEY,
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_size       REAL DEFAULT 0,
  crops           TEXT DEFAULT '',
  farm_region     VARCHAR(100),
  payment_method  VARCHAR(50) DEFAULT 'M-Pesa',
  trust_score     INTEGER DEFAULT 500,
  tier            VARCHAR(20) DEFAULT 'Shaba',
  total_income    BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  id                UUID PRIMARY KEY,
  user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  truck_number      VARCHAR(20),
  truck_capacity    REAL DEFAULT 0,
  truck_type        VARCHAR(50) DEFAULT 'Lori',
  license_number    VARCHAR(50),
  license_expiry    TIMESTAMPTZ,
  rating            REAL DEFAULT 5.0,
  trips_completed   INTEGER DEFAULT 0,
  is_available      BOOLEAN DEFAULT true,
  current_location  VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS business_profiles (
  id                UUID PRIMARY KEY,
  user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name     VARCHAR(200),
  business_type     VARCHAR(100) DEFAULT 'Mfanyabiashara',
  tin_number        VARCHAR(50),
  business_region   VARCHAR(100),
  total_purchases   BIGINT DEFAULT 0,
  total_orders      INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS groups (
  id              UUID PRIMARY KEY,
  product         VARCHAR(200) NOT NULL,
  emoji           VARCHAR(10) DEFAULT '🌾',
  grade           VARCHAR(50) DEFAULT 'Daraja A',
  region          VARCHAR(100) NOT NULL,
  retail_price    REAL NOT NULL,
  group_price     REAL NOT NULL,
  savings_pct     INTEGER DEFAULT 0,
  target_members  INTEGER DEFAULT 20,
  current_members INTEGER DEFAULT 0,
  deadline        VARCHAR(50) DEFAULT 'Masaa 24',
  expires_at      TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'Hai' CHECK (status IN ('Hai','Imejaa','Imefungwa','Imekamilika')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS group_members (
  id          UUID PRIMARY KEY,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  farmer_id   UUID NOT NULL REFERENCES farmer_profiles(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, farmer_id)
);

CREATE TABLE IF NOT EXISTS logistics_trips (
  id              UUID PRIMARY KEY,
  driver_id       UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
  origin          VARCHAR(100) NOT NULL,
  destination     VARCHAR(100) NOT NULL,
  truck_number    VARCHAR(20),
  capacity_tons   REAL DEFAULT 0,
  eta             VARCHAR(100),
  departure_time  TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'Inasubiri' CHECK (status IN ('Inasubiri','Imehifadhiwa','Safarini','Imekamilika')),
  booked_by       UUID REFERENCES users(id),
  pickup_lat      DOUBLE PRECISION,
  pickup_lng      DOUBLE PRECISION,
  current_lat     DOUBLE PRECISION,
  current_lng     DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  cargo_desc      TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  emoji         VARCHAR(10) DEFAULT '🌾',
  grade         VARCHAR(50) DEFAULT 'Daraja A',
  region        VARCHAR(100),
  retail_price  REAL DEFAULT 0,
  group_price   REAL DEFAULT 0,
  stock_kg      REAL DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY,
  buyer_id      UUID REFERENCES business_profiles(id),
  product_id    UUID REFERENCES products(id),
  quantity_kg   REAL NOT NULL,
  unit_price    REAL NOT NULL,
  total_price   REAL NOT NULL,
  status        VARCHAR(50) DEFAULT 'Inasubiri',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_prices (
  id            UUID PRIMARY KEY,
  crop          VARCHAR(200) NOT NULL,
  grade         VARCHAR(50) DEFAULT 'Daraja A',
  price_tzs     REAL NOT NULL,
  price_usd     REAL,
  change_pct    REAL DEFAULT 0,
  trending_up   BOOLEAN DEFAULT true,
  market_name   VARCHAR(100) NOT NULL,
  export_price  VARCHAR(50) DEFAULT '—',
  updated_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  bank_name       VARCHAR(100) NOT NULL,
  amount          BIGINT NOT NULL,
  interest_rate   VARCHAR(10) DEFAULT '8%',
  purpose         VARCHAR(200) DEFAULT 'Kilimo',
  trust_score     INTEGER DEFAULT 500,
  status          VARCHAR(20) DEFAULT 'Inasubiri' CHECK (status IN ('Inasubiri','Imeidhinishwa','Imekataliwa','Imelipwa')),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users(id),
  type            VARCHAR(100) NOT NULL,
  amount          BIGINT DEFAULT 0,
  payment_method  VARCHAR(50) DEFAULT 'M-Pesa',
  reference       VARCHAR(100),
  status          VARCHAR(20) DEFAULT 'Inasubiri' CHECK (status IN ('Inasubiri','Imekamilika','Imeshindwa')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY,
  alert_type  VARCHAR(100) NOT NULL,
  level       VARCHAR(20) NOT NULL CHECK (level IN ('Hatari','Angalizo','Habari Njema')),
  region      VARCHAR(100) NOT NULL,
  message     TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  sender_id   UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_phone          ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role            ON users(role);
CREATE INDEX IF NOT EXISTS idx_group_members_group   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_farmer  ON group_members(farmer_id);
CREATE INDEX IF NOT EXISTS idx_groups_status         ON groups(status);
CREATE INDEX IF NOT EXISTS idx_trips_status          ON logistics_trips(status);
CREATE INDEX IF NOT EXISTS idx_loans_user            ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status          ON loans(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user     ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_region         ON alerts(region);
CREATE INDEX IF NOT EXISTS idx_alerts_active         ON alerts(is_active);

-- Safe migrations for databases created before a column existed (won't affect fresh installs)
ALTER TABLE logistics_trips ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION;
ALTER TABLE logistics_trips ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION;
ALTER TABLE logistics_trips ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION;
ALTER TABLE logistics_trips ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION;
ALTER TABLE logistics_trips ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION;
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
