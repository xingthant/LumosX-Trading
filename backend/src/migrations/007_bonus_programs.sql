-- Registration bonus, referral program, and trading-volume milestone bonuses,
-- all admin-configurable.

ALTER TYPE tx_type ADD VALUE 'BONUS';

CREATE TABLE registration_bonus_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_symbol VARCHAR(20) NOT NULL DEFAULT 'USDT',
    amount NUMERIC(36, 18) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reg_bonus_amount_positive CHECK (amount > 0)
);

CREATE TABLE referral_program_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_bonus_amount NUMERIC(36, 18) NOT NULL,
    referee_bonus_amount NUMERIC(36, 18) NOT NULL,
    asset_symbol VARCHAR(20) NOT NULL DEFAULT 'USDT',
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_referral_amounts_nonneg CHECK (referrer_bonus_amount >= 0 AND referee_bonus_amount >= 0)
);

ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE;
UPDATE users SET referral_code = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE referral_code IS NULL;

CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    referrer_bonus_amount NUMERIC(36, 18),
    referee_bonus_amount NUMERIC(36, 18),
    asset_symbol VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

CREATE TABLE trading_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label VARCHAR(100) NOT NULL,
    target_volume NUMERIC(36, 18) NOT NULL,
    bonus_amount NUMERIC(36, 18) NOT NULL,
    bonus_asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
    is_repeatable BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_milestone_target_positive CHECK (target_volume > 0),
    CONSTRAINT chk_milestone_bonus_positive CHECK (bonus_amount > 0)
);

CREATE TABLE user_milestone_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    milestone_id UUID NOT NULL REFERENCES trading_milestones(id) ON DELETE CASCADE,
    claim_number INTEGER NOT NULL DEFAULT 1,
    volume_at_claim NUMERIC(36, 18) NOT NULL,
    bonus_amount NUMERIC(36, 18) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, milestone_id, claim_number)
);

CREATE INDEX idx_milestone_claims_user ON user_milestone_claims(user_id);
