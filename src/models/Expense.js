const mongoose = require('mongoose');

// Every expense is categorised so the reports page can group by category,
// supplier, or payment method. `paidBy` records who entered it; `approvedBy`
// is set when an admin approves a non-ingredient expense.
const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    enum: {
      values: ['ingredients', 'utilities', 'rent', 'marketing', 'staff', 'maintenance', 'supplies', 'other'],
      message: '{VALUE} is not a supported expense category'
    }
  },
  description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 200 },
  amount: { type: Number, required: [true, 'Amount is required'], min: [0.01, 'Amount must be greater than 0'] },
  currency: { type: String, default: 'ETB', uppercase: true, trim: true },
  paymentMethod: {
    type: String,
    enum: { values: ['cash', 'card', 'bank_transfer', 'mobile_money'], message: '{VALUE} is not a supported payment method' },
    default: 'cash'
  },
  supplier: { type: String, trim: true, default: '' },
  receiptNumber: { type: String, trim: true, default: '' },
  expenseDate: { type: Date, required: [true, 'Expense date is required'], default: Date.now },
  notes: { type: String, trim: true, default: '', maxlength: 500 },
  approved: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ approved: 1 });
expenseSchema.index({ recordedBy: 1 });

expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Expense', expenseSchema);