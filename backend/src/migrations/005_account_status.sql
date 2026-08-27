-- Account freeze/suspend support, so admins can lock out a user without destroying
-- their financial history (hard-deleting a user with orders/transactions is blocked
-- by foreign key constraints and should be — freezing is the safe equivalent).

ALTER TABLE users ADD COLUMN is_frozen BOOLEAN NOT NULL DEFAULT false;
