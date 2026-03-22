// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Giveaway = require('../models/Giveaway');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/giveaways');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'giveaway-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Get current active giveaway
router.get('/active', async (req, res) => {
  try {
    const giveaway = await Giveaway.findOne({ 
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    
    // Construct full image URL
    if (giveaway && giveaway.image) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      giveaway.imageUrl = `${baseUrl}/uploads/giveaways/${giveaway.image}`;
    }
    
    res.json({
      success: true,
      giveaway: giveaway || null
    });
  } catch (error) {
    console.error('Error fetching giveaway:', error);
    res.status(500).json({ message: 'Failed to fetch giveaway' });
  }
});

// Get all giveaways (admin)
router.get('/admin/all', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const giveaways = await Giveaway.find().sort({ createdAt: -1 });
    
    // Construct full image URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const giveawaysWithUrls = giveaways.map(g => ({
      ...g.toObject(),
      imageUrl: g.image ? `${baseUrl}/uploads/giveaways/${g.image}` : null
    }));
    
    res.json({
      success: true,
      giveaways: giveawaysWithUrls
    });
  } catch (error) {
    console.error('Error fetching giveaways:', error);
    res.status(500).json({ message: 'Failed to fetch giveaways' });
  }
});

// Create giveaway with image upload (admin)
router.post('/admin/create', protect, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { title, description, prize, startDate, endDate } = req.body;
    
    let image = null;
    if (req.file) {
      image = req.file.filename;
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
    
    // Construct full image URL for response
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const responseGiveaway = {
      ...giveaway.toObject(),
      imageUrl: image ? `${baseUrl}/uploads/giveaways/${image}` : null
    };
    
    res.json({
      success: true,
      message: 'Giveaway created successfully',
      giveaway: responseGiveaway
    });
  } catch (error) {
    console.error('Error creating giveaway:', error);
    res.status(500).json({ message: 'Failed to create giveaway' });
  }
});

// Update giveaway with image upload (admin)
router.put('/admin/:id', protect, upload.single('image'), async (req, res) => {
  try {
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
      // Delete old image if exists
      if (giveaway.image) {
        const oldImagePath = path.join(__dirname, '../../uploads/giveaways', giveaway.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      giveaway.image = req.file.filename;
    }
    
    await giveaway.save();
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const responseGiveaway = {
      ...giveaway.toObject(),
      imageUrl: giveaway.image ? `${baseUrl}/uploads/giveaways/${giveaway.image}` : null
    };
    
    res.json({
      success: true,
      message: 'Giveaway updated successfully',
      giveaway: responseGiveaway
    });
  } catch (error) {
    console.error('Error updating giveaway:', error);
    res.status(500).json({ message: 'Failed to update giveaway' });
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
      const imagePath = path.join(__dirname, '../../uploads/giveaways', giveaway.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await Giveaway.findByIdAndDelete(req.params.id);
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