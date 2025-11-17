-- Database schema for Restaurant QR Ordering System

-- Make sure the menu_items table has a category column

-- Tables table to manage restaurant tables
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_number INTEGER UNIQUE NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    qr_code_data TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_inr DECIMAL(10, 2) NOT NULL,
    price_usd DECIMAL(10, 2) NOT NULL,
    category VARCHAR(100),
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INTEGER,
    table_number INTEGER NOT NULL,
    total_amount_inr DECIMAL(10, 2) NOT NULL,
    total_amount_usd DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_method VARCHAR(20) DEFAULT 'cash',
    payment_status VARCHAR(20) DEFAULT 'pending',
    order_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES restaurant_tables(id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INTEGER,
    menu_item_id INTEGER,
    item_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL,
    price_inr DECIMAL(10, 2) NOT NULL,
    price_usd DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default tables (10 tables)
INSERT IGNORE INTO restaurant_tables (table_number, table_name, qr_code_data) VALUES
(1, 'Table 1', 'table-1'),
(2, 'Table 2', 'table-2'),
(3, 'Table 3', 'table-3'),
(4, 'Table 4', 'table-4'),
(5, 'Table 5', 'table-5'),
(6, 'Table 6', 'table-6'),
(7, 'Table 7', 'table-7'),
(8, 'Table 8', 'table-8'),
(9, 'Table 9', 'table-9'),
(10, 'Table 10', 'table-10');

-- Insert sample menu items
INSERT IGNORE INTO menu_items (name, description, price_inr, price_usd, category, is_available) VALUES
('Margherita Pizza', 'Classic pizza with tomato, mozzarella, and basil', 299.00, 3.99, 'Main Course', true),
('Chicken Biryani', 'Aromatic rice dish with spiced chicken', 349.00, 4.49, 'Main Course', true),
('Paneer Tikka', 'Grilled cottage cheese with Indian spices', 249.00, 3.29, 'Appetizer', true),
('Caesar Salad', 'Fresh romaine lettuce with Caesar dressing', 199.00, 2.69, 'Salad', true),
('Masala Dosa', 'Crispy rice crepe with potato filling', 149.00, 1.99, 'Main Course', true),
('Chocolate Brownie', 'Rich chocolate dessert with ice cream', 179.00, 2.39, 'Dessert', true),
('Mango Lassi', 'Traditional yogurt-based mango drink', 89.00, 1.19, 'Beverage', true),
('Coffee', 'Freshly brewed coffee', 79.00, 1.09, 'Beverage', true);