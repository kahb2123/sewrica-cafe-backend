const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Config and Middleware
dotenv.config();
const connectDB = require('./src/config/db');
const { initSocket } = require('./src/services/socketService');
const { errorHandler, notFound } = require('./src/middleware/errorMiddleware');

// Initialize Express and HTTP Server
const app = express();
const server = http.createServer(app);

// Connect to Database
connectDB();

// CORS Configuration
const allowedOrigins = [
  'https://sewrica-cafe-frontend.vercel.app',
  'https://kahb2123.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
  // ... any others
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.match(/\.vercel\.app$/) || origin.match(/^http:\/\/localhost:\d+$/)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize Socket.io
const io = initSocket(server, allowedOrigins);
app.set('io', io);

// Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/menu', require('./src/routes/menuRoutes'));
app.use('/api/orders', require('./src/routes/orderRoutes'));
// ... other routes

app.get('/', (req, res) => res.json({ message: 'Sewrica Cafe API Running' }));

// Error Handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
