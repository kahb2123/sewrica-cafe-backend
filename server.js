const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ IMPORTANT: Serve static files from uploads folder
// This MUST be before your routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected: localhost');
    console.log('📊 Database Name: sewrica_cafe');
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/menu', require('./src/routes/menuRoutes'));

// Test route to check if server is running
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to SEWRICA Cafe API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Test route for images
app.get('/test-uploads', (req, res) => {
  const fs = require('fs');
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

// 404 handler - This should be LAST
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads folder: ${path.join(__dirname, 'uploads')}`);
  
  // Check if uploads folder exists
  const fs = require('fs');
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    console.log(`📸 Images in uploads: ${files.length} files`);
    files.slice(0, 5).forEach(f => console.log(`   - ${f}`));
  } else {
    console.log('❌ Uploads folder does not exist!');
  }
});