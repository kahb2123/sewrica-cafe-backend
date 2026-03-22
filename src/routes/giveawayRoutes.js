// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Giveaway = require('../models/Giveaway');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads/giveaways');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created giveaway uploads directory:', uploadDir);
}

// Configure multer for image upload - More flexible file filter
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'giveaway-' + uniqueSuffix + ext);
  }
});

// More permissive file filter
const fileFilter = (req, file, cb) => {
  console.log('📸 File received:', file.originalname);
  console.log('📸 MIME type:', file.mimetype);
  
  // Allow more image types
  const allowedTypes = [
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/gif', 
    'image/webp',
    'image/bmp',
    'image/svg+xml'
  ];
  
  // Check by mimetype
  if (allowedTypes.includes(file.mimetype)) {
    console.log('✅ Image accepted:', file.originalname);
    return cb(null, true);
  }
  
  // Also check by extension
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  
  if (allowedExts.includes(ext)) {
    console.log('✅ Image accepted by extension:', file.originalname);
    return cb(null, true);
  }
  
  console.log('❌ File rejected:', file.originalname, 'MIME:', file.mimetype);
  cb(new Error(`Only image files are allowed. Received: ${file.mimetype}`));
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (increased)
  fileFilter: fileFilter
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Max size is 10MB.' });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Get current active giveaway
router.get('/active', async (req, res) => {
  try {
    const giveaway = await Giveaway.findOne({ 
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    
    if (giveaway && giveaway.image) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      giveaway._doc.imageUrl = `${baseUrl}/uploads/giveaways/${giveaway.image}`;
    }
    
    res.json({
      success: true,
      giveaway: giveaway || null
    });
  } catch (error) {
    console.error('Error fetching giveaway:', error);
    res.status(500).json({ message: 'Failed to fetch giveaway', error: error.message });
  }
});

// Get all giveaways (admin)
router.get('/admin/all', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const giveaways = await Giveaway.find().sort({ createdAt: -1 });
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const giveawaysWithUrls = giveaways.map(g => {
      const gObj = g.toObject();
      gObj.imageUrl = g.image ? `${baseUrl}/uploads/giveaways/${g.image}` : null;
      return gObj;
    });
    
    res.json({
      success: true,
      giveaways: giveawaysWithUrls
    });
  } catch (error) {
    console.error('Error fetching giveaways:', error);
    res.status(500).json({ message: 'Failed to fetch giveaways', error: error.message });
  }
});

// Create giveaway with image upload (admin)
router.post('/admin/create', protect, upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📝 Creating giveaway...');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { title, description, prize, startDate, endDate } = req.body;
    
    // Validate required fields
    if (!title || !description || !prize || !startDate || !endDate) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        missing: { 
          title: !title, 
          description: !description, 
          prize: !prize, 
          startDate: !startDate, 
          endDate: !endDate 
        }
      });
    }
    
    let image = null;
    if (req.file) {
      image = req.file.filename;
      console.log('✅ Image uploaded:', image);
    } else {
      console.log('⚠️ No image uploaded');
    }
    
    const giveaway = await Giveaway.create({
      title,
      description,
      image,
      prize,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true,
      createdBy: req.user._id
    });
    
    console.log('✅ Giveaway created:', giveaway._id);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const responseGiveaway = giveaway.toObject();
    responseGiveaway.imageUrl = image ? `${baseUrl}/uploads/giveaways/${image}` : null;
    
    res.json({
      success: true,
      message: 'Giveaway created successfully',
      giveaway: responseGiveaway
    });
  } catch (error) {
    console.error('❌ Error creating giveaway:', error);
    res.status(500).json({ 
      message: 'Failed to create giveaway', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update giveaway with image upload (admin)
router.put('/admin/:id', protect, upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📝 Updating giveaway:', req.params.id);
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { id } = req.params;
    const { title, description, prize, startDate, endDate, isActive } = req.body;
    
    const giveaway = await Giveaway.findById(id);
    if (!giveaway) {
      return res.status(404).json({ message: 'Giveaway not found' });
    }
    
    // Update fields
    if (title) giveaway.title = title;
    if (description) giveaway.description = description;
    if (prize) giveaway.prize = prize;
    if (startDate) giveaway.startDate = new Date(startDate);
    if (endDate) giveaway.endDate = new Date(endDate);
    if (isActive !== undefined) giveaway.isActive = isActive;
    
    // Handle image upload
    if (req.file) {
      if (giveaway.image) {
        const oldImagePath = path.join(uploadDir, giveaway.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
          console.log('🗑️ Deleted old image:', giveaway.image);
        }
      }
      giveaway.image = req.file.filename;
      console.log('✅ New image uploaded:', giveaway.image);
    }
    
    await giveaway.save();
    console.log('✅ Giveaway updated:', giveaway._id);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const responseGiveaway = giveaway.toObject();
    responseGiveaway.imageUrl = giveaway.image ? `${baseUrl}/uploads/giveaways/${giveaway.image}` : null;
    
    res.json({
      success: true,
      message: 'Giveaway updated successfully',
      giveaway: responseGiveaway
    });
  } catch (error) {
    console.error('❌ Error updating giveaway:', error);
    res.status(500).json({ 
      message: 'Failed to update giveaway', 
      error: error.message 
    });
  }
});

// Delete giveaway (admin)
router.delete('/admin/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const giveaway = await Giveaway.findById(req.params.id);
    if (giveaway && giveaway.image) {
      const imagePath = path.join(uploadDir, giveaway.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('🗑️ Deleted image:', giveaway.image);
      }
    }
    
    await Giveaway.findByIdAndDelete(req.params.id);
    console.log('✅ Giveaway deleted:', req.params.id);
    
    res.json({
      success: true,
      message: 'Giveaway deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting giveaway:', error);
    res.status(500).json({ message: 'Failed to delete giveaway' });
  }
});

module.exports = router;