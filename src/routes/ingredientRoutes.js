const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient');
const IngredientWithdrawal = require('../models/IngredientWithdrawal');
const { protect } = require('../middleware/authMiddleware');
const { requirePagePermission } = require('../middleware/roleMiddleware');

router.use(protect);

const isNonNegativeNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

router.get('/', requirePagePermission('adminIngredients', 'read'), async (req, res) => {
  try {
    const ingredients = await Ingredient.find().sort({ name: 1 });
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load ingredients' });
  }
});

router.post('/', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const { name, unit, quantity = 0, unitPrice = 0, reorderLevel = 0, supplier = '' } = req.body;
    if (!name || !unit || !isNonNegativeNumber(quantity) || !isNonNegativeNumber(unitPrice) || !isNonNegativeNumber(reorderLevel)) {
      return res.status(400).json({ success: false, message: 'Name, unit, and valid stock and price values are required' });
    }
    const ingredient = await Ingredient.create({
      name,
      unit,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      reorderLevel: Number(reorderLevel),
      supplier
    });
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 500;
    res.status(status).json({ success: false, message: error.code === 11000 ? 'Ingredient already exists' : 'Failed to create ingredient' });
  }
});

// ========== STOCK OUT (withdrawals) ==========
// The availability check lives in the query filter so MongoDB applies it and the
// decrement in one atomic step. Two concurrent withdrawals cannot overdraw stock.

router.get('/withdrawals', requirePagePermission('adminIngredients', 'read'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const withdrawals = await IngredientWithdrawal.find().sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, count: withdrawals.length, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load withdrawals' });
  }
});

router.post('/withdrawals', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const { ingredientId } = req.body;
    const quantity = Number(req.body.quantity);
    const reason = IngredientWithdrawal.WITHDRAWAL_REASONS.includes(req.body.reason)
      ? req.body.reason
      : 'consumption';
    const note = String(req.body.note || '').trim();

    if (!ingredientId) {
      return res.status(400).json({ success: false, message: 'Select an ingredient' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const ingredient = await Ingredient.findOneAndUpdate(
      { _id: ingredientId, quantity: { $gte: quantity } },
      { $inc: { quantity: -quantity } },
      { new: true, runValidators: true }
    );

    if (!ingredient) {
      const current = await Ingredient.findById(ingredientId);
      if (!current) {
        return res.status(404).json({ success: false, message: 'Ingredient not found' });
      }
      return res.status(400).json({
        success: false,
        message: `Only ${current.quantity} ${current.unit} of ${current.name} is available in stock`
      });
    }

    const unitPrice = Number(ingredient.unitPrice) || 0;
    const withdrawal = await IngredientWithdrawal.create({
      ingredient: ingredient._id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantity,
      unitPrice,
      totalValue: unitPrice * quantity,
      reason,
      note,
      remainingAfter: ingredient.quantity,
      performedBy: req.user._id,
      performedByName: req.user.name || ''
    });

    res.status(201).json({ success: true, data: withdrawal, ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to record withdrawal' });
  }
});

router.post('/:id/purchases', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
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
        $set: { supplier: String(req.body.supplier || ''), unitPrice: unitCost },
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

router.patch('/:id', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.unit !== undefined) updates.unit = req.body.unit;
    if (req.body.supplier !== undefined) updates.supplier = req.body.supplier;

    for (const field of ['quantity', 'unitPrice', 'reorderLevel']) {
      if (req.body[field] === undefined) continue;
      if (!isNonNegativeNumber(req.body[field])) {
        return res.status(400).json({ success: false, message: `${field} must be a number of 0 or more` });
      }
      updates[field] = Number(req.body[field]);
    }

    const ingredient = await Ingredient.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update ingredient' });
  }
});

module.exports = router;