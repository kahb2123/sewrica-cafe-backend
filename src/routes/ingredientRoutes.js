const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient');
const IngredientWithdrawal = require('../models/IngredientWithdrawal');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { requirePagePermission } = require('../middleware/roleMiddleware');
const { buildDateRange } = require('../services/reportService');

router.use(protect);

const isNonNegativeNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

router.get('/', requirePagePermission('adminIngredients', 'read'), async (req, res) => {
  try {
    const ingredients = await Ingredient.find({ isArchived: { $ne: true } }).sort({ name: 1 });
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load ingredients' });
  }
});

router.get('/report', requirePagePermission('adminIngredients', 'read'), async (req, res) => {
  try {
    const range = buildDateRange(req.query.start, req.query.end);
    const [stockIn, stockOut] = await Promise.all([
      Ingredient.aggregate([
        { $unwind: '$purchases' },
        { $match: { 'purchases.purchasedAt': { $gte: range.start, $lt: range.end } } },
        {
          $project: {
            _id: '$purchases._id',
            ingredientId: '$_id',
            ingredientName: '$name',
            unit: '$unit',
            quantity: '$purchases.quantity',
            unitCost: { $ifNull: ['$purchases.unitCost', 0] },
            totalValue: {
              $multiply: [
                { $ifNull: ['$purchases.quantity', 0] },
                { $ifNull: ['$purchases.unitCost', 0] }
              ]
            },
            supplier: { $ifNull: ['$purchases.supplier', ''] },
            performedBy: '$purchases.purchasedBy',
            createdAt: '$purchases.purchasedAt',
            type: { $literal: 'stock_in' }
          }
        },
        {
          $lookup: {
            from: User.collection.name,
            localField: 'performedBy',
            foreignField: '_id',
            as: 'performer'
          }
        },
        {
          $addFields: {
            performedByName: { $ifNull: [{ $arrayElemAt: ['$performer.name', 0] }, ''] }
          }
        },
        { $project: { performer: 0 } },
        { $sort: { createdAt: -1 } }
      ]),
      IngredientWithdrawal.find({
        createdAt: { $gte: range.start, $lt: range.end }
      }).sort({ createdAt: -1 }).lean()
    ]);

    res.json({
      success: true,
      data: {
        period: { start: range.startLabel, end: range.endLabel, days: range.days },
        stockIn,
        stockOut: stockOut.map((entry) => ({ ...entry, type: 'stock_out' }))
      }
    });
  } catch (error) {
    const invalidRange = /Invalid date range|Start date must be before or equal/i.test(error.message);
    res.status(invalidRange ? 400 : 500).json({
      success: false,
      message: error.message || 'Failed to build stock movement report'
    });
  }
});

router.post('/', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const { name, unit, quantity = 0, unitPrice = 0, reorderLevel = 0 } = req.body;
    const supplier = req.user.name || '';
    if (!name || !unit || !isNonNegativeNumber(quantity) || !isNonNegativeNumber(unitPrice) || !isNonNegativeNumber(reorderLevel)) {
      return res.status(400).json({ success: false, message: 'Name, unit, and valid stock and price values are required' });
    }
    const ingredient = await Ingredient.create({
      name,
      unit,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      reorderLevel: Number(reorderLevel),
      supplier,
      purchases: Number(quantity) > 0 ? [{
        quantity: Number(quantity),
        unitCost: Number(unitPrice),
        supplier,
        purchasedBy: req.user._id
      }] : []
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
      { _id: ingredientId, isArchived: { $ne: true }, quantity: { $gte: quantity } },
      {
        $inc: { quantity: -quantity },
        $set: { supplier: req.user.name || '' }
      },
      { new: true, runValidators: true }
    );

    if (!ingredient) {
      const current = await Ingredient.findOne({ _id: ingredientId, isArchived: { $ne: true } });
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

router.patch('/withdrawals/:id', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  const quantity = Number(req.body.quantity);
  const reason = req.body.reason;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
  }
  if (!IngredientWithdrawal.WITHDRAWAL_REASONS.includes(reason)) {
    return res.status(400).json({ success: false, message: 'Select a valid withdrawal reason' });
  }

  const session = await Ingredient.startSession();
  try {
    let updatedWithdrawal;
    let updatedIngredient;
    await session.withTransaction(async () => {
      const withdrawal = await IngredientWithdrawal.findById(req.params.id).session(session);
      if (!withdrawal) {
        const error = new Error('Withdrawal not found');
        error.statusCode = 404;
        throw error;
      }

      const ingredient = await Ingredient.findById(withdrawal.ingredient).session(session);
      if (!ingredient || ingredient.isArchived) {
        const error = new Error('Ingredient not found');
        error.statusCode = 404;
        throw error;
      }

      const difference = quantity - withdrawal.quantity;
      if (difference > ingredient.quantity) {
        const error = new Error(`Only ${ingredient.quantity} ${ingredient.unit} is available`);
        error.statusCode = 400;
        throw error;
      }

      ingredient.quantity -= difference;
      withdrawal.quantity = quantity;
      withdrawal.reason = reason;
      withdrawal.note = note;
      withdrawal.totalValue = quantity * (Number(withdrawal.unitPrice) || 0);
      withdrawal.remainingAfter = ingredient.quantity;

      await ingredient.save({ session });
      updatedWithdrawal = await withdrawal.save({ session });
      if (difference !== 0) {
        await IngredientWithdrawal.updateMany(
          { ingredient: ingredient._id, createdAt: { $gt: withdrawal.createdAt } },
          { $inc: { remainingAfter: -difference } },
          { session }
        );
      }
      updatedIngredient = ingredient;
    });

    res.json({ success: true, data: updatedWithdrawal, ingredient: updatedIngredient });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update withdrawal'
    });
  } finally {
    await session.endSession();
  }
});

router.patch('/:id/purchases/:purchaseId', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  const quantity = Number(req.body.quantity);
  const unitCost = Number(req.body.unitCost);

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
    return res.status(400).json({ success: false, message: 'Quantity must be greater than 0 and unit cost cannot be negative' });
  }

  const session = await Ingredient.startSession();
  try {
    let updatedIngredient;
    await session.withTransaction(async () => {
      const ingredient = await Ingredient.findOne({
        _id: req.params.id,
        isArchived: { $ne: true }
      }).session(session);
      if (!ingredient) {
        const error = new Error('Ingredient not found');
        error.statusCode = 404;
        throw error;
      }

      const purchase = ingredient.purchases.id(req.params.purchaseId);
      if (!purchase) {
        const error = new Error('Stock-in record not found');
        error.statusCode = 404;
        throw error;
      }

      const difference = quantity - purchase.quantity;
      if (difference < 0 && ingredient.quantity < -difference) {
        const error = new Error('This stock-in quantity cannot be reduced below the amount already used');
        error.statusCode = 400;
        throw error;
      }

      ingredient.quantity += difference;
      purchase.quantity = quantity;
      purchase.unitCost = unitCost;
      updatedIngredient = await ingredient.save({ session });
      if (difference !== 0) {
        await IngredientWithdrawal.updateMany(
          { ingredient: ingredient._id, createdAt: { $gt: purchase.purchasedAt } },
          { $inc: { remainingAfter: difference } },
          { session }
        );
      }
    });

    res.json({ success: true, data: updatedIngredient });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update stock-in record'
    });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/purchases', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    const unitCost = Number(req.body.unitCost || 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return res.status(400).json({ success: false, message: 'Purchase quantity must be greater than 0 and cost cannot be negative' });
    }

    const ingredient = await Ingredient.findOneAndUpdate(
      { _id: req.params.id, isArchived: { $ne: true } },
      {
        $inc: { quantity },
        $set: {
          supplier: req.user.name || '',
          unitPrice: unitCost,
        },
        $push: { purchases: { quantity, unitCost, supplier: req.user.name || '', purchasedBy: req.user._id } }
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

    for (const field of ['quantity', 'unitPrice', 'reorderLevel']) {
      if (req.body[field] === undefined) continue;
      if (!isNonNegativeNumber(req.body[field])) {
        return res.status(400).json({ success: false, message: `${field} must be a number of 0 or more` });
      }
      updates[field] = Number(req.body[field]);
    }

    const ingredient = await Ingredient.findOneAndUpdate(
      { _id: req.params.id, isArchived: { $ne: true } },
      updates,
      { new: true, runValidators: true }
    );
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });
    res.json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update ingredient' });
  }
});

router.delete('/:id', requirePagePermission('adminIngredients', 'write'), async (req, res) => {
  try {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A reason is required to delete an ingredient' });
    }

    const ingredient = await Ingredient.findOneAndUpdate(
      { _id: req.params.id, isArchived: { $ne: true } },
      {
        $set: {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: req.user._id,
          archivedByName: req.user.name || '',
          archiveReason: reason
        }
      },
      { new: true, runValidators: true }
    );
    if (!ingredient) return res.status(404).json({ success: false, message: 'Ingredient not found' });

    res.json({ success: true, message: 'Ingredient deleted and archived for recordkeeping' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete ingredient' });
  }
});

module.exports = router;