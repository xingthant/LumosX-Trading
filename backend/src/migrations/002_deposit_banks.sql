-- Bank accounts admins publish for users to send deposits to.

CREATE TABLE deposit_banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_name VARCHAR(255) NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    iban VARCHAR(100),
    swift_code VARCHAR(50),
    currency VARCHAR(20) NOT NULL,
    instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deposit_banks_active ON deposit_banks(is_active);
