// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);

// ========== CORS CONFIGURATION ==========
const allowedOrigins = [
  // Production URLs
  'https://sewrica-cafe-frontend.vercel.app',
  'https://sewrica-cafe-frontend-git-main-kahb2123s-projects.vercel.app',
  'https://sewrica-cafe-frontend-3gmdpiv67-kahb2123s-projects.vercel.app',
  'https://kahb2123.github.io',
  'https://sewrica-cafe-backend.onrender.com',
  
  // Local development URLs (any port)
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000'
];

// Main CORS configuration - this handles OPTIONS preflight automatically
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) {
      return callback(null, true);
    }
    
    // For local development, allow ALL localhost origins (any port)
    if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
      console.log('✅ CORS allowed localhost:', origin);
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed:', origin);
      return callback(null, true);
    }
    
    // Check if origin matches vercel.app pattern
    if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
      console.log('✅ CORS allowed Vercel:', origin);
      return callback(null, true);
    }
    
    // In development, allow all (fallback)
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️ CORS allowed (development mode):', origin);
      return callback(null, true);
    }
    
    console.log('❌ CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  maxAge: 86400 // 24 hours
}));

// DO NOT ADD app.options('*', cors()) - it causes errors and is unnecessary!

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ========== SOCKET.IO SETUP ==========
const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
        return callback(null, true);
      }
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io accessible to routes
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  console.log('   Total connected clients:', io.engine.clientsCount);

  // Customer registers to their order room
  socket.on('register-order', (orderId) => {
    const roomName = `order-${orderId}`;
    socket.join(roomName);
    console.log(`📦 Customer joined room: ${roomName}`);
    
    socket.emit('registered', { 
      orderId, 
      room: roomName,
      message: 'Successfully registered for order updates' 
    });
  });

  // Staff joins their staff room
  socket.on('register-staff', (staffId, role) => {
    const roomName = `staff-${role}`;
    socket.join(roomName);
    console.log(`👨‍🍳 Staff joined room: ${roomName} (ID: ${staffId})`);
    
    socket.emit('staff-registered', {
      role,
      room: roomName,
      message: `Registered as ${role}`
    });
  });

  // Chef specific registration
  socket.on('register-chef', (chefId) => {
    socket.join(`chef-${chefId}`);
    socket.join('staff-cook');
    console.log(`👨‍🍳 Chef registered: ${chefId}`);
  });

  // Delivery specific registration
  socket.on('register-delivery', (deliveryId) => {
    socket.join(`delivery-${deliveryId}`);
    socket.join('staff-delivery');
    console.log(`🚚 Delivery registered: ${deliveryId}`);
  });

  // Admin registration
  socket.on('register-admin', (adminId) => {
    socket.join('staff-admin');
    console.log(`👑 Admin registered: ${adminId}`);
  });

  // Cashier registration
  socket.on('register-cashier', (cashierId) => {
    socket.join('staff-cashier');
    console.log(`💰 Cashier registered: ${cashierId}`);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Client disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sewrica_cafe';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ MongoDB Connected');
    console.log('📊 Database Name:', mongoose.connection.name);
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
const lotteryRoutes = require('./src/routes/lotteryRoutes');
const giveawayRoutes = require('./src/routes/giveawayRoutes');
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/giveaway', giveawayRoutes);

// ========== API ROUTES ==========

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to SEWRICA Cafe API',
    status: 'running',
    timestamp: new Date().toISOString(),
    socketIO: 'enabled',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: '/api/auth',
      menu: '/api/menu',
      orders: '/api/orders',
      admin: '/api/admin',
      staff: '/api/staff',
      setup: '/api/setup',
      health: '/api/health',
      socketHealth: '/api/socket-health'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uploads: fs.existsSync(path.join(__dirname, 'uploads')),
    socketIO: 'enabled',
    environment: process.env.NODE_ENV || 'development',
    cors: 'enabled for localhost and production domains'
  });
});

// Socket.IO health check
app.get('/api/socket-health', (req, res) => {
  res.json({
    status: 'Socket.io running',
    connections: io.engine.clientsCount,
    clients: Object.keys(io.sockets.sockets).length,
    transports: ['websocket', 'polling'],
    timestamp: new Date().toISOString()
  });
});

// Create uploads folder if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads folder');
}

// Debug route to see all registered routes
app.get('/api/debug-routes', (req, res) => {
  try {
    const routes = [];
    
    function extractRoutes(stack, basePath = '') {
      if (!stack) return;
      
      stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
          routes.push({
            path: basePath + layer.route.path,
            methods: methods,
            type: 'route'
          });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
          let routerPath = '';
          if (layer.regexp) {
            const regexpStr = layer.regexp.toString();
            const match = regexpStr.match(/\/\^\\\/([^\\/]+)/);
            if (match && match[1]) {
              routerPath = '/' + match[1].replace(/\\\//g, '/');
            }
          }
          extractRoutes(layer.handle.stack, basePath + routerPath);
        }
      });
    }
    
    if (app._router && app._router.stack) {
      extractRoutes(app._router.stack);
    }
    
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
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
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
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads folder: ${path.join(__dirname, 'uploads')}`);
  console.log(`🔌 Socket.io server initialized`);
  console.log(`🌐 WebSocket endpoint: http://localhost:${PORT}/socket.io/`);
  console.log(`📊 Socket.io health check: http://localhost:${PORT}/api/socket-health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS enabled for all localhost ports and production domains`);
  
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    console.log(`📸 Images in uploads: ${files.length} files`);
  }
  
  console.log('\n📡 Available API endpoints:');
  console.log('   GET  /                    - API Info');
  console.log('   GET  /api/health          - Health check');
  console.log('   GET  /api/socket-health   - Socket.io status');
  console.log('   GET  /api/debug-routes    - Debug routes');
  console.log('   GET  /api/setup/create-admin - Create admin user');
  console.log('   GET  /api/setup/create-staff - Create staff users');
});