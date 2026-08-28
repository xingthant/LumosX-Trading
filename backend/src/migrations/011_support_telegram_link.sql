-- A separate, admin-manageable Telegram link for customer support — distinct from the
-- promo channel link, since "Forgot password" sends users here to talk to a human
-- instead of a real password-reset flow.
ALTER TABLE telegram_promo_config ADD COLUMN support_telegram_url VARCHAR(500);
