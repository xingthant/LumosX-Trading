-- Withdrawal (funds) password, merchant flag, user-bound payout methods, and P2P exchange.

ALTER TABLE users ADD COLUMN withdrawal_password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN is_merchant BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE payment_method_type AS ENUM ('CRYPTO_WALLET', 'BANK_ACCOUNT');

CREATE TABLE user_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type payment_method_type NOT NULL,
    label VARCHAR(100) NOT NULL,
    asset_symbol VARCHAR(20),
    wallet_address VARCHAR(255),
    network VARCHAR(50),
    bank_name VARCHAR(255),
    account_holder VARCHAR(255),
    account_number VARCHAR(100),
    iban VARCHAR(100),
    swift_code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_methods_user ON user_payment_methods(user_id);

ALTER TABLE transactions ADD COLUMN payment_method_id UUID REFERENCES user_payment_methods(id);

-- P2P exchange: merchants post ads, other users take them, crypto is escrowed on the
-- platform while fiat settles off-platform (bank transfer, etc.), same as real P2P desks.

CREATE TYPE p2p_ad_side AS ENUM ('BUY', 'SELL');
CREATE TYPE p2p_ad_status AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE p2p_order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED', 'DISPUTED');

CREATE TABLE p2p_ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side p2p_ad_side NOT NULL,
    asset_symbol VARCHAR(20) NOT NULL,
    fiat_symbol VARCHAR(10) NOT NULL DEFAULT 'USD',
    price NUMERIC(36, 18) NOT NULL,
    min_amount NUMERIC(36, 18) NOT NULL,
    max_amount NUMERIC(36, 18) NOT NULL,
    available_amount NUMERIC(36, 18) NOT NULL,
    payment_window_minutes INTEGER NOT NULL DEFAULT 15,
    payment_methods TEXT[] NOT NULL DEFAULT '{}',
    terms TEXT,
    status p2p_ad_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_p2p_price_positive CHECK (price > 0),
    CONSTRAINT chk_p2p_amounts CHECK (min_amount > 0 AND max_amount >= min_amount AND available_amount >= 0)
);

CREATE INDEX idx_p2p_ads_browse ON p2p_ads(side, asset_symbol, status);
CREATE INDEX idx_p2p_ads_merchant ON p2p_ads(merchant_id);

CREATE TABLE p2p_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_id UUID NOT NULL REFERENCES p2p_ads(id),
    merchant_id UUID NOT NULL REFERENCES users(id),
    taker_id UUID NOT NULL REFERENCES users(id),
    ad_side p2p_ad_side NOT NULL,
    asset_symbol VARCHAR(20) NOT NULL,
    fiat_symbol VARCHAR(10) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    total_fiat NUMERIC(36, 18) NOT NULL,
    payment_method TEXT,
    status p2p_order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_deadline TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT chk_p2p_order_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_p2p_orders_taker ON p2p_orders(taker_id);
CREATE INDEX idx_p2p_orders_merchant ON p2p_orders(merchant_id);
CREATE INDEX idx_p2p_orders_pending_deadline ON p2p_orders(payment_deadline) WHERE status = 'PENDING_PAYMENT';

CREATE TABLE p2p_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_p2p_messages_order ON p2p_messages(order_id);
