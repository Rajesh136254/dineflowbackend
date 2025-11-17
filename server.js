const express = require('express');
const cors = require('cors');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Enhanced CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

io.on('connection', (socket) => {
  console.log('Kitchen dashboard connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Kitchen dashboard disconnected:', socket.id);
  });
});

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.execute('SELECT 1');
    res.json({ 
      status: 'ok', 
      message: 'Restaurant QR Ordering System API',
      database: 'connected'
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
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
    
    // Ensure we're sending JSON
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch menu item',
      error: error.message 
    });
  }
});

app.post('/api/menu', async (req, res) => {
  try {
    const { name, description, price_inr, price_usd, category, image_url, is_available } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO menu_items (name, description, price_inr, price_usd, category, image_url, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description, price_inr, price_usd, category, image_url || null, is_available !== false]
    );
    
    const [newItem] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: newItem[0] });
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create menu item',
      error: error.message 
    });
  }
});

app.put('/api/menu/:id', async (req, res) => {
  try {
    const { name, description, price_inr, price_usd, category, image_url, is_available } = req.body;
    const [result] = await pool.execute(
      'UPDATE menu_items SET name = ?, description = ?, price_inr = ?, price_usd = ?, category = ?, image_url = ?, is_available = ? WHERE id = ?',
      [name, description, price_inr, price_usd, category, image_url, is_available, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    
    const [updatedItem] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: updatedItem[0] });
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete menu item',
      error: error.message 
    });
  }
});

// Table endpoints with enhanced error handling
app.get('/api/tables', async (req, res) => {
  try {
    console.log('Fetching tables...');
    const [rows] = await pool.execute(
      'SELECT * FROM restaurant_tables WHERE is_active = true ORDER BY table_number'
    );
    console.log(`Found ${rows.length} tables`);
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tables',
      error: error.message 
    });
  }
});

app.get('/api/tables/:tableNumber', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM restaurant_tables WHERE table_number = ?',
      [req.params.tableNumber]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching table:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch table',
      error: error.message 
    });
  }
});

app.post('/api/tables', async (req, res) => {
  try {
    const { table_number, table_name } = req.body;
    const qr_code_data = `table-${table_number}`;
    const [result] = await pool.execute(
      'INSERT INTO restaurant_tables (table_number, table_name, qr_code_data) VALUES (?, ?, ?)',
      [table_number, table_name, qr_code_data]
    );
    
    const [newTable] = await pool.execute('SELECT * FROM restaurant_tables WHERE id = ?', [result.insertId]);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: newTable[0] });
  } catch (error) {
    console.error('Error creating table:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create table',
      error: error.message 
    });
  }
});

app.put('/api/tables/:id', async (req, res) => {
  try {
    const { table_number, table_name } = req.body;
    const qr_code_data = `table-${table_number}`;
    const [result] = await pool.execute(
      'UPDATE restaurant_tables SET table_number = ?, table_name = ?, qr_code_data = ? WHERE id = ?',
      [table_number, table_name, qr_code_data, req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }
    
    const [updatedTable] = await pool.execute('SELECT * FROM restaurant_tables WHERE id = ?', [req.params.id]);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: updatedTable[0] });
  } catch (error) {
    console.error('Error updating table:', error);
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete table',
      error: error.message 
    });
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'Category created successfully',
      data: { name: trimmedName }
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'Category deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.setHeader('Content-Type', 'application/json');
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
    const { status, start_date, end_date } = req.query;
    let query = `
      SELECT o.*, 
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', oi.id,
          'order_id', oi.order_id,
          'menu_item_id', oi.menu_item_id,
          'item_name', oi.item_name,
          'quantity', oi.quantity,
          'price_inr', oi.price_inr,
          'price_usd', oi.price_usd,
          'created_at', oi.created_at
        )) FROM order_items oi WHERE oi.order_id = o.id) as items
      FROM orders o
    `;
    const params = [];
    const conditions = [];
    
    if (status) {
      conditions.push(`o.order_status = ?`);
      params.push(status);
    }
    
    if (start_date) {
      conditions.push(`o.created_at >= ?`);
      params.push(start_date);
    }
    
    if (end_date) {
      conditions.push(`o.created_at <= ?`);
      params.push(end_date);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY o.created_at DESC';
    
    const [rows] = await pool.execute(query, params);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
});

app.post('/api/orders', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { table_number, items, currency, payment_method } = req.body;
    
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
      'INSERT INTO orders (table_id, table_number, total_amount_inr, total_amount_usd, currency, payment_method, order_status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [table_id, table_number, total_inr.toFixed(2), total_usd.toFixed(2), currency, payment_method, 'pending', payment_method === 'cash' ? 'pending' : 'paid']
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
    
    io.emit('new-order', orderData);
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: orderData });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: updatedOrder[0] });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
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
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch analytics',
      error: error.message 
    });
  }
});

// Analytics page endpoints
app.get('/api/analytics/test', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ success: true, message: 'Analytics API is working' });
});

// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7); // Last 7 days
      endDate = now;
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 28); // Last 4 weeks
      endDate = now;
      break;
    case 'monthly':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 11); // Last 12 months
      endDate = now;
      break;
    case 'yearly':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 4); // Last 5 years
      endDate = now;
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      endDate = now;
  }

  return { startDate, endDate };
};

// Get summary analytics
// Replace the summary endpoint in server.js with this:
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Total orders
    const [totalOrdersResult] = await pool.execute(`
      SELECT COUNT(*) as total_orders
      FROM orders
      WHERE created_at BETWEEN ? AND ?
    `, [startDate, endDate]);
    const totalOrders = totalOrdersResult[0].total_orders;

    // Total revenue - use different queries based on currency
    let totalRevenue;
    if (currency === 'INR') {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_inr) as total_revenue
        FROM orders
        WHERE created_at BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    } else {
      const [totalRevenueResult] = await pool.execute(`
        SELECT SUM(total_amount_usd) as total_revenue
        FROM orders
        WHERE created_at BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalRevenue = totalRevenueResult[0].total_revenue || 0;
    }

    // Tables served
    const [tablesServedResult] = await pool.execute(`
      SELECT COUNT(DISTINCT table_id) as tables_served
      FROM orders
      WHERE created_at BETWEEN ? AND ?
    `, [startDate, endDate]);
    const tablesServed = tablesServedResult[0].tables_served || 0;

    // Average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.setHeader('Content-Type', 'application/json');
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
    console.error('Error fetching summary analytics:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch summary analytics',
      error: error.message 
    });
  }
});

// Get revenue and orders over time
// Replace the revenue-orders endpoint in server.js with this:
app.get('/api/analytics/revenue-orders', async (req, res) => {
  try {
    const { start = '2025-01-01', end = '2025-12-31' } = req.query;
    const startDate = `${start} 00:00:00`;
    const endDate   = `${end} 23:59:59`;

    const [rows] = await pool.query(
      `SELECT 
         DATE(o.created_at) AS date,
         COALESCE(SUM(oi.quantity * oi.price_inr),0) AS revenue,
         COUNT(DISTINCT o.id) AS orders
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.created_at BETWEEN ? AND ?
       GROUP BY DATE(o.created_at)
       ORDER BY date`,
      [startDate, endDate]
    );

    const result = rows.map(r => ({
      date: r.date,                 // string "YYYY-MM-DD"
      revenue: Number(r.revenue),
      orders: Number(r.orders)
    }));

    res.json(result);
  } catch (err) {
    console.error('Revenue orders error:', err.message);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

// ──────────────────────────────────────────────────────────────
//  GET /api/analytics/top-items
//  (replace the existing top-items endpoint with this one)
// ──────────────────────────────────────────────────────────────
app.get('/api/analytics/top-items', async (req, res) => {
  try {
    const { start = '2025-01-01', end = '2025-12-31' } = req.query;
    const startDate = `${start} 00:00:00`;
    const endDate   = `${end} 23:59:59`;
    const limit = 10;

    const [rows] = await pool.query(
      `SELECT 
         mi.name AS item_name,
         COALESCE(SUM(oi.quantity),0) AS quantity_sold,
         COALESCE(SUM(oi.quantity * oi.price_inr),0) AS revenue_inr,
         mi.category
       FROM menu_items mi
       LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
       LEFT JOIN orders o ON oi.order_id = o.id
                         AND o.created_at BETWEEN ? AND ?
       GROUP BY mi.id, mi.name, mi.category
       ORDER BY quantity_sold DESC
       LIMIT ?`,
      [startDate, endDate, limit]
    );

    res.json(rows);
  } catch (err) {
    console.error('Top items error:', err.message);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});

// Get category performance
// Replace the category-performance endpoint in server.js with this:
app.get('/api/analytics/category-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Use different queries based on currency
    let query;
    if (currency === 'INR') {
      query = `
        SELECT 
          mi.category,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(oi.quantity) as total_items,
          SUM(oi.quantity * oi.price_inr) as revenue_inr
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.created_at BETWEEN ? AND ?
        GROUP BY mi.category
        ORDER BY total_orders DESC
      `;
    } else {
      query = `
        SELECT 
          mi.category,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(oi.quantity) as total_items,
          SUM(oi.quantity * oi.price_usd) as revenue_usd
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.created_at BETWEEN ? AND ?
        GROUP BY mi.category
        ORDER BY total_orders DESC
      `;
    }

    const [results] = await pool.execute(query, [startDate, endDate]);

    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error fetching category performance:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch category performance',
      error: error.message 
    });
  }
});

// Get payment methods distribution
app.get('/api/analytics/payment-methods', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const [results] = await pool.execute(`
      SELECT 
        payment_method,
        COUNT(*) as count
      FROM orders
      WHERE created_at BETWEEN ? AND ?
      GROUP BY payment_method
    `, [startDate, endDate]);

    // Transform to key-value pairs
    const paymentMethods = {};
    results.forEach(item => {
      paymentMethods[item.payment_method] = item.count;
    });

    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment methods',
      error: error.message 
    });
  }
});

// Get table performance
// Replace the table-performance endpoint in server.js with this:
app.get('/api/analytics/table-performance', async (req, res) => {
  try {
    const { period = 'daily', currency = 'INR' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Use different queries based on currency
    let query;
    if (currency === 'INR') {
      query = `
        SELECT 
          t.table_number,
          t.table_name,
          COUNT(o.id) as total_orders,
          SUM(o.total_amount_inr) as total_revenue_inr,
          AVG(o.total_amount_inr) as avg_order_value_inr
        FROM restaurant_tables t
        LEFT JOIN orders o ON t.id = o.table_id AND o.created_at BETWEEN ? AND ?
        GROUP BY t.id, t.table_number, t.table_name
        ORDER BY total_revenue_inr DESC
      `;
    } else {
      query = `
        SELECT 
          t.table_number,
          t.table_name,
          COUNT(o.id) as total_orders,
          SUM(o.total_amount_usd) as total_revenue_usd,
          AVG(o.total_amount_usd) as avg_order_value_usd
        FROM restaurant_tables t
        LEFT JOIN orders o ON t.id = o.table_id AND o.created_at BETWEEN ? AND ?
        GROUP BY t.id, t.table_number, t.table_name
        ORDER BY total_revenue_usd DESC
      `;
    }

    const [results] = await pool.execute(query, [startDate, endDate]);

    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error fetching table performance:', error);
    res.setHeader('Content-Type', 'application/json');
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
    const { startDate, endDate } = getDateRange(period);

    const [results] = await pool.execute(`
      SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as orders,
        SUM(total_amount_inr) as revenue_inr,
        SUM(total_amount_usd) as revenue_usd
      FROM orders
      WHERE created_at BETWEEN ? AND ?
      GROUP BY HOUR(created_at)
      ORDER BY hour
    `, [startDate, endDate]);

    // Fill in missing hours with 0 orders
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      const hourData = results.find(item => item.hour === i);
      hourlyData.push({
        hour: i,
        hour_label: `${i}:00`,
        orders: hourData ? hourData.orders : 0,
        revenue_inr: hourData ? hourData.revenue_inr : 0,
        revenue_usd: hourData ? hourData.revenue_usd : 0
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      data: hourlyData
    });
  } catch (error) {
    console.error('Error fetching hourly orders:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch hourly orders',
      error: error.message 
    });
  }
});

// User authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    
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
    
    // Create new user
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [fullName, email, passwordHash]
    );
    
    // Get the created user
    const [newUser] = await pool.execute(
      'SELECT id, full_name, email, role FROM users WHERE id = ?',
      [result.insertId]
    );
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'User registered successfully',
      data: newUser[0]
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.setHeader('Content-Type', 'application/json');
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
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'Login successful',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.setHeader('Content-Type', 'application/json');
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

// Apply authentication middleware to protected routes
app.use('/api/orders', authenticateToken);

// Enhanced database initialization
const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');
    
    // Check if tables exist
    const [tables] = await pool.execute('SHOW TABLES');
    console.log('Existing tables:', tables);
    
    // Read and execute the SQL file
    const sqlFile = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    const statements = sqlFile.split(';').filter(statement => statement.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.execute(statement);
      }
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Don't exit the process, just log the error
  }
};

// MySQL connection pool with environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'Rajesh',
  password: process.env.DB_PASSWORD || 'Rajesh@254',
  database: process.env.DB_NAME || 'restaurant_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

// Start the server
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running and accessible on the network at port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
  
  // Initialize database after server starts
  await initializeDatabase();
  
  // Log database connection status
  pool.getConnection()
    .then(conn => {
      console.log('Database connected successfully');
      conn.release();
    })
    .catch(err => {
      console.error('Database connection failed:', err);
    });
});

module.exports = { app, io };