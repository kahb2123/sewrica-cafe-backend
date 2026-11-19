const mongoose = require('mongoose');

const menuCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true, lowercase: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('MenuCategory', menuCategorySchema);
