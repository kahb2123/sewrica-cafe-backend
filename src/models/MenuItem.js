const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  nameAm: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  fullDescription: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['burgers', 'sandwiches', 'fastfood', 'pizza', 'wraps', 'fetira', 'traditional', 'beverages', 'desserts']
  },
  image: {
    type: String,
    default: 'default-food.jpg'
  },
  rating: {
    type: Number,
    default: 4.0
  },
  spiceLevel: {
    type: String,
    default: '🌶️'
  },
  prepTime: {
    type: String,
    default: '15 min'
  },
  isVegetarian: {
    type: Boolean,
    default: false
  },
  isSpicy: {
    type: Boolean,
    default: false
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  isSignature: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  ingredients: [String]
});

module.exports = mongoose.model('MenuItem', menuItemSchema);