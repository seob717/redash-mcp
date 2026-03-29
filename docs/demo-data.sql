-- ============================================================
-- Redash MCP Demo Data (uses demo schema to avoid conflicts)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS demo;

DROP TABLE IF EXISTS demo.payments CASCADE;
DROP TABLE IF EXISTS demo.order_items CASCADE;
DROP TABLE IF EXISTS demo.orders CASCADE;
DROP TABLE IF EXISTS demo.products CASCADE;
DROP TABLE IF EXISTS demo.customers CASCADE;

-- 1. customers (200 rows)
CREATE TABLE demo.customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(30),
    country VARCHAR(50) NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'free',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    last_login_at TIMESTAMP,
    notes TEXT
);

INSERT INTO demo.customers (name, email, phone, country, tier, is_active, created_at, last_login_at, notes) VALUES
('Alice Johnson', 'alice@example.com', '+1-555-0101', 'US', 'premium', TRUE, '2025-01-05 09:30:00', '2026-03-28 14:20:00', NULL),
('Bob Smith', 'bob@example.com', '+1-555-0102', 'US', 'basic', TRUE, '2025-01-10 11:00:00', '2026-03-27 10:15:00', NULL),
('Yuki Tanaka', 'yuki@example.jp', '+81-90-1234-5678', 'JP', 'enterprise', TRUE, '2025-01-15 03:45:00', '2026-03-28 08:00:00', 'Key enterprise client'),
('Maria Garcia', 'maria@example.es', '+34-612-345-678', 'ES', 'premium', TRUE, '2025-01-20 16:00:00', '2026-03-25 12:30:00', NULL),
('Chen Wei', 'chen@example.cn', '+86-138-0000-1234', 'CN', 'basic', TRUE, '2025-02-01 07:20:00', '2026-03-20 09:00:00', NULL),
('Emma Wilson', 'emma@example.co.uk', '+44-7700-900123', 'GB', 'free', TRUE, '2025-02-05 14:10:00', '2026-03-15 16:45:00', NULL),
('Hans Mueller', 'hans@example.de', '+49-170-1234567', 'DE', 'premium', TRUE, '2025-02-10 08:30:00', '2026-03-28 11:00:00', NULL),
('Sofia Rossi', 'sofia@example.it', '+39-333-1234567', 'IT', 'basic', TRUE, '2025-02-14 10:00:00', '2026-03-22 13:20:00', 'Referred by Maria'),
('Park Jimin', 'jimin@example.kr', '+82-10-1234-5678', 'KR', 'enterprise', TRUE, '2025-02-20 05:15:00', '2026-03-28 07:30:00', NULL),
('Priya Sharma', 'priya@example.in', '+91-98765-43210', 'IN', 'free', TRUE, '2025-03-01 12:00:00', '2026-03-10 08:45:00', NULL),
('Lucas Martin', 'lucas@example.fr', '+33-6-12-34-56-78', 'FR', 'basic', TRUE, '2025-03-05 09:20:00', '2026-03-18 14:00:00', NULL),
('Ana Silva', 'ana@example.br', '+55-11-98765-4321', 'BR', 'premium', TRUE, '2025-03-10 15:30:00', '2026-03-26 10:10:00', NULL),
('Ahmed Hassan', 'ahmed@example.eg', '+20-100-123-4567', 'EG', 'free', FALSE, '2025-03-15 11:00:00', '2025-06-20 09:00:00', 'Churned - pricing concerns'),
('Olga Petrova', 'olga@example.ru', '+7-916-123-45-67', 'RU', 'basic', TRUE, '2025-03-20 06:45:00', '2026-03-24 15:30:00', NULL),
('James Brown', 'james@example.com.au', '+61-412-345-678', 'AU', 'premium', TRUE, '2025-04-01 02:30:00', '2026-03-28 04:00:00', NULL);

INSERT INTO demo.customers (name, email, phone, country, tier, is_active, created_at, last_login_at, notes)
SELECT
    'User ' || i,
    'user' || i || '@example.com',
    CASE WHEN i % 5 = 0 THEN NULL ELSE '+1-555-' || LPAD(i::TEXT, 4, '0') END,
    (ARRAY['US','GB','DE','JP','KR','FR','BR','IN','AU','CA','ES','IT','NL','SE','SG'])[1 + (i % 15)],
    (ARRAY['free','basic','premium','enterprise'])[1 + (i % 4)],
    CASE WHEN i % 20 = 0 THEN FALSE ELSE TRUE END,
    '2025-01-01'::TIMESTAMP + (i * INTERVAL '2 days') + (i * INTERVAL '3 hours'),
    CASE WHEN i % 20 = 0 THEN NULL
        ELSE '2026-03-01'::TIMESTAMP + ((i % 28) * INTERVAL '1 day') + (i * INTERVAL '1 hour')
    END,
    CASE WHEN i % 30 = 0 THEN 'Bulk-imported account' ELSE NULL END
FROM generate_series(16, 200) AS s(i);

-- 2. products (50 rows)
CREATE TABLE demo.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(50),
    price NUMERIC(10,2) NOT NULL,
    cost NUMERIC(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    description TEXT
);

INSERT INTO demo.products (name, category, subcategory, price, cost, stock, is_available, created_at, description) VALUES
('Wireless Mouse', 'Electronics', 'Accessories', 29.99, 12.00, 500, TRUE, '2025-01-01', 'Ergonomic wireless mouse with USB receiver'),
('Mechanical Keyboard', 'Electronics', 'Accessories', 89.99, 35.00, 200, TRUE, '2025-01-01', 'Cherry MX Blue switches, RGB backlight'),
('USB-C Hub 7-in-1', 'Electronics', 'Accessories', 49.99, 18.00, 350, TRUE, '2025-01-01', NULL),
('27 inch 4K Monitor', 'Electronics', 'Displays', 399.99, 220.00, 80, TRUE, '2025-01-15', 'IPS panel, 60Hz, USB-C input'),
('24 inch FHD Monitor', 'Electronics', 'Displays', 199.99, 110.00, 150, TRUE, '2025-01-15', NULL),
('Laptop Stand', 'Electronics', 'Accessories', 39.99, 15.00, 400, TRUE, '2025-02-01', 'Aluminum, adjustable height'),
('Webcam 1080p', 'Electronics', 'Cameras', 59.99, 22.00, 300, TRUE, '2025-02-01', NULL),
('Noise-Cancelling Headphones', 'Electronics', 'Audio', 249.99, 95.00, 120, TRUE, '2025-02-15', 'ANC, 30hr battery, Bluetooth 5.3'),
('Portable Speaker', 'Electronics', 'Audio', 79.99, 30.00, 250, TRUE, '2025-02-15', 'Waterproof IPX7'),
('USB Microphone', 'Electronics', 'Audio', 129.99, 50.00, 180, TRUE, '2025-03-01', 'Cardioid condenser, studio quality'),
('A4 Notebook 5-pack', 'Office', 'Stationery', 12.99, 4.00, 1000, TRUE, '2025-01-01', NULL),
('Ballpoint Pens 10-pack', 'Office', 'Stationery', 8.99, 2.50, 2000, TRUE, '2025-01-01', NULL),
('Desk Organizer', 'Office', 'Furniture', 24.99, 10.00, 300, TRUE, '2025-01-15', 'Bamboo, 5 compartments'),
('Ergonomic Chair', 'Office', 'Furniture', 349.99, 180.00, 50, TRUE, '2025-02-01', 'Lumbar support, adjustable armrests'),
('Standing Desk Converter', 'Office', 'Furniture', 199.99, 90.00, 75, TRUE, '2025-02-01', NULL),
('Whiteboard 60x90cm', 'Office', 'Supplies', 44.99, 18.00, 100, TRUE, '2025-03-01', 'Magnetic, includes markers'),
('Paper Shredder', 'Office', 'Equipment', 89.99, 45.00, 60, TRUE, '2025-03-01', 'Cross-cut, 8-sheet capacity'),
('Label Maker', 'Office', 'Equipment', 34.99, 14.00, 200, TRUE, '2025-03-15', NULL),
('Filing Cabinet 3-Drawer', 'Office', 'Furniture', 149.99, 70.00, 40, TRUE, '2025-04-01', 'Steel, lockable'),
('Discontinued Widget', 'Electronics', 'Accessories', 19.99, 8.00, 0, FALSE, '2025-01-01', 'No longer manufactured');

INSERT INTO demo.products (name, category, subcategory, price, cost, stock, is_available, created_at)
SELECT
    (ARRAY['Premium','Basic','Pro','Ultra','Mini'])[1 + (i % 5)] || ' ' ||
    (ARRAY['Cable','Adapter','Case','Charger','Battery','Dock','Mount','Cover','Film','Clip'])[1 + (i % 10)],
    CASE WHEN i % 2 = 0 THEN 'Electronics' ELSE 'Office' END,
    CASE WHEN i % 2 = 0
        THEN (ARRAY['Accessories','Audio','Cables'])[1 + (i % 3)]
        ELSE (ARRAY['Stationery','Supplies','Equipment'])[1 + (i % 3)]
    END,
    ROUND((5 + random() * 95)::NUMERIC, 2),
    ROUND((2 + random() * 40)::NUMERIC, 2),
    (50 + (i * 13) % 500),
    TRUE,
    '2025-01-01'::TIMESTAMP + (i * INTERVAL '7 days')
FROM generate_series(21, 50) AS s(i);

-- 3. orders (350 rows)
CREATE TABLE demo.orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES demo.customers(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_pct NUMERIC(5,2) DEFAULT 0,
    shipping_address TEXT,
    ordered_at TIMESTAMP NOT NULL,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    notes TEXT
);

INSERT INTO demo.orders (customer_id, status, total_amount, discount_pct, shipping_address, ordered_at, shipped_at, delivered_at, notes)
SELECT
    1 + (i % 200),
    (ARRAY['pending','confirmed','shipped','delivered','delivered','delivered','cancelled','refunded'])[1 + (i % 8)],
    0,
    CASE WHEN i % 10 = 0 THEN 10.00 WHEN i % 7 = 0 THEN 5.00 ELSE 0 END,
    'Street ' || i || ', City ' || (i % 50),
    '2025-01-15'::TIMESTAMP + (i * INTERVAL '1 day 4 hours'),
    CASE
        WHEN (ARRAY['pending','confirmed','shipped','delivered','delivered','delivered','cancelled','refunded'])[1 + (i % 8)]
            IN ('shipped','delivered') THEN '2025-01-15'::TIMESTAMP + (i * INTERVAL '1 day 4 hours') + INTERVAL '2 days'
        ELSE NULL
    END,
    CASE
        WHEN (ARRAY['pending','confirmed','shipped','delivered','delivered','delivered','cancelled','refunded'])[1 + (i % 8)]
            = 'delivered' THEN '2025-01-15'::TIMESTAMP + (i * INTERVAL '1 day 4 hours') + INTERVAL '5 days'
        ELSE NULL
    END,
    CASE WHEN i % 25 = 0 THEN 'Gift order - wrap requested' ELSE NULL END
FROM generate_series(1, 350) AS s(i);

-- 4. order_items (~700 rows)
CREATE TABLE demo.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES demo.orders(id),
    product_id INTEGER NOT NULL REFERENCES demo.products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL
);

INSERT INTO demo.order_items (order_id, product_id, quantity, unit_price, subtotal)
SELECT
    o.id,
    1 + ((o.id + gs.n) % 50),
    1 + ((o.id + gs.n) % 3),
    p.price,
    p.price * (1 + ((o.id + gs.n) % 3))
FROM demo.orders o
CROSS JOIN LATERAL generate_series(1, 1 + (o.id % 3)) AS gs(n)
JOIN demo.products p ON p.id = 1 + ((o.id + gs.n) % 50);

UPDATE demo.orders o
SET total_amount = COALESCE(sub.total, 0) * (1 - o.discount_pct / 100)
FROM (
    SELECT order_id, SUM(subtotal) AS total
    FROM demo.order_items
    GROUP BY order_id
) sub
WHERE o.id = sub.order_id;

-- 5. payments (350+ rows)
CREATE TABLE demo.payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES demo.orders(id),
    method VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    amount NUMERIC(12,2) NOT NULL,
    transaction_ref VARCHAR(64),
    failure_reason TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO demo.payments (order_id, method, status, amount, transaction_ref, paid_at, created_at)
SELECT
    o.id,
    (ARRAY['credit_card','credit_card','credit_card','debit_card','paypal','bank_transfer','apple_pay'])[1 + (o.id % 7)],
    CASE
        WHEN o.status IN ('cancelled','refunded') THEN 'refunded'
        ELSE 'completed'
    END,
    o.total_amount,
    'TXN-' || MD5(o.id::TEXT || '-pay'),
    o.ordered_at + INTERVAL '1 minute',
    o.ordered_at
FROM demo.orders o
WHERE o.status != 'pending';

INSERT INTO demo.payments (order_id, method, status, amount, transaction_ref, failure_reason, created_at)
SELECT
    o.id,
    'credit_card',
    'failed',
    o.total_amount,
    'TXN-' || MD5(o.id::TEXT || '-fail'),
    (ARRAY['Insufficient funds','Card expired','Bank declined','Network timeout'])[1 + (o.id % 4)],
    o.ordered_at - INTERVAL '5 minutes'
FROM demo.orders o
WHERE o.id % 20 = 0;

-- Indexes
CREATE INDEX idx_customers_country ON demo.customers(country);
CREATE INDEX idx_customers_tier ON demo.customers(tier);
CREATE INDEX idx_products_category ON demo.products(category);
CREATE INDEX idx_orders_customer_id ON demo.orders(customer_id);
CREATE INDEX idx_orders_status ON demo.orders(status);
CREATE INDEX idx_orders_ordered_at ON demo.orders(ordered_at);
CREATE INDEX idx_order_items_order_id ON demo.order_items(order_id);
CREATE INDEX idx_payments_order_id ON demo.payments(order_id);
