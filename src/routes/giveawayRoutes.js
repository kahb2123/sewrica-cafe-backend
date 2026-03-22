// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Giveaway = require('../models/Giveaway');

// Get current active giveaway
router.get('/active', async (req, res) => {
  try {
    const giveaway = await Giveaway.findOne({ 
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ createdAt: -1 });
    
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
    res.json({
      success: true,
      giveaways
    });
  } catch (error) {
    console.error('Error fetching giveaways:', error);
    res.status(500).json({ message: 'Failed to fetch giveaways' });
  }
});

// Create giveaway (admin)
router.post('/admin/create', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { title, description, imageUrl, prize, startDate, endDate } = req.body;
    
    const giveaway = await Giveaway.create({
      title,
      description,
      imageUrl,
      prize,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true,
      createdBy: req.user._id
    });
    
    res.json({
      success: true,
      message: 'Giveaway created successfully',
      giveaway
    });
  } catch (error) {
    console.error('Error creating giveaway:', error);
    res.status(500).json({ message: 'Failed to create giveaway' });
  }
});

// Update giveaway (admin)
router.put('/admin/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { id } = req.params;
    const updates = req.body;
    
    const giveaway = await Giveaway.findByIdAndUpdate(id, updates, { new: true });
    res.json({
      success: true,
      message: 'Giveaway updated successfully',
      giveaway
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