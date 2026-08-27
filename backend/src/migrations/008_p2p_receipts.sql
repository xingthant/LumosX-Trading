-- Payment-proof receipts for P2P orders (buyer uploads proof of transfer to the seller,
-- same as Binance P2P's "upload payment receipt" step).

CREATE TABLE p2p_order_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_p2p_receipts_order ON p2p_order_receipts(order_id);
