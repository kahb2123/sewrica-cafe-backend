const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();

// ========== FIXED CORS CONFIGURATION ==========
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://kahb2123.github.io',
  'https://sewrica-cafe-backend.onrender.com',
  'https://sewrica-cafe-frontend-git-main-kahb2123s-projects.vercel.app',
  'https://sewrica-cafe-frontend-3gmdpiv67-kahb2123s-projects.vercel.app',
  /\.vercel\.app$/ // This allows ANY vercel.app subdomain
];

// Main CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Check if origin matches vercel.app pattern
    if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sewrica_cafe')
  .then(() => {
    console.log('✅ MongoDB Connected');
    console.log('📊 Database Name: sewrica_cafe');
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const menuRoutes = require('./src/routes/menuRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const staffRoutes = require('./src/routes/staffRoutes');
const setupRoutes = require('./src/routes/setup');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/setup', setupRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to SEWRICA Cafe API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      menu: '/api/menu',
      orders: '/api/orders',
      admin: '/api/admin',
      staff: '/api/staff',
      setup: '/api/setup'
    }
  });
});

// Test uploads route
app.get('/test-uploads', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.json({ error: err.message });
    }
    res.json({
      message: 'Uploads folder contents',
      files: files,
      path: uploadsDir
    });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uploads: fs.existsSync(path.join(__dirname, 'uploads'))
  });
});

// Create uploads folder if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads folder');
}

// ===== DEBUG ROUTE - PLACED HERE AFTER ALL ROUTES =====
app.get('/api/debug-routes', (req, res) => {
  try {
    // Check if router exists
    if (!app._router || !app._router.stack) {
      return res.json({ 
        message: 'Router not initialized yet. Try again after server starts.',
        routes: [] 
      });
    }
    
    const routes = [];
    
    app._router.stack.forEach(layer => {
      // Handle regular routes (like '/', '/test-uploads', etc.)
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        routes.push({
          path: layer.route.path,
          methods: methods,
          type: 'direct'
        });
      }
      // Handle router middleware (our /api routes)
      else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        // Get the base path from the layer's regexp
        let basePath = '';
        if (layer.regexp) {
          const regexpStr = layer.regexp.toString();
          // Extract the base path from regex like /^\\/api\\/auth\\/?(?=\\/|$)/i
          const match = regexpStr.match(/\/\^\\\/([^\\/]+)/);
          if (match && match[1]) {
            basePath = '/' + match[1].replace(/\\\//g, '/');
          }
        }
        
        // Iterate through the router's stack
        layer.handle.stack.forEach(nestedLayer => {
          if (nestedLayer.route) {
            const methods = Object.keys(nestedLayer.route.methods).join(', ').toUpperCase();
            routes.push({
              path: basePath + nestedLayer.route.path,
              methods: methods,
              type: 'nested'
            });
          }
        });
      }
    });
    
    // Sort routes by path
    routes.sort((a, b) => a.path.localeCompare(b.path));
    
    res.json({
      success: true,
      totalRoutes: routes.length,
      routes: routes
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ 
      message: 'Error generating route list',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// ===== END DEBUG ROUTE =====

// 404 handler (this should be LAST)
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads folder: ${path.join(__dirname, 'uploads')}`);
  
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    console.log(`📸 Images in uploads: ${files.length} files`);
    files.slice(0, 5).forEach(f => console.log(`   - ${f}`));
  }
  
  console.log('\n📡 Available API endpoints:');
  console.log('   GET  /                    - API Info');
  console.log('   GET  /api/health           - Health check');
  console.log('   GET  /api/debug-routes      - Debug routes');
  
  // Auth endpoints
  console.log('\n🔐 AUTH ENDPOINTS:');
  console.log('   POST /api/auth/register    - Register');
  console.log('   POST /api/auth/login       - Login');
  console.log('   GET  /api/auth/profile     - Get profile');
  
  // Menu endpoints
  console.log('\n🍽️ MENU ENDPOINTS:');
  console.log('   GET  /api/menu              - Get menu items');
  console.log('   POST /api/menu              - Create menu item (admin)');
  console.log('   PUT  /api/menu/:id          - Update menu item (admin)');
  console.log('   DELETE /api/menu/:id        - Delete menu item (admin)');
  
  // Order endpoints
  console.log('\n📦 ORDER ENDPOINTS:');
  console.log('   POST /api/orders            - Create new order');
  console.log('   GET  /api/orders/my-orders  - Get user orders');
  console.log('   GET  /api/orders/:id        - Get single order');
  console.log('   PATCH /api/orders/:id/cancel - Cancel order');
  console.log('   PATCH /api/orders/:id/status - Update order status (staff)');
  
  // Payment endpoints
  console.log('\n💰 PAYMENT ENDPOINTS:');
  console.log('   POST /api/payments/create-payment-intent - Create Stripe payment intent');
  console.log('   POST /api/payments/webhook - Stripe webhook');
  console.log('   GET  /api/payments/payment-methods - Get saved payment methods');
  console.log('   POST /api/payments/cash-payment - Process cash payment');
  
  // Admin endpoints
  console.log('\n👑 ADMIN ENDPOINTS:');
  console.log('   GET  /api/admin/stats       - Admin stats');
  console.log('   GET  /api/admin/orders      - Get all orders');
  console.log('   GET  /api/admin/users       - Get all users');
  console.log('   GET  /api/admin/reports/daily - Daily reports');
  
  // Staff endpoints
  console.log('\n👨‍🍳 STAFF MANAGEMENT ENDPOINTS:');
  console.log('   GET  /api/staff/:role        - Get staff by role');
  console.log('   POST /api/staff/assign-chef/:orderId - Assign order to chef');
  console.log('   POST /api/staff/assign-delivery/:orderId - Assign order to delivery');
  console.log('   POST /api/staff/start-cooking/:orderId - Chef starts cooking');
  console.log('   POST /api/staff/complete-cooking/:orderId - Chef completes cooking');
  console.log('   POST /api/staff/start-delivery/:orderId - Delivery starts');
  console.log('   POST /api/staff/complete-delivery/:orderId - Delivery completes');
  
  // Staff Reports
  console.log('\n📊 STAFF REPORTS:');
  console.log('   GET  /api/staff/reports/summary - Staff performance summary');
  console.log('   GET  /api/staff/reports/chef/:chefId - Chef performance report');
  console.log('   GET  /api/staff/reports/delivery/:deliveryId - Delivery report');
  
  // Setup
  console.log('\n⚙️ SETUP:');
  console.log('   ✅ GET  /api/setup/create-admin - Create admin user (ONE-TIME)');
});