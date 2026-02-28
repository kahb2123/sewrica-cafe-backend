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

// ========== SOCKET.IO SETUP ==========
const io = socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://kahb2123.github.io',
        'https://sewrica-cafe-backend.onrender.com',
        'https://sewrica-cafe-frontend-git-main-kahb2123s-projects.vercel.app',
        'https://sewrica-cafe-frontend-3gmdpiv67-kahb2123s-projects.vercel.app',
        /\.vercel\.app$/
      ];
      
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      
      if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
        return callback(null, true);
      }
      
      callback(null, true); // Allow all in development
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  // Customer registers to their order room
  socket.on('register-order', (orderId) => {
    const roomName = `order-${orderId}`;
    socket.join(roomName);
    console.log(`📦 Customer joined room: ${roomName}`);
    
    // Send confirmation
    socket.emit('registered', { orderId, room: roomName });
  });

  // Staff joins their staff room
  socket.on('register-staff', (staffId, role) => {
    const roomName = `staff-${role}`;
    socket.join(roomName);
    console.log(`👨‍🍳 Staff joined room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// ========== END SOCKET.IO SETUP ==========

// ========== CORS CONFIGURATION ==========
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://kahb2123.github.io',
  'https://sewrica-cafe-backend.onrender.com',
  'https://sewrica-cafe-frontend-git-main-kahb2123s-projects.vercel.app',
  'https://sewrica-cafe-frontend-3gmdpiv67-kahb2123s-projects.vercel.app',
  /\.vercel\.app$/
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
      return callback(null, true);
    }
    
    callback(null, true);
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

// 404 handler
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
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads folder: ${path.join(__dirname, 'uploads')}`);
  console.log(`🔌 Socket.io server initialized`);
});