const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const { protect } = require('../middleware/authMiddleware');
const { requirePagePermission } = require('../middleware/roleMiddleware');

router.use(protect);

const isNonNegativeNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

const VALID_CATEGORIES = ['ingredients', 'utilities', 'rent', 'marketing', 'staff', 'maintenance', 'supplies', 'other'];
const VALID_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_money'];

router.get('/', requirePagePermission('adminExpenses', 'read'), async (req, res) => {
  try {
    const { start, end, category, approved, page = 1, limit = 50 } = req.query;
    const query = {};

    if (start || end) {
      query.expenseDate = {};
      if (start) query.expenseDate.$gte = new Date(start);
      if (end) query.expenseDate.$lte = new Date(end);
    }
    if (category && VALID_CATEGORIES.includes(category)) query.category = category;
    if (approved !== undefined) query.approved = approved === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    const expenses = await Expense.find(query)
      .sort({ expenseDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('recordedBy', 'name')
      .populate('approvedBy', 'name');

    const total = await Expense.countDocuments(query);

    const summary = await Expense.aggregate([
      { $match: query },
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: expenses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      summary: summary[0] || { totalAmount: 0, count: 0 }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch expenses' });
  }
});

router.get('/stats', requirePagePermission('adminExpenses', 'read'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start || end) {
      match.expenseDate = {};
      if (start) match.expenseDate.$gte = new Date(start);
      if (end) match.expenseDate.$lte = new Date(end);
    }

    const [byCategory, byPaymentMethod, totals] = await Promise.all([
      Expense.aggregate([
        { $match: match },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      Expense.aggregate([
        { $match: match },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 }, approved: { $sum: { $cond: ['$approved', 1, 0] } } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        byCategory,
        byPaymentMethod,
        totals: totals[0] || { totalAmount: 0, count: 0, approved: 0 }
      }
    });
  } catch (error) {
    console.error('Error fetching expense stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch expense stats' });
  }
});

router.post('/', requirePagePermission('adminExpenses', 'write'), async (req, res) => {
  try {
    const { category, description, amount, currency, paymentMethod, supplier, receiptNumber, expenseDate, notes } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: 'Valid category is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }
    const amountNum = Number(amount);
    if (!isNonNegativeNumber(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }
    if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    const expense = await Expense.create({
      category,
      description: description.trim(),
      amount: amountNum,
      currency: currency?.toUpperCase() || 'ETB',
      paymentMethod: paymentMethod || 'cash',
      supplier: supplier?.trim() || '',
      receiptNumber: receiptNumber?.trim() || '',
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      notes: notes?.trim() || '',
      recordedBy: req.user._id
    });

    await expense.populate('recordedBy', 'name');
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, message: 'Failed to create expense' });
  }
});

router.patch('/:id', requirePagePermission('adminExpenses', 'write'), async (req, res) => {
  try {
    const { category, description, amount, currency, paymentMethod, supplier, receiptNumber, expenseDate, notes } = req.body;

    const updates = {};
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, message: 'Invalid category' });
      }
      updates.category = category;
    }
    if (description !== undefined) {
      if (!description.trim()) {
        return res.status(400).json({ success: false, message: 'Description is required' });
      }
      updates.description = description.trim();
    }
    if (amount !== undefined) {
      const amountNum = Number(amount);
      if (!isNonNegativeNumber(amountNum) || amountNum <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      }
      updates.amount = amountNum;
    }
    if (currency !== undefined) updates.currency = currency.toUpperCase();
    if (paymentMethod !== undefined) {
      if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: 'Invalid payment method' });
      }
      updates.paymentMethod = paymentMethod;
    }
    if (supplier !== undefined) updates.supplier = supplier.trim();
    if (receiptNumber !== undefined) updates.receiptNumber = receiptNumber.trim();
    if (expenseDate !== undefined) updates.expenseDate = new Date(expenseDate);
    if (notes !== undefined) updates.notes = notes.trim();

    const expense = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate('recordedBy', 'name')
      .populate('approvedBy', 'name');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, message: 'Failed to update expense' });
  }
});

router.patch('/:id/approve', requirePagePermission('adminExpenses', 'write'), async (req, res) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { approved: true, approvedBy: req.user._id },
      { new: true, runValidators: true }
    ).populate('recordedBy', 'name').populate('approvedBy', 'name');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Error approving expense:', error);
    res.status(500).json({ success: false, message: 'Failed to approve expense' });
  }
});

router.delete('/:id', requirePagePermission('adminExpenses', 'write'), async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expense' });
  }
});

module.exports = router;