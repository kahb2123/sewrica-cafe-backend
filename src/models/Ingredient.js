const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  quantity: { type: Number, required: true, min: 0.01 },
  unitCost: { type: Number, min: 0, default: 0 },
  supplier: { type: String, trim: true, default: '' },
  purchasedAt: { type: Date, default: Date.now },
  purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: true });

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  unit: { type: String, required: true, trim: true, enum: ['piece', 'kg', 'g', 'liter', 'ml', 'pack', 'box'] },
  quantity: { type: Number, min: 0, default: 0 },
  reorderLevel: { type: Number, min: 0, default: 0 },
  supplier: { type: String, trim: true, default: '' },
  purchases: { type: [purchaseSchema], default: [] }
}, { timestamps: true });

ingredientSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Ingredient', ingredientSchema);