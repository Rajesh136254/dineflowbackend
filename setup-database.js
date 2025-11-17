const mysql = require('mysql2/promise');

async function setupDatabase() {
  try {
    // Create connection to MySQL server (without specifying database)
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'Rajesh',
      password: 'Rajesh@254'
    });

    // Try to create the database (this might fail if user doesn't have permission)
    try {
      await connection.query('CREATE DATABASE IF NOT EXISTS restaurant_db');
      console.log('Database created or already exists');
    } catch (error) {
      if (error.code === 'ER_DBACCESS_DENIED_ERROR') {
        console.log('Cannot create database (permission denied). Please create "restaurant_db" database manually and try again.');
        await connection.end();
        return;
      } else {
        throw error;
      }
    }

    // Close the first connection
    await connection.end();

    // Create a new connection to the restaurant_db database
    const dbConnection = await mysql.createConnection({
      host: 'localhost',
      user: 'Rajesh',
      password: 'Rajesh@254',
      database: 'restaurant_db'
    });

    // Create tables
    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS restaurant_tables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_number INT UNIQUE NOT NULL,
        table_name VARCHAR(100) NOT NULL,
        qr_code_data TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbConnection.query(`
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
      )
    `);

    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_id INT,
        table_number INT NOT NULL,
        total_amount_inr DECIMAL(10, 2) NOT NULL,
        total_amount_usd DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        payment_method VARCHAR(20) DEFAULT 'cash',
        payment_status VARCHAR(20) DEFAULT 'pending',
        order_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id)
      )
    `);

    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT,
        menu_item_id INT,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL,
        price_inr DECIMAL(10, 2) NOT NULL,
        price_usd DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
      )
    `);

    await dbConnection.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default tables (10 tables)
    const tables = [
      [1, 'Table 1', 'table-1'],
      [2, 'Table 2', 'table-2'],
      [3, 'Table 3', 'table-3'],
      [4, 'Table 4', 'table-4'],
      [5, 'Table 5', 'table-5'],
      [6, 'Table 6', 'table-6'],
      [7, 'Table 7', 'table-7'],
      [8, 'Table 8', 'table-8'],
      [9, 'Table 9', 'table-9'],
      [10, 'Table 10', 'table-10']
    ];

    for (const table of tables) {
      await dbConnection.query(
        'INSERT IGNORE INTO restaurant_tables (table_number, table_name, qr_code_data) VALUES (?, ?, ?)',
        table
      );
    }

    // Insert sample menu items
    const menuItems = [
      ['Margherita Pizza', 'Classic pizza with tomato, mozzarella, and basil', 299.00, 3.99, 'Main Course', true],
      ['Chicken Biryani', 'Aromatic rice dish with spiced chicken', 349.00, 4.49, 'Main Course', true],
      ['Paneer Tikka', 'Grilled cottage cheese with Indian spices', 249.00, 3.29, 'Appetizer', true],
      ['Caesar Salad', 'Fresh romaine lettuce with Caesar dressing', 199.00, 2.69, 'Salad', true],
      ['Masala Dosa', 'Crispy rice crepe with potato filling', 149.00, 1.99, 'Main Course', true],
      ['Chocolate Brownie', 'Rich chocolate dessert with ice cream', 179.00, 2.39, 'Dessert', true],
      ['Mango Lassi', 'Traditional yogurt-based mango drink', 89.00, 1.19, 'Beverage', true],
      ['Coffee', 'Freshly brewed coffee', 79.00, 1.09, 'Beverage', true]
    ];

    for (const item of menuItems) {
      await dbConnection.query(
        'INSERT IGNORE INTO menu_items (name, description, price_inr, price_usd, category, is_available) VALUES (?, ?, ?, ?, ?, ?)',
        item
      );
    }

    console.log('Database setup completed successfully');
    await dbConnection.end();
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupDatabase();