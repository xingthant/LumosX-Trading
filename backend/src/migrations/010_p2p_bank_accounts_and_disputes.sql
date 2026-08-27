-- Adds a free-text note to saved payment methods (shared by withdrawal payout methods
-- and the bank accounts a P2P merchant exposes to buyers), lets a SELL ad reference up
-- to 7 of the merchant's saved bank accounts instead of only a free-text label, snapshots
-- the buyer's chosen bank's details onto the order (so they survive the source method
-- later being edited or deleted), and lets a dispute be cancelled by whoever opened it.

ALTER TABLE user_payment_methods ADD COLUMN note TEXT;

ALTER TABLE p2p_ads ADD COLUMN bank_method_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE p2p_orders ADD COLUMN bank_name VARCHAR(255);
ALTER TABLE p2p_orders ADD COLUMN bank_account_holder VARCHAR(255);
ALTER TABLE p2p_orders ADD COLUMN bank_account_number VARCHAR(100);
ALTER TABLE p2p_orders ADD COLUMN bank_note TEXT;

ALTER TABLE p2p_orders ADD COLUMN disputed_by UUID REFERENCES users(id);
ALTER TABLE p2p_orders ADD COLUMN pre_dispute_status p2p_order_status;
