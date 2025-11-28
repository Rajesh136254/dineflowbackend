const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dineflow'
};

async function fixSchema() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Add nutritional_info column
        try {
            await connection.query(`
                ALTER TABLE menu_items 
                ADD COLUMN nutritional_info TEXT DEFAULT NULL
            `);
            console.log('Added nutritional_info column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('nutritional_info column already exists.');
            } else {
                console.error('Error adding nutritional_info:', err.message);
            }
        }

        // Add vitamins column
        try {
            await connection.query(`
                ALTER TABLE menu_items 
                ADD COLUMN vitamins TEXT DEFAULT NULL
            `);
            console.log('Added vitamins column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('vitamins column already exists.');
            } else {
                console.error('Error adding vitamins:', err.message);
            }
        }

        console.log('Schema update complete.');

    } catch (error) {
        console.error('Database connection failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

fixSchema();
