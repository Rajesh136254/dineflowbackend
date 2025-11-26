-- Database schema for Restaurant QR Ordering System

-- Add the group_id column if it doesn't exist (will fail harmlessly if it already exists)
ALTER TABLE restaurant_tables ADD COLUMN group_id INT NULL;

-- Create table_groups table if it doesn't exist
CREATE TABLE IF NOT EXISTS table_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default "Non AC" group
INSERT IGNORE INTO table_groups (name) VALUES ('Non AC');

-- Tables table (with group_id for new DBs)
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_number INTEGER UNIQUE NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    group_id INT NULL,
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

-- Insert default tables (omit group_id - defaults to NULL)
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




-- Add customer_id column to orders table
ALTER TABLE orders ADD COLUMN customer_id INT NULL;

-- Add staff_id column to orders table
ALTER TABLE orders ADD COLUMN staff_id INT NULL;

-- Add preparation_time column to orders table
ALTER TABLE orders ADD COLUMN preparation_time INT NULL COMMENT 'Preparation time in minutes';

-- Add service_time column to orders table
ALTER TABLE orders ADD COLUMN service_time INT NULL COMMENT 'Service time in minutes';

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    hire_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create ingredients table
CREATE TABLE IF NOT EXISTS ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    unit VARCHAR(20) NOT NULL,
    current_stock DECIMAL(10, 2) NOT NULL,
    min_stock_level DECIMAL(10, 2) NOT NULL,
    cost_per_unit DECIMAL(10, 2) NOT NULL,
    supplier VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create recipe_items table
CREATE TABLE IF NOT EXISTS recipe_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    menu_item_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Create waste_log table
CREATE TABLE IF NOT EXISTS waste_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id INT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Insert sample staff data
INSERT IGNORE INTO staff (name, role, email, phone, hire_date) VALUES
('John Doe', 'Chef', 'john.doe@restaurant.com', '1234567890', '2022-01-15'),
('Jane Smith', 'Waiter', 'jane.smith@restaurant.com', '1234567891', '2022-02-20'),
('Mike Johnson', 'Chef', 'mike.johnson@restaurant.com', '1234567892', '2022-03-10'),
('Sarah Williams', 'Waiter', 'sarah.williams@restaurant.com', '1234567893', '2022-04-05');

-- Insert sample ingredients data
INSERT IGNORE INTO ingredients (name, description, unit, current_stock, min_stock_level, cost_per_unit, supplier) VALUES
('Tomatoes', 'Fresh red tomatoes', 'kg', 20, 5, 2.50, 'Local Farm'),
('Onions', 'Fresh white onions', 'kg', 15, 3, 1.80, 'Local Farm'),
('Chicken', 'Fresh chicken breast', 'kg', 25, 5, 8.00, 'Meat Supplier'),
('Rice', 'Basmati rice', 'kg', 50, 10, 3.50, 'Grain Supplier'),
('Flour', 'All-purpose flour', 'kg', 30, 5, 2.00, 'Grain Supplier'),
('Cheese', 'Mozzarella cheese', 'kg', 10, 2, 12.00, 'Dairy Farm'),
('Eggs', 'Free-range eggs', 'dozen', 20, 5, 4.50, 'Egg Farm'),
('Milk', 'Fresh milk', 'liter', 15, 3, 2.80, 'Dairy Farm');

-- Insert sample recipe_items data
INSERT IGNORE INTO recipe_items (menu_item_id, ingredient_id, quantity) VALUES
(1, 1, 0.2), -- Margherita Pizza - Tomatoes
(1, 6, 0.15), -- Margherita Pizza - Cheese
(1, 5, 0.3), -- Margherita Pizza - Flour
(1, 7, 0.1), -- Margherita Pizza - Eggs
(2, 3, 0.25), -- Chicken Biryani - Chicken
(2, 4, 0.2), -- Chicken Biryani - Rice
(2, 2, 0.1), -- Chicken Biryani - Onions
(3, 3, 0.2), -- Paneer Tikka - Paneer (assuming we add paneer as an ingredient)
(3, 1, 0.1), -- Paneer Tikka - Tomatoes
(3, 2, 0.1), -- Paneer Tikka - Onions
(4, 1, 0.15), -- Caesar Salad - Tomatoes
(5, 4, 0.15), -- Masala Dosa - Rice
(5, 5, 0.1), -- Masala Dosa - Flour
(5, 7, 0.2); -- Masala Dosa - Eggs