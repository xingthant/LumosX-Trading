-- Initial schema for the virtual crypto trading platform (paper trading)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
CREATE TYPE order_type AS ENUM ('MARKET', 'LIMIT');
CREATE TYPE order_side AS ENUM ('BUY', 'SELL');
CREATE TYPE order_status AS ENUM ('OPEN', 'FILLED', 'CANCELED', 'PARTIALLY_FILLED');
CREATE TYPE tx_type AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'ADMIN_CREDIT', 'ADMIN_DEBIT');
CREATE TYPE tx_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_symbol VARCHAR(20) NOT NULL,
    available_balance NUMERIC(36, 18) NOT NULL DEFAULT 0,
    locked_balance NUMERIC(36, 18) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, asset_symbol),
    CONSTRAINT chk_available_nonneg CHECK (available_balance >= 0),
    CONSTRAINT chk_locked_nonneg CHECK (locked_balance >= 0)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pair VARCHAR(20) NOT NULL,
    type order_type NOT NULL,
    side order_side NOT NULL,
    price NUMERIC(36, 18),
    amount NUMERIC(36, 18) NOT NULL,
    filled_amount NUMERIC(36, 18) NOT NULL DEFAULT 0,
    status order_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    filled_at TIMESTAMPTZ,
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_limit_has_price CHECK (type = 'MARKET' OR price IS NOT NULL)
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_open_pair ON orders(pair, status) WHERE status IN ('OPEN', 'PARTIALLY_FILLED');

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type tx_type NOT NULL,
    asset_symbol VARCHAR(20) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    status tx_status NOT NULL DEFAULT 'PENDING',
    admin_id UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tx_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);

CREATE TABLE price_overrides (
    pair VARCHAR(20) PRIMARY KEY,
    custom_price NUMERIC(36, 18) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES users(id),
    target_user_id UUID REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    amount NUMERIC(36, 18),
    asset_symbol VARCHAR(20),
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_target ON admin_audit_logs(target_user_id);

-- Seed a default admin user (email: admin@example.com / password: Admin123!)
-- Change this password immediately in any non-local environment.
INSERT INTO users (email, password_hash, role)
VALUES ('admin@example.com', '$2a$10$j6LxxroUqiCS4tbJo20CNu8VuqZCM7SqAldIAkItJ9gvtXH.BntzS', 'ADMIN')
ON CONFLICT DO NOTHING;
