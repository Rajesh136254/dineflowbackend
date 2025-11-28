const express = require('express');
const cors = require('cors');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const httpServer = createServer(app);

// Define allowed origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'https://dineflowfrontend.vercel.app',
  'https://dineflowbackend.onrender.com'
];

// Socket.IO CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Enhanced CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add explicit CORS headers for all requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Add JSON parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Add cache control headers
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Kitchen dashboard connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Kitchen dashboard disconnected:', socket.id);
  });
});

// MySQL connection pool with proper configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Fixed SSL configuration for Aiven
  ssl: {
    rejectUnauthorized: false  // Allow self-signed certificates
  }
});

// Test database connection
const testDatabaseConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    console.log('Connection details:', {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    return false;
  }
};

// Update database schema for new features
const updateDatabaseSchema = async () => {
  try {
    const connection = await pool.getConnection();

    // Check for nutritional_info column
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'menu_items' 
      AND COLUMN_NAME = 'nutritional_info'
      AND TABLE_SCHEMA = DATABASE()
    `);

    if (columns.length === 0) {
      console.log('Adding nutritional_info column to menu_items...');
      await connection.execute('ALTER TABLE menu_items ADD COLUMN nutritional_info TEXT');
    }

    // Check for vitamins column
    const [columnsVitamins] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'menu_items' 
      AND COLUMN_NAME = 'vitamins'
      AND TABLE_SCHEMA = DATABASE()
    `);

    if (columnsVitamins.length === 0) {
      console.log('Adding vitamins column to menu_items...');
      await connection.execute('ALTER TABLE menu_items ADD COLUMN vitamins TEXT');
    }

    connection.release();
    console.log('Schema check completed');
  } catch (error) {
    console.error('Schema update failed:', error);
  }
};

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.execute('SELECT 1');
    await updateDatabaseSchema(); // Ensure schema is up to date
    res.json({
      status: 'ok',
      message: 'Restaurant QR Ordering System API',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// AI Nutrition Endpoint
app.post('/api/ai/nutrition', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Gemini API key not configured'
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Generate nutritional information for a menu item with Name: '${name}' and Description: '${description}'. 
    Return ONLY a valid JSON object with exactly two keys: 
    - nutritional_info: A short string summarizing calories, protein, etc. (e.g., "300 kcal, 10g Protein")
    - vitamins: A comma-separated string of vitamins (e.g., "Vitamin A, Vitamin C")
    Do not include any markdown formatting or code blocks. Just the raw JSON string.`;

    console.log(`Generating content for: ${name} using model gemini-2.0-flash`);
    const result = await model.generateContent(prompt);
    console.log('Generation complete, getting response text...');
    const response = await result.response;
    const text = response.text();
    console.log('AI Response:', text);

    // Clean up the text if it contains markdown code blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const data = JSON.parse(cleanText);

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('AI Generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate nutritional info',
      error: error.message
    });
  }
});

// Menu endpoints with enhanced error handling
app.get('/api/menu', async (req, res) => {
  try {
    console.log('Fetching menu items...');
    const [rows] = await pool.execute(
      'SELECT * FROM menu_items ORDER BY category, name'
    );
    console.log(`Found ${rows.length} menu items`);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu',
      error: error.message
    });
  }
});

app.get('/api/menu/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM menu_items WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu item',
      error: error.message
    });
  }
});

app.post('/api/menu', async (req, res) => {
  try {
    const { name, description, price_inr, price_usd, category, image_url, is_available, nutritional_info, vitamins } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO menu_items (name, description, price_inr, price_usd, category, image_url, is_available, nutritional_info, vitamins) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, price_inr, price_usd, category, image_url || null, is_available !== false, nutritional_info || null, vitamins || null]
    );

    const [newItem] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    res.json({ success: true, data: newItem[0] });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item',
      error: error.message
    });
  }
});

app.put('/api/menu/:id', async (req, res) => {
  try {
    const { name, description, price_inr, price_usd, category, image_url, is_available, nutritional_info, vitamins } = req.body;
    const [result] = await pool.execute(
      'UPDATE menu_items SET name = ?, description = ?, price_inr = ?, price_usd = ?, category = ?, image_url = ?, is_available = ?, nutritional_info = ?, vitamins = ? WHERE id = ?',
      [name, description, price_inr, price_usd, category, image_url, is_available, nutritional_info || null, vitamins || null, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    const [updatedItem] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updatedItem[0] });
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item',
      error: error.message
    });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    // First check if this menu item is referenced in any orders
    const [orderItems] = await pool.execute(
      'SELECT COUNT(*) as count FROM order_items WHERE menu_item_id = ?',
      [req.params.id]
    );

    if (orderItems[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete menu item that has been used in orders'
      });
    }

    // If not referenced, proceed with deletion
    const [result] = await pool.execute(
      'DELETE FROM menu_items WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    res.json({ success: true, message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item',
      error: error.message
    });
  }
});

// Table endpoints with enhanced error handling
// Table endpoints with enhanced error handling (updated to include group_id optionally)
app.get('/api/tables', async (req, res) => {
  try {
    console.log('Fetching tables...');
    try {
      // Try full query with group_id and is_active
      const [rows] = await pool.execute(
        'SELECT rt.*, COALESCE(tg.name, "Non AC") as group_name FROM restaurant_tables rt LEFT JOIN table_groups tg ON rt.group_id = tg.id WHERE rt.is_active = true ORDER BY rt.table_number'
      );
      console.log(`Found ${rows.length} tables`);
      res.json({ success: true, data: rows });
    } catch (innerError) {
      console.warn('Full table query failed, trying fallback:', innerError.message);
      // Fallback query: simple select without joins or is_active check
      const [rows] = await pool.execute(
        "SELECT *, 'Non AC' as group_name FROM restaurant_tables ORDER BY table_number"
      );
      console.log(`Found ${rows.length} tables (fallback)`);
      res.json({ success: true, data: rows });
    }
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tables',
      error: error.message
    });
  }
});

app.get('/api/tables/:tableNumber', async (req, res) => {
  try {
    try {
      const [rows] = await pool.execute(
        'SELECT rt.*, COALESCE(tg.name, "Non AC") as group_name FROM restaurant_tables rt LEFT JOIN table_groups tg ON rt.group_id = tg.id WHERE rt.table_number = ?',
        [req.params.tableNumber]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Table not found' });
      }
      res.json({ success: true, data: rows[0] });
    } catch (innerError) {
      console.warn('Full table query failed, trying fallback:', innerError.message);
      const [rows] = await pool.execute(
        "SELECT *, 'Non AC' as group_name FROM restaurant_tables WHERE table_number = ?",
        [req.params.tableNumber]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Table not found' });
      }
      res.json({ success: true, data: rows[0] });
    }
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table',
      error: error.message
    });
  }
});

// POST endpoint to create a new table
app.post('/api/tables', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); // Use a transaction for safety

    const { table_number, table_name, group_id } = req.body;

    // 1. Validate required fields
    if (!table_number) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Table number is required.'
      });
    }

    // 2. Check if table number already exists
    const [existingTable] = await connection.execute(
      'SELECT id FROM restaurant_tables WHERE table_number = ?',
      [table_number]
    );

    if (existingTable.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Table number ${table_number} already exists. Please choose a different number.`
      });
    }

    // 3. Proceed with insertion
    const qr_code_data = `table-${table_number}`;

    // Check if group_id column exists
    const [columnCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'restaurant_tables' 
      AND COLUMN_NAME = 'group_id'
      AND TABLE_SCHEMA = DATABASE()
    `);

    let query, values;

    if (columnCheck.length > 0) {
      query = 'INSERT INTO restaurant_tables (table_number, table_name, qr_code_data, group_id) VALUES (?, ?, ?, ?)';
      values = [table_number, table_name || `Table ${table_number}`, qr_code_data, group_id || null];
    } else {
      query = 'INSERT INTO restaurant_tables (table_number, table_name, qr_code_data) VALUES (?, ?, ?)';
      values = [table_number, table_name || `Table ${table_number}`, qr_code_data];
    }

    const [result] = await connection.execute(query, values);
    await connection.commit();

    // Get the newly created table to return it
    let getQuery;
    if (columnCheck.length > 0) {
      getQuery = `SELECT rt.*, COALESCE(tg.name, "Non AC") as group_name FROM restaurant_tables rt LEFT JOIN table_groups tg ON rt.group_id = tg.id WHERE rt.id = ?`;
    } else {
      getQuery = 'SELECT *, "Non AC" as group_name FROM restaurant_tables WHERE id = ?';
    }

    const [newTable] = await pool.execute(getQuery, [result.insertId]);

    res.json({ success: true, data: newTable[0] });

  } catch (error) {
    await connection.rollback();
    console.error('Error creating table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create table',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

app.put('/api/tables/:id', async (req, res) => {
  try {
    const { table_number, table_name, group_id } = req.body;
    const qr_code_data = `table-${table_number}`;
    let query = 'UPDATE restaurant_tables SET table_number = ?, table_name = ?, qr_code_data = ?';
    let values = [table_number, table_name || null, qr_code_data, req.params.id];

    // Conditionally add group_id update if provided
    if (group_id !== undefined) {
      query += ', group_id = ?';
      values.splice(3, 0, group_id || null); // Insert before id
    }

    query += ' WHERE id = ?';

    const [result] = await pool.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    const [updatedTable] = await pool.execute(
      'SELECT rt.*, COALESCE(tg.name, "Non AC") as group_name FROM restaurant_tables rt LEFT JOIN table_groups tg ON rt.group_id = tg.id WHERE rt.id = ?',
      [req.params.id]
    );
    res.json({ success: true, data: updatedTable[0] });
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table',
      error: error.message
    });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM restaurant_tables WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete table',
      error: error.message
    });
  }
});

// Table Groups endpoints
app.get('/api/table-groups', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM table_groups ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching table groups:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch table groups', error: error.message });
  }
});

app.post('/api/table-groups', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }
    const trimmedName = name.trim();
    const [existing] = await pool.execute('SELECT id FROM table_groups WHERE name = ?', [trimmedName]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Group already exists' });
    }
    const [result] = await pool.execute('INSERT INTO table_groups (name) VALUES (?)', [trimmedName]);
    const [newGroup] = await pool.execute('SELECT * FROM table_groups WHERE id = ?', [result.insertId]);
    res.json({ success: true, data: newGroup[0] });
  } catch (error) {
    console.error('Error creating table group:', error);
    res.status(500).json({ success: false, message: 'Failed to create table group', error: error.message });
  }
});

app.put('/api/table-groups/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Group name is required' });
    }
    const [result] = await pool.execute('UPDATE table_groups SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    const [updatedGroup] = await pool.execute('SELECT * FROM table_groups WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updatedGroup[0] });
  } catch (error) {
    console.error('Error updating table group:', error);
    res.status(500).json({ success: false, message: 'Failed to update table group', error: error.message });
  }
});

app.delete('/api/table-groups/:id', async (req, res) => {
  try {
    // Check if used in tables
    const [tablesUsing] = await pool.execute('SELECT COUNT(*) as count FROM restaurant_tables WHERE group_id = ?', [req.params.id]);
    if (tablesUsing[0].count > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete group used by ${tablesUsing[0].count} tables` });
    }
    const [result] = await pool.execute('DELETE FROM table_groups WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting table group:', error);
    res.status(500).json({ success: false, message: 'Failed to delete table group', error: error.message });
  }
});

// Category endpoints with enhanced error handling
app.get('/api/categories', async (req, res) => {
  try {
    console.log('Fetching categories...');
    const [rows] = await pool.execute(
      'SELECT DISTINCT category FROM menu_items ORDER BY category'
    );

    // Extract just the category names
    const categories = rows.map(row => row.category);
    console.log(`Found ${categories.length} categories`);

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const trimmedName = name.trim();

    // Check if category already exists in menu_items
    const [existingCategory] = await pool.execute(
      'SELECT category FROM menu_items WHERE category = ? LIMIT 1',
      [trimmedName]
    );

    if (existingCategory.length > 0) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }

    // Create a placeholder menu item with the new category
    await pool.execute(
      'INSERT INTO menu_items (name, description, price_inr, price_usd, category, is_available) VALUES (?, ?, ?, ?, ?, ?)',
      ['[Category Placeholder]', `Placeholder for ${trimmedName} category`, 0, 0, trimmedName, false]
    );

    res.json({
      success: true,
      message: 'Category created successfully',
      data: { name: trimmedName }
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: error.message
    });
  }
});

app.delete('/api/categories/:name', async (req, res) => {
  try {
    const categoryName = decodeURIComponent(req.params.name);

    // Check if any menu items are using this category
    const [itemsInCategory] = await pool.execute(
      'SELECT COUNT(*) as count FROM menu_items WHERE category = ? AND name != "[Category Placeholder]"',
      [categoryName]
    );

    if (itemsInCategory[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. ${itemsInCategory[0].count} item(s) are using this category.`
      });
    }

    // Delete the placeholder menu item for this category
    await pool.execute(
      'DELETE FROM menu_items WHERE category = ? AND name = "[Category Placeholder]"',
      [categoryName]
    );

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: error.message
    });
  }
});

// Order endpoints
app.get('/api/orders', async (req, res) => {
  try {
    const { status, start_date, end_date, table_number, customer_id } = req.query;

    // First, get the orders based on filters
    let query = 'SELECT * FROM orders';
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push('order_status = ?');
      params.push(status);
    }

    if (table_number) {
      conditions.push('table_number = ?');
      params.push(table_number);
    }

    if (customer_id) {
      conditions.push('customer_id = ?');
      params.push(customer_id);
    }

    if (start_date) {
      conditions.push('created_at >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('created_at <= ?');
      params.push(end_date);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const [orders] = await pool.execute(query, params);

    // Now, get the items for each order
    const processedOrders = await Promise.all(
      orders.map(async (order) => {
        const [items] = await pool.execute(
          'SELECT * FROM order_items WHERE order_id = ?',
          [order.id]
        );

        return {
          ...order,
          items: items
        };
      })
    );

    res.json({ success: true, data: processedOrders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Add more logging to the order creation endpoint
app.post('/api/orders', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { table_number, items, currency, payment_method, customer_id } = req.body;

    // Validate input
    if (!table_number || !items || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Table number and items are required'
      });
    }

    const [tableRows] = await connection.execute(
      'SELECT id FROM restaurant_tables WHERE table_number = ?',
      [table_number]
    );

    if (tableRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    const table_id = tableRows[0].id;

    let total_inr = 0;
    let total_usd = 0;

    for (const item of items) {
      total_inr += parseFloat(item.price_inr) * item.quantity;
      total_usd += parseFloat(item.price_usd) * item.quantity;
    }

    const [orderResult] = await connection.execute(
      'INSERT INTO orders (table_id, table_number, customer_id, total_amount_inr, total_amount_usd, currency, payment_method, order_status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [table_id, table_number, customer_id || null, total_inr.toFixed(2), total_usd.toFixed(2), currency, payment_method, 'pending', payment_method === 'cash' ? 'pending' : 'paid']
    );

    const order_id = orderResult.insertId;

    for (const item of items) {
      await connection.execute(
        'INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, price_inr, price_usd) VALUES (?, ?, ?, ?, ?, ?)',
        [order_id, item.id, item.name, item.quantity, item.price_inr, item.price_usd]
      );
    }

    const [itemsRows] = await connection.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order_id]
    );

    await connection.commit();

    const [orderRows] = await connection.execute('SELECT * FROM orders WHERE id = ?', [order_id]);
    const orderData = {
      ...orderRows[0],
      items: itemsRows
    };

    // Emit socket event for real-time updates
    io.emit('new-order', orderData);

    res.json({ success: true, data: orderData });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { order_status } = req.body;
    const [result] = await pool.execute(
      'UPDATE orders SET order_status = ? WHERE id = ?',
      [order_status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const [updatedOrder] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    io.emit('order-status-updated', updatedOrder[0]);

    res.json({ success: true, data: updatedOrder[0] });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
});

// Analytics endpoints
app.get('/api/analytics/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const [summaryRows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount_inr) as total_revenue_inr,
        SUM(total_amount_usd) as total_revenue_usd,
        COUNT(DISTINCT table_number) as tables_served
      FROM orders
      WHERE DATE(created_at) = ?
    `, [targetDate]);

    const [itemsRows] = await pool.execute(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.price_inr * oi.quantity) as revenue_inr,
        SUM(oi.price_usd * oi.quantity) as revenue_usd
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE DATE(o.created_at) = ?
      GROUP BY oi.item_name
      ORDER BY quantity_sold DESC
    `, [targetDate]);

    res.json({
      success: true,
      data: {
        summary: summaryRows[0],
        items: itemsRows,
        date: targetDate
      }
    });
  } catch (error) {
    console.error('Error fetching daily analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

app.get('/api/analytics/monthly', async (req, res) => {
  try {
    const { month, year } = req.query;
    const targetMonth = month || (new Date().getMonth() + 1);
    const targetYear = year || new Date().getFullYear();

    const [summaryRows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount_inr) as total_revenue_inr,
        SUM(total_amount_usd) as total_revenue_usd,
        COUNT(DISTINCT table_number) as tables_served
      FROM orders
      WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
    `, [targetMonth, targetYear]);

    const [itemsRows] = await pool.execute(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.price_inr * oi.quantity) as revenue_inr,
        SUM(oi.price_usd * oi.quantity) as revenue_usd
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE MONTH(o.created_at) = ? AND YEAR(o.created_at) = ?
      GROUP BY oi.item_name
      ORDER BY quantity_sold DESC
    `, [targetMonth, targetYear]);

    const [dailyRows] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(total_amount_inr) as revenue_inr,
        SUM(total_amount_usd) as revenue_usd
      FROM orders
      WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [targetMonth, targetYear]);

    res.json({
      success: true,
      data: {
        summary: summaryRows[0],
        items: itemsRows,
        daily: dailyRows,
        month: targetMonth,
        year: targetYear
      }
    });
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

app.get('/api/analytics/quarterly', async (req, res) => {
  try {
    const { quarter, year } = req.query;
    const targetQuarter = quarter || Math.ceil((new Date().getMonth() + 1) / 3);
    const targetYear = year || new Date().getFullYear();

    const startMonth = (targetQuarter - 1) * 3 + 1;
    const endMonth = targetQuarter * 3;

    const [summaryRows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount_inr) as total_revenue_inr,
        SUM(total_amount_usd) as total_revenue_usd,
        COUNT(DISTINCT table_number) as tables_served
      FROM orders
      WHERE MONTH(created_at) BETWEEN ? AND ? 
        AND YEAR(created_at) = ?
    `, [startMonth, endMonth, targetYear]);

    const [itemsRows] = await pool.execute(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.price_inr * oi.quantity) as revenue_inr,
        SUM(oi.price_usd * oi.quantity) as revenue_usd
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE MONTH(o.created_at) BETWEEN ? AND ? 
        AND YEAR(o.created_at) = ?
      GROUP BY oi.item_name
      ORDER BY quantity_sold DESC
    `, [startMonth, endMonth, targetYear]);

    res.json({
      success: true,
      data: {
        summary: summaryRows[0],
        items: itemsRows,
        quarter: targetQuarter,
        year: targetYear
      }
    });
  } catch (error) {
    console.error('Error fetching quarterly analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});

app.get('/api/analytics/yearly', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year || new Date().getFullYear();

    const [summaryRows] = await pool.execute(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount_inr) as total_revenue_inr,
        SUM(total_amount_usd) as total_revenue_usd,
        COUNT(DISTINCT table_number) as tables_served
      FROM orders
      WHERE YEAR(created_at) = ?
    `, [targetYear]);

    const [itemsRows] = await pool.execute(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as quantity_sold,
        SUM(oi.price_inr * oi.quantity) as revenue_inr,
        SUM(oi.price_usd * oi.quantity) as revenue_usd
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE YEAR(o.created_at) = ?
      GROUP BY oi.item_name
      ORDER BY quantity_sold DESC
    `, [targetYear]);

    const [monthlyRows] = await pool.execute(`
      SELECT 
        MONTH(created_at) as month,
        COUNT(*) as orders,
        SUM(total_amount_inr) as revenue_inr,
        SUM(total_amount_usd) as revenue_usd
      FROM orders
      WHERE YEAR(created_at) = ?
      GROUP BY MONTH(created_at)
      ORDER BY month
    `, [targetYear]);

    res.json({
      success: true,
      data: {
        summary: summaryRows[0],
        items: itemsRows,
        monthly: monthlyRows,
        year: targetYear
      }
    });
  } catch (error) {
    console.error('Error fetching yearly analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
});
// Test endpoint for revenue/orders data
app.get('/api/analytics/test-revenue-orders', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    // Get a simple count of orders in the date range
    const [orderCount] = await pool.execute(`
            SELECT COUNT(*) as count
            FROM orders
            WHERE created_at >= ? AND created_at < ?
        `, [startDate, endDate]);

    res.json({
      success: true,
      message: 'Test endpoint for revenue/orders data',
      period,
      currency,
      startDate,
      endDate,
      orderCount: orderCount[0].count
    });
  } catch (error) {
    console.error('Error in test revenue/orders endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Test endpoint failed',
      error: error.message
    });
  }
});

// Analytics page endpoints
app.get('/api/analytics/test', (req, res) => {
  res.json({ success: true, message: 'Analytics API is working' });
});

// Helper function to get date range based on period
// Helper function to get date range based on period
const getDateRangeForPeriod = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 28); // Last 4 weeks
      endDate = new Date(now);
      break;
    case 'monthly':
      // TEMPORARY CHANGE: Look back 2 years for testing
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 2); // Look back 2 years
      endDate = new Date(now);
      break;
    case 'yearly':
      // TEMPORARY CHANGE: Look back 5 years for testing
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 5); // Look back 5 years
      endDate = new Date(now);
      break;
    default:
      // Default to last 7 days
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
  }

  console.log(`Date range for period ${period}: ${startDate} to ${endDate}`);
  return { startDate, endDate };
};

// Helper function to get previous period date range
const getPreviousPeriodDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'weekly':
      // Get the start of the current week
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - now.getDay());
      currentWeekStart.setHours(0, 0, 0, 0);

      // Previous week is 7 days before that
      startDate = new Date(currentWeekStart);
      startDate.setDate(currentWeekStart.getDate() - 7);

      endDate = new Date(currentWeekStart);
      endDate.setDate(currentWeekStart.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
};

// Get summary analytics - UPDATED
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    // Total orders
    const [totalOrdersResult] = await pool.execute(`
      SELECT COUNT(*) as total_orders
      FROM orders
      WHERE created_at >= ? AND created_at < ?
    `, [startDate, endDate]);
    const totalOrders = totalOrdersResult[0].total_orders;

    // Total revenue - use different queries based on currency
    let totalRevenue;
    if (currency === 'INR') {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_inr) as total_revenue
        FROM orders
        WHERE created_at >= ? AND created_at < ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    } else {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_usd) as total_revenue
        FROM orders
        WHERE created_at >= ? AND created_at < ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    }

    // Tables served
    const [tablesServedResult] = await pool.execute(`
      SELECT COUNT(DISTINCT table_id) as tables_served
      FROM orders
      WHERE created_at >= ? AND created_at < ?
    `, [startDate, endDate]);
    const tablesServed = tablesServedResult[0].tables_served || 0;

    // Average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Customers
    const [customersResult] = await pool.execute(`
      SELECT COUNT(DISTINCT customer_id) as total_customers
      FROM orders
      WHERE created_at >= ? AND created_at < ?
    `, [startDate, endDate]);
    const totalCustomers = customersResult[0].total_customers || 0;

    // Average items per order
    const [avgItemsResult] = await pool.execute(`
      SELECT AVG(item_count) as avg_items_per_order
      FROM (
        SELECT o.id, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.created_at >= ? AND o.created_at < ?
        GROUP BY o.id
      ) as order_items_count
    `, [startDate, endDate]);
    const avgItemsPerOrder = avgItemsResult[0].avg_items_per_order || 0;

    res.json({
      success: true,
      data: {
        total_orders: totalOrders,
        [`total_revenue_${currency.toLowerCase()}`]: totalRevenue,
        tables_served: tablesServed,
        avg_order_value: avgOrderValue,
        total_customers: totalCustomers,
        avg_items_per_order: avgItemsPerOrder
      }
    });
  } catch (error) {
    console.error('Error fetching summary analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary analytics',
      error: error.message
    });
  }
});

// Get revenue and orders over time - UPDATED
// Get revenue and orders over time - UPDATED
app.get('/api/analytics/revenue-orders', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    let groupBy, dateFormat;
    switch (period) {
      case 'daily':
        groupBy = 'DATE(created_at)';
        dateFormat = '%Y-%m-%d';
        break;
      case 'weekly':
        groupBy = 'YEARWEEK(created_at)';
        dateFormat = '%Y-%m-%d';
        break;
      case 'monthly':
        groupBy = 'YEAR(created_at), MONTH(created_at)';
        dateFormat = '%Y-%m-%d';
        break;
      case 'yearly':
        groupBy = 'YEAR(created_at)';
        dateFormat = '%Y-%m-%d';
        break;
      default:
        groupBy = 'DATE(created_at)';
        dateFormat = '%Y-%m-%d';
    }

    const revenueColumn = currency === 'INR' ? 'total_amount_inr' : 'total_amount_usd';

    const [results] = await pool.execute(`
      SELECT 
        ${groupBy} as date_group,
        DATE_FORMAT(MIN(created_at), '${dateFormat}') as date,
        COUNT(*) as orders,
        COALESCE(SUM(${revenueColumn}), 0) as revenue,
        COUNT(DISTINCT table_id) as tables_used,
        COALESCE(AVG(${revenueColumn}), 0) as avg_order_value
      FROM orders 
      WHERE created_at >= ? AND created_at < ?
      GROUP BY ${groupBy}
      ORDER BY date_group
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      date: row.date,
      orders: row.orders,
      revenue: row.revenue,
      tables_used: row.tables_used,
      avg_order_value: row.avg_order_value,
      [`revenue_${currency.toLowerCase()}`]: row.revenue,
      [`avg_order_value_${currency.toLowerCase()}`]: row.avg_order_value
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching revenue/orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue/orders',
      error: error.message
    });
  }
});

// Get top items - UPDATED
app.get('/api/analytics/top-items', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'oi.price_inr' : 'oi.price_usd';

    const [results] = await pool.execute(`
      SELECT 
        mi.id,
        mi.name as item_name,
        mi.category,
        SUM(oi.quantity) as quantity_sold,
        COALESCE(SUM(oi.quantity * ${revenueColumn}), 0) as revenue,
        COUNT(DISTINCT oi.order_id) as order_count,
        COALESCE(AVG(oi.quantity), 0) as avg_quantity_per_order
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE o.created_at >= ? AND o.created_at < ?
      GROUP BY mi.id, mi.name, mi.category
      ORDER BY quantity_sold DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      ...row,
      [`revenue_${currency.toLowerCase()}`]: row.revenue
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching top items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch top items',
      error: error.message
    });
  }
});

// Get category performance
app.get('/api/analytics/category-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'oi.price_inr' : 'oi.price_usd';

    const [results] = await pool.execute(`
      SELECT 
        mi.category,
        COUNT(DISTINCT o.id) as total_orders,
        SUM(oi.quantity) as total_items,
        COALESCE(SUM(oi.quantity * ${revenueColumn}), 0) as total_revenue,
        COALESCE(AVG(oi.quantity * ${revenueColumn}), 0) as avg_item_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE o.created_at >= ? AND o.created_at < ?
      GROUP BY mi.category
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_item_revenue_${currency.toLowerCase()}`]: row.avg_item_revenue
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching category performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category performance',
      error: error.message
    });
  }
});

app.get('/api/analytics/customer-retention', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    // Get customer retention data
    const [retentionData] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_customers,
        SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END) as returning_customers,
        SUM(CASE WHEN order_count = 1 THEN 1 ELSE 0 END) as new_customers
      FROM (
        SELECT 
          o.customer_id,
          DATE(o.created_at) as created_at,
          COUNT(*) as order_count
        FROM orders o
        WHERE o.created_at >= ? AND o.created_at < ?
        GROUP BY o.customer_id, DATE(o.created_at)
      ) as customer_data
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);

    // Calculate overall retention rate
    const [retentionRate] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END) as returning_customers,
        COUNT(DISTINCT customer_id) as total_customers
      FROM (
        SELECT 
          customer_id,
          COUNT(*) as order_count
        FROM orders
        WHERE created_at >= ? AND created_at < ?
        GROUP BY customer_id
      ) as customer_data
    `, [startDate, endDate]);

    const rate = retentionRate[0].total_customers > 0
      ? (retentionRate[0].returning_customers / retentionRate[0].total_customers * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        timeline: retentionData,
        retention_rate: rate,
        new_customers: retentionRate[0].total_customers - retentionRate[0].returning_customers,
        returning_customers: retentionRate[0].returning_customers
      }
    });
  } catch (error) {
    console.error('Error fetching customer retention:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer retention',
      error: error.message
    });
  }
});

// Get payment methods distribution
app.get('/api/analytics/payment-methods', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const [results] = await pool.execute(`
      SELECT 
        payment_method,
        COUNT(*) as count
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY payment_method
    `, [startDate, endDate]);

    // Convert to object format for the chart
    const paymentMethods = {};
    results.forEach(item => {
      paymentMethods[item.payment_method] = item.count;
    });

    res.json({ success: true, data: paymentMethods });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
});

// Get table performance
// Get table performance
app.get('/api/analytics/table-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'o.total_amount_inr' : 'o.total_amount_usd';

    const [results] = await pool.execute(`
      SELECT 
        t.table_name,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(${revenueColumn}), 0) as total_revenue,
        COALESCE(AVG(${revenueColumn}), 0) as avg_order_value,
        COUNT(DISTINCT DATE(o.created_at)) as days_used,
        COALESCE(AVG(o.total_items), 0) as avg_items_per_order
      FROM restaurant_tables t
      LEFT JOIN (
        SELECT 
          o.*,
          COUNT(oi.id) as total_items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.created_at >= ? AND o.created_at < ?
        GROUP BY o.id
      ) o ON t.id = o.table_id
      GROUP BY t.id, t.table_name
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_order_value_${currency.toLowerCase()}`]: row.avg_order_value
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching table performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table performance',
      error: error.message
    });
  }
});

// Get hourly order distribution
app.get('/api/analytics/hourly-orders', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const [results] = await pool.execute(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount_inr), 0) as revenue_inr,
        COALESCE(SUM(total_amount_usd), 0) as revenue_usd,
        COUNT(DISTINCT table_id) as tables_used
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `, [startDate, endDate]);

    // Fill in missing hours with 0 orders
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      const hourData = results.find(item => item.hour === i);
      hourlyData.push({
        hour: i,
        orders: hourData ? hourData.orders : 0,
        revenue_inr: hourData ? hourData.revenue_inr : 0,
        revenue_usd: hourData ? hourData.revenue_usd : 0,
        tables_used: hourData ? hourData.tables_used : 0
      });
    }

    res.json({ success: true, data: hourlyData });
  } catch (error) {
    console.error('Error fetching hourly orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hourly orders',
      error: error.message
    });
  }
});

// Get previous period data for comparison
app.get('/api/analytics/previous-period', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getPreviousPeriodDateRange(period);

    // Total orders
    const [totalOrdersResult] = await pool.execute(`
      SELECT COUNT(*) as total_orders
      FROM orders
      WHERE created_at >= ? AND created_at < ?
    `, [startDate, endDate]);
    const totalOrders = totalOrdersResult[0].total_orders;

    // Total revenue - use different queries based on currency
    let totalRevenue;
    if (currency === 'INR') {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_inr) as total_revenue
        FROM orders
        WHERE created_at >= ? AND created_at < ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    } else {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_usd) as total_revenue
        FROM orders
        WHERE created_at >= ? AND created_at < ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    }

    // Tables served
    const [tablesServedResult] = await pool.execute(`
      SELECT COUNT(DISTINCT table_id) as tables_served
      FROM orders
      WHERE created_at >= ? AND created_at < ?
    `, [startDate, endDate]);
    const tablesServed = tablesServedResult[0].tables_served || 0;

    // Average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      success: true,
      data: {
        total_orders: totalOrders,
        [`total_revenue_${currency.toLowerCase()}`]: totalRevenue,
        tables_served: tablesServed,
        avg_order_value: avgOrderValue
      }
    });
  } catch (error) {
    console.error('Error fetching previous period data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch previous period data',
      error: error.message
    });
  }
});

// User authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    // Extract role from request body with default value of 'customer'
    const { fullName, email, password, role = 'customer' } = req.body;

    // Check if user already exists
    const [existingUser] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create new user with specified role
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, role]
    );

    // Get the created user
    const [newUser] = await pool.execute(
      'SELECT id, full_name, email, role FROM users WHERE id = ?',
      [result.insertId]
    );

    res.json({
      success: true,
      message: 'User registered successfully',
      data: newUser[0]
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: error.message
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const [users] = await pool.execute(
      'SELECT id, full_name, email, password_hash, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = users[0];

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message
    });
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // In a real app, you would verify the token here
  // For now, we'll just check if it exists
  if (token !== 'dummy-token') {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }

  next();
};




//--------------------------------------------------------------
// Get revenue by payment method
app.get('/api/analytics/revenue-by-payment', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'total_amount_inr' : 'total_amount_usd';

    const [results] = await pool.execute(`
      SELECT 
        payment_method,
        COUNT(*) as order_count,
        COALESCE(SUM(${revenueColumn}), 0) as total_revenue,
        COALESCE(AVG(${revenueColumn}), 0) as avg_order_value
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY payment_method
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_order_value_${currency.toLowerCase()}`]: row.avg_order_value
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching revenue by payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue by payment method',
      error: error.message
    });
  }
});

// Get order status distribution
app.get('/api/analytics/order-status', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const [results] = await pool.execute(`
      SELECT 
        order_status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount_inr), 0) as revenue_inr,
        COALESCE(SUM(total_amount_usd), 0) as revenue_usd
      FROM orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY order_status
      ORDER BY count DESC
    `, [startDate, endDate]);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching order status distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order status distribution',
      error: error.message
    });
  }
});

// Get menu item performance
app.get('/api/analytics/menu-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'oi.price_inr' : 'oi.price_usd';

    const [results] = await pool.execute(`
      SELECT 
        mi.id,
        mi.name as item_name,
        mi.category,
        mi.is_available,
        COUNT(DISTINCT oi.order_id) as order_count,
        SUM(oi.quantity) as quantity_sold,
        COALESCE(SUM(oi.quantity * ${revenueColumn}), 0) as total_revenue,
        COALESCE(AVG(oi.quantity * ${revenueColumn}), 0) as avg_revenue_per_order
      FROM menu_items mi
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.created_at >= ? AND o.created_at < ?
      GROUP BY mi.id, mi.name, mi.category, mi.is_available
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Format the data for the chart
    const formattedData = results.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_revenue_per_order_${currency.toLowerCase()}`]: row.avg_revenue_per_order
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching menu performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu performance',
      error: error.message
    });
  }
});

// Get customer analytics
app.get('/api/analytics/customer-analytics', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'total_amount_inr' : 'total_amount_usd';

    // Customer segmentation by order frequency
    const [segmentationData] = await pool.execute(`
      SELECT 
        CASE 
          WHEN order_count = 1 THEN 'One-time'
          WHEN order_count BETWEEN 2 AND 5 THEN 'Regular'
          WHEN order_count BETWEEN 6 AND 10 THEN 'Frequent'
          ELSE 'Loyal'
        END as customer_segment,
        COUNT(*) as customer_count,
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(AVG(avg_order_value), 0) as avg_order_value
      FROM (
        SELECT 
          customer_id,
          COUNT(*) as order_count,
          COALESCE(SUM(${revenueColumn}), 0) as total_revenue,
          COALESCE(AVG(${revenueColumn}), 0) as avg_order_value
        FROM orders
        WHERE created_at >= ? AND created_at < ?
        GROUP BY customer_id
      ) as customer_data
      GROUP BY customer_segment
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Customer lifetime value
    const [clvData] = await pool.execute(`
      SELECT 
        AVG(total_revenue) as avg_customer_value,
        MIN(total_revenue) as min_customer_value,
        MAX(total_revenue) as max_customer_value,
        AVG(order_count) as avg_orders_per_customer
      FROM (
        SELECT 
          customer_id,
          COUNT(*) as order_count,
          COALESCE(SUM(${revenueColumn}), 0) as total_revenue
        FROM orders
        WHERE created_at >= ? AND created_at < ?
        GROUP BY customer_id
      ) as customer_data
    `, [startDate, endDate]);

    // Customer acquisition and retention
    const [acquisitionData] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT customer_id) as new_customers,
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END) as returning_customers
      FROM (
        SELECT 
          o.customer_id,
          o.created_at,
          COUNT(*) OVER (PARTITION BY o.customer_id ORDER BY o.created_at) as order_count
        FROM orders o
        WHERE o.created_at >= ? AND o.created_at < ?
      ) as customer_orders
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [startDate, endDate]);

    // Format the data for the charts
    const formattedSegmentationData = segmentationData.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_order_value_${currency.toLowerCase()}`]: row.avg_order_value
    }));

    const formattedClvData = {
      avg_customer_value: clvData[0][`avg_customer_value_${currency.toLowerCase()}`] || 0,
      min_customer_value: clvData[0][`min_customer_value_${currency.toLowerCase()}`] || 0,
      max_customer_value: clvData[0][`max_customer_value_${currency.toLowerCase()}`] || 0,
      avg_orders_per_customer: clvData[0].avg_orders_per_customer || 0
    };

    res.json({
      success: true,
      data: {
        segmentation: formattedSegmentationData,
        clv: formattedClvData,
        acquisition: acquisitionData
      }
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer analytics',
      error: error.message
    });
  }
});

// Get inventory analytics
app.get('/api/analytics/inventory', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    // Most used ingredients
    const [ingredientsData] = await pool.execute(`
      SELECT 
        i.name as ingredient_name,
        SUM(ri.quantity * oi.quantity) as total_used,
        i.unit,
        i.current_stock,
        i.min_stock_level,
        (i.current_stock / i.min_stock_level) as stock_ratio
      FROM ingredients i
      JOIN recipe_items ri ON i.id = ri.ingredient_id
      JOIN order_items oi ON ri.menu_item_id = oi.menu_item_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ? AND o.created_at < ?
      GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_level
      ORDER BY total_used DESC
      LIMIT 20
    `, [startDate, endDate]);

    // Low stock items
    const [lowStockData] = await pool.execute(`
      SELECT 
        i.name as ingredient_name,
        i.current_stock,
        i.min_stock_level,
        i.unit,
        (i.current_stock / i.min_stock_level) as stock_ratio
      FROM ingredients i
      WHERE i.current_stock <= i.min_stock_level * 1.5
      ORDER BY stock_ratio ASC
      LIMIT 10
    `);

    // Waste analysis
    const [wasteData] = await pool.execute(`
      SELECT 
        i.name as ingredient_name,
        SUM(w.quantity) as waste_quantity,
        i.unit,
        SUM(w.quantity * i.cost_per_unit) as waste_cost
      FROM waste_log w
      JOIN ingredients i ON w.ingredient_id = i.id
      WHERE w.created_at >= ? AND w.created_at < ?
      GROUP BY i.id, i.name, i.unit, i.cost_per_unit
      ORDER BY waste_cost DESC
      LIMIT 10
    `, [startDate, endDate]);

    res.json({
      success: true,
      data: {
        ingredients: ingredientsData,
        lowStock: lowStockData,
        waste: wasteData
      }
    });
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory analytics',
      error: error.message
    });
  }
});

// Get staff performance analytics
app.get('/api/analytics/staff-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRangeForPeriod(period);

    const revenueColumn = currency === 'INR' ? 'total_amount_inr' : 'total_amount_usd';

    // Staff performance
    const [staffData] = await pool.execute(`
      SELECT 
        s.id,
        s.name as staff_name,
        s.role,
        COUNT(o.id) as orders_handled,
        COALESCE(SUM(${revenueColumn}), 0) as total_revenue,
        COALESCE(AVG(${revenueColumn}), 0) as avg_order_value,
        AVG(o.preparation_time) as avg_preparation_time
      FROM staff s
      LEFT JOIN orders o ON s.id = o.staff_id AND o.created_at >= ? AND o.created_at < ?
      GROUP BY s.id, s.name, s.role
      ORDER BY total_revenue DESC
    `, [startDate, endDate]);

    // Service time analysis
    const [serviceTimeData] = await pool.execute(`
      SELECT 
        HOUR(o.created_at) as hour,
        AVG(o.preparation_time) as avg_preparation_time,
        AVG(o.service_time) as avg_service_time,
        COUNT(o.id) as order_count
      FROM orders o
      WHERE o.created_at >= ? AND o.created_at < ?
      GROUP BY HOUR(o.created_at)
      ORDER BY hour
    `, [startDate, endDate]);

    // Format the data for the charts
    const formattedStaffData = staffData.map(row => ({
      ...row,
      [`total_revenue_${currency.toLowerCase()}`]: row.total_revenue,
      [`avg_order_value_${currency.toLowerCase()}`]: row.avg_order_value
    }));

    res.json({
      success: true,
      data: {
        staff: formattedStaffData,
        serviceTime: serviceTimeData
      }
    });
  } catch (error) {
    console.error('Error fetching staff performance analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff performance analytics',
      error: error.message
    });
  }
});
//---------------------------------


// Apply authentication middleware to protected routes
// app.use('/api/orders', authenticateToken);

// Enhanced database initialization
// Enhanced database initialization
const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');

    // Read and execute SQL file
    const sqlFilePath = path.join(__dirname, 'database.sql');
    if (fs.existsSync(sqlFilePath)) {
      const sqlFile = fs.readFileSync(sqlFilePath, 'utf8');

      // Split the file into individual statements
      const statements = sqlFile.split(';').filter(statement => statement.trim());

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await pool.execute(statement);
          } catch (error) {
            // Ignore specific, harmless errors
            const errorMessage = error.message;
            if (
              errorMessage.includes('Duplicate entry') ||
              errorMessage.includes('already exists') ||
              // This is the key part: ignore the error if the column already exists
              errorMessage.includes('Duplicate column name') ||
              errorMessage.includes('ER_DUP_FIELDNAME')
            ) {
              console.log('Ignoring expected error:', errorMessage);
            } else {
              // Log other unexpected errors
              console.error('Error executing SQL statement:', error.message);
              console.log('Statement:', statement.substring(0, 100) + '...');
            }
          }
        }
      }

      console.log('Database initialized successfully');
    } else {
      console.log('Database initialization file not found, skipping...');
    }

  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Ingredients Endpoints
app.get('/api/ingredients', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT *, 
      current_stock as quantity, 
      min_stock_level as threshold 
      FROM ingredients 
      ORDER BY name
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching ingredients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ingredients', error: error.message });
  }
});

app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, quantity, unit, threshold, current_stock, min_stock_level, cost_per_unit } = req.body;

    // Validation
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!unit) return res.status(400).json({ success: false, message: 'Unit is required' });

    // Handle both naming conventions, default to 0 if undefined
    const stock = quantity !== undefined ? quantity : (current_stock !== undefined ? current_stock : 0);
    const minStock = threshold !== undefined ? threshold : (min_stock_level !== undefined ? min_stock_level : 0);
    const cost = cost_per_unit !== undefined ? cost_per_unit : 0.00;

    const [result] = await pool.execute(
      'INSERT INTO ingredients (name, current_stock, unit, min_stock_level, cost_per_unit) VALUES (?, ?, ?, ?, ?)',
      [name, stock, unit, minStock, cost]
    );

    const [newIngredient] = await pool.execute(`
      SELECT *, 
      current_stock as quantity, 
      min_stock_level as threshold 
      FROM ingredients WHERE id = ?
    `, [result.insertId]);

    res.json({ success: true, data: newIngredient[0] });
  } catch (error) {
    console.error('Error creating ingredient:', error);
    res.status(500).json({ success: false, message: 'Failed to create ingredient', error: error.message });
  }
});

app.put('/api/ingredients/:id', async (req, res) => {
  try {
    const { name, quantity, unit, threshold, current_stock, min_stock_level, cost_per_unit } = req.body;

    // Validation
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!unit) return res.status(400).json({ success: false, message: 'Unit is required' });

    const stock = quantity !== undefined ? quantity : (current_stock !== undefined ? current_stock : 0);
    const minStock = threshold !== undefined ? threshold : (min_stock_level !== undefined ? min_stock_level : 0);
    const cost = cost_per_unit !== undefined ? cost_per_unit : 0.00;

    await pool.execute(
      'UPDATE ingredients SET name = ?, current_stock = ?, unit = ?, min_stock_level = ?, cost_per_unit = ? WHERE id = ?',
      [name, stock, unit, minStock, cost, req.params.id]
    );

    const [updatedIngredient] = await pool.execute(`
      SELECT *, 
      current_stock as quantity, 
      min_stock_level as threshold 
      FROM ingredients WHERE id = ?
    `, [req.params.id]);

    res.json({ success: true, data: updatedIngredient[0] });
  } catch (error) {
    console.error('Error updating ingredient:', error);
    res.status(500).json({ success: false, message: 'Failed to update ingredient', error: error.message });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Delete related records first to satisfy foreign key constraints
    await connection.execute('DELETE FROM recipe_items WHERE ingredient_id = ?', [req.params.id]);
    await connection.execute('DELETE FROM waste_log WHERE ingredient_id = ?', [req.params.id]);

    // Now delete the ingredient
    await connection.execute('DELETE FROM ingredients WHERE id = ?', [req.params.id]);

    await connection.commit();
    res.json({ success: true, message: 'Ingredient deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting ingredient:', error);
    res.status(500).json({ success: false, message: 'Failed to delete ingredient', error: error.message });
  } finally {
    connection.release();
  }
});

// Feedback Endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { order_id, customer_id, rating, comments } = req.body;
    await pool.execute(
      'INSERT INTO order_feedback (order_id, customer_id, rating, comments) VALUES (?, ?, ?, ?)',
      [order_id, customer_id, rating, comments]
    );
    res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to submit feedback', error: error.message });
  }
});

// Cancellation Endpoints
app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { reason, cancelled_by } = req.body;
    // Update order status
    await pool.execute('UPDATE orders SET order_status = "cancelled" WHERE id = ?', [req.params.id]);
    // Log cancellation
    await pool.execute(
      'INSERT INTO order_cancellations (order_id, reason, cancelled_by) VALUES (?, ?, ?)',
      [req.params.id, reason, cancelled_by]
    );
    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order', error: error.message });
  }
});

app.post('/api/orders/:id/items/:itemId/cancel', async (req, res) => {
  try {
    const { reason, cancelled_by } = req.body;
    // Update item status
    await pool.execute('UPDATE order_items SET item_status = "cancelled" WHERE id = ? AND order_id = ?', [req.params.itemId, req.params.id]);
    // Log cancellation
    await pool.execute(
      'INSERT INTO order_cancellations (order_id, item_id, reason, cancelled_by) VALUES (?, ?, ?, ?)',
      [req.params.id, req.params.itemId, reason, cancelled_by]
    );
    res.json({ success: true, message: 'Item cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel item', error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;

// Initialize and start server
const startServer = async () => {
  try {
    // Test database connection first
    const dbConnected = await testDatabaseConnection();

    if (!dbConnected) {
      console.log('Warning: Database connection failed, but server will continue running...');
    }

    httpServer.listen(PORT, '0.0.0.0', async () => {
      console.log(`Server is running and accessible on the network at port ${PORT}`);
      console.log(`API endpoints available at http://localhost:${PORT}/api`);

      // Initialize database after server starts
      await initializeDatabase();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, io };