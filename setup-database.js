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

    console.log('Database setup completed successfully');
    await dbConnection.end();
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupDatabase();