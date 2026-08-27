-- Site branding (replaces the hardcoded "PaperTrade" name/logo) and a Telegram promo
-- widget (pinned button + join popup), both admin-configurable, singleton settings rows.

CREATE TABLE site_branding_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_name VARCHAR(100) NOT NULL DEFAULT 'PaperTrade',
    tagline VARCHAR(255) NOT NULL DEFAULT 'Simulated crypto trading. No real funds involved.',
    logo_data TEXT,
    logo_mime_type VARCHAR(100),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_branding_config (site_name, tagline) VALUES ('PaperTrade', 'Simulated crypto trading. No real funds involved.');

CREATE TABLE telegram_promo_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_url VARCHAR(500) NOT NULL DEFAULT 'https://t.me/',
    popup_title VARCHAR(255) NOT NULL DEFAULT 'Join our Telegram!',
    popup_message VARCHAR(1000) NOT NULL DEFAULT 'Get live updates, announcements, and support in our official Telegram channel.',
    button_text VARCHAR(100) NOT NULL DEFAULT 'Join Channel',
    is_active BOOLEAN NOT NULL DEFAULT false,
    show_popup BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO telegram_promo_config (telegram_url, is_active) VALUES ('https://t.me/', false);
