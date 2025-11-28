const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        const connection = await pool.getConnection();
        console.log('Connected to database');

        // 1. Create ingredients table
        console.log('Creating ingredients table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
        unit VARCHAR(20) NOT NULL DEFAULT 'kg',
        threshold DECIMAL(10, 2) DEFAULT 5,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        // 2. Create order_feedback table
        console.log('Creating order_feedback table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS order_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        customer_id INT,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

        // 3. Create order_cancellations table
        console.log('Creating order_cancellations table...');
        await connection.query(`
      CREATE TABLE IF NOT EXISTS order_cancellations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        item_id INT,
        reason TEXT NOT NULL,
        cancelled_by VARCHAR(50) DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);

        // 4. Update orders table for cancellation status if not exists
        // We'll check if 'cancelled' is a valid status, if not we might need to handle it in application logic
        // or alter the enum if it was an enum. Based on setup-database.js, order_status is VARCHAR(20).
        // So 'cancelled' is valid.

        // 5. Update order_items table to add status for individual item cancellation
        console.log('Updating order_items table...');
        const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'order_items' 
      AND COLUMN_NAME = 'item_status'
      AND TABLE_SCHEMA = DATABASE()
    `);

        if (columns.length === 0) {
            await connection.query(`
        ALTER TABLE order_items
        ADD COLUMN item_status VARCHAR(20) DEFAULT 'active'
      `);
        }

        console.log('Schema update completed successfully');
        connection.release();
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await pool.end();
    }
}

updateSchema();
