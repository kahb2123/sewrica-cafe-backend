const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('admin', 'supply_chain'));

router.get('/', async (req, res) => {
  try {
    const ingredients = await Ingredient.find().sort({ name: 1 });
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load ingredients' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, unit, quantity = 0, reorderLevel = 0, supplier = '' } = req.body;
    if (!name || !unit || Number(quantity) < 0 || Number(reorderLevel) < 0) {
      return res.status(400).json({ success: false, message: 'Name, unit, and valid stock values are required' });
    }
    const ingredient = await Ingredient.create({ name, unit, quantity: Number(quantity), reorderLevel: Number(reorderLevel), supplier });
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 500;
    res.status(status).json({ success: false, message: error.code === 11000 ? 'Ingredient already exists' : 'Failed to create ingredient' });
  }
});

router.post('/:id/purchases', async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    const unitCost = Number(req.body.unitCost || 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return res.status(400).json({ success: false, message: 'Purchase quantity must be greater than 0 and cost cannot be negative' });
    }

    const ingredient = await Ingredient.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { quantity },
        $set: { supplier: String(req.body.supplier || '') },
        $push: { purchases: { quantity, unitCost, supplier: String(req.body.supplier || ''), purchasedBy: req.user._id } }
      },
      { new: true, runValidators: true }
    );
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to record purchase' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.unit !== undefined) updates.unit = req.body.unit;
    if (req.body.quantity !== undefined) updates.quantity = Number(req.body.quantity);
    if (req.body.reorderLevel !== undefined) updates.reorderLevel = Number(req.body.reorderLevel);
    if (req.body.supplier !== undefined) updates.supplier = req.body.supplier;
    const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update ingredient' });
  }
});

module.exports = router;