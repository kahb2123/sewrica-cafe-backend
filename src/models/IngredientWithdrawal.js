const mongoose = require('mongoose');

const WITHDRAWAL_REASONS = ['consumption', 'waste', 'damage', 'correction', 'other'];

const ingredientWithdrawalSchema = new mongoose.Schema({
  ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  ingredientName: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.01 },
  unitPrice: { type: Number, min: 0, default: 0 },
  totalValue: { type: Number, min: 0, default: 0 },
  reason: { type: String, enum: WITHDRAWAL_REASONS, default: 'consumption' },
  note: { type: String, trim: true, default: '' },
  remainingAfter: { type: Number, min: 0, default: 0 },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedByName: { type: String, default: '' }
}, { timestamps: true });

ingredientWithdrawalSchema.index({ createdAt: -1 });
ingredientWithdrawalSchema.index({ ingredient: 1, createdAt: -1 });

const IngredientWithdrawal = mongoose.model('IngredientWithdrawal', ingredientWithdrawalSchema);
IngredientWithdrawal.WITHDRAWAL_REASONS = WITHDRAWAL_REASONS;

module.exports = IngredientWithdrawal;
