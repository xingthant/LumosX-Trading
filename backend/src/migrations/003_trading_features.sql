-- Short-term (binary-style) trades, admin-configurable durations, per-user/per-coin
-- outcome overrides, and Explore-tab promotions.

CREATE TYPE trade_direction AS ENUM ('UP', 'DOWN');
CREATE TYPE trade_outcome AS ENUM ('PENDING', 'WIN', 'LOSE', 'PUSH');
CREATE TYPE forced_outcome AS ENUM ('BULL', 'BEAR');

CREATE TABLE trade_durations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(50) NOT NULL,
    seconds INTEGER NOT NULL,
    payout_multiplier NUMERIC(6, 3) NOT NULL DEFAULT 1.8,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_seconds_positive CHECK (seconds > 0),
    CONSTRAINT chk_multiplier_positive CHECK (payout_multiplier > 1)
);

INSERT INTO trade_durations (label, seconds, payout_multiplier, sort_order) VALUES
    ('30 Seconds', 30, 1.50, 1),
    ('60 Seconds', 60, 1.60, 2),
    ('5 Minutes', 300, 1.70, 3),
    ('30 Minutes', 1800, 1.80, 4),
    ('1 Hour', 3600, 1.85, 5),
    ('12 Hours', 43200, 1.90, 6),
    ('1 Day', 86400, 1.95, 7),
    ('7 Days', 604800, 2.00, 8);

CREATE TABLE short_term_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pair VARCHAR(20) NOT NULL,
    direction trade_direction NOT NULL,
    duration_id UUID NOT NULL REFERENCES trade_durations(id),
    duration_label VARCHAR(50) NOT NULL,
    stake_asset VARCHAR(20) NOT NULL,
    stake_amount NUMERIC(36, 18) NOT NULL,
    payout_multiplier NUMERIC(6, 3) NOT NULL,
    entry_price NUMERIC(36, 18) NOT NULL,
    settlement_price NUMERIC(36, 18),
    outcome trade_outcome NOT NULL DEFAULT 'PENDING',
    payout_amount NUMERIC(36, 18),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    CONSTRAINT chk_stake_positive CHECK (stake_amount > 0)
);

CREATE INDEX idx_str_trades_user ON short_term_trades(user_id);
CREATE INDEX idx_str_trades_pending_expiry ON short_term_trades(expiry_at) WHERE outcome = 'PENDING';

-- Admin-forced outcome bias: a matching row forces the settlement direction regardless of
-- actual price movement. NULL user_id / pair means "applies to all users" / "all coins".
CREATE TABLE trade_outcome_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pair VARCHAR(20),
    forced_outcome forced_outcome NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outcome_overrides_lookup ON trade_outcome_overrides(user_id, pair) WHERE is_active = true;

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    badge_text VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotions_active ON promotions(is_active);
