-- Lets a user sign in/register with Google instead of an email+password. A Google-only
-- account has no password_hash; if the Google email matches an existing account, the
-- Google identity is linked onto it rather than creating a duplicate user.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
