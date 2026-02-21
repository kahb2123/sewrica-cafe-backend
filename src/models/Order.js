const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true
  },
  name: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'tele_birr', 'bank'],
    required: true
  },
  stripePaymentIntentId: String,
  amountReceived: Number, // For cash payments
  change: Number, // For cash payments
  paidAt: Date,
  deliveryMethod: {
    type: String,
    enum: ['delivery', 'pickup'],
    required: true
  },
  
  // ========== NEW ASSIGNMENT FIELDS ==========
  
  // Staff assignments
  assignedChef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedDelivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedCashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Assignment timestamps
  assignedAt: {
    chef: Date,
    delivery: Date,
    cashier: Date
  },
  
  // Completion timestamps
  completedAt: {
    chef: Date,
    delivery: Date,
    cashier: Date
  },
  
  // ========== TIME TRACKING FIELDS ==========
  
  // Cooking time tracking
  cookingStartedAt: Date,
  cookingCompletedAt: Date,
  cookingTime: {
    type: Number, // in minutes
    default: 0
  },
  
  // Delivery time tracking
  deliveryStartedAt: Date,
  deliveryCompletedAt: Date,
  deliveryTime: {
    type: String, // 'asap', '30min', '1hour', etc.
    default: 'asap'
  },
  
  // Total preparation time (from confirmed to ready)
  preparationStartedAt: Date,
  preparationTime: {
    type: Number, // in minutes
    default: 0
  },
  
  // ========== STAFF NOTES ==========
  
  chefNotes: {
    type: String,
    default: ''
  },
  deliveryNotes: {
    type: String,
    default: ''
  },
  cashierNotes: {
    type: String,
    default: ''
  },
  
  // ========== DELIVERY DETAILS ==========
  
  deliveryAddress: {
    street: String,
    area: String,
    building: String,
    floor: String,
    city: String,
    additionalInfo: String
  },
  
  estimatedDeliveryTime: Date,
  actualDeliveryTime: Date,
  
  // ========== ORDER METADATA ==========
  
  orderSource: {
    type: String,
    enum: ['web', 'mobile', 'walk-in', 'phone'],
    default: 'web'
  },
  
  specialRequests: String,
  
  // For tracking order history
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],

});

// Update the updatedAt timestamp before saving
// orderSchema.pre('save', function(next) {
//   this.updatedAt = Date.now();
//   next();
// });

// Method to add status history
orderSchema.methods.addStatusHistory = function(status, userId, notes = '') {
  this.statusHistory.push({
    status,
    changedBy: userId,
    changedAt: new Date(),
    notes
  });
};

// Method to calculate cooking time
orderSchema.methods.calculateCookingTime = function() {
  if (this.cookingStartedAt && this.cookingCompletedAt) {
    const diffMs = this.cookingCompletedAt - this.cookingStartedAt;
    this.cookingTime = Math.round(diffMs / 60000); // Convert to minutes
  }
};

// Method to calculate delivery time
orderSchema.methods.calculateDeliveryTime = function() {
  if (this.deliveryStartedAt && this.deliveryCompletedAt) {
    const diffMs = this.deliveryCompletedAt - this.deliveryStartedAt;
    this.deliveryTime = Math.round(diffMs / 60000); // Convert to minutes
  }
};

// Method to calculate preparation time
orderSchema.methods.calculatePreparationTime = function() {
  if (this.preparationStartedAt && this.cookingCompletedAt) {
    const diffMs = this.cookingCompletedAt - this.preparationStartedAt;
    this.preparationTime = Math.round(diffMs / 60000); // Convert to minutes
  }
};

// Virtual for total items count
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for order age in minutes
orderSchema.virtual('age').get(function() {
  return Math.round((Date.now() - this.createdAt) / 60000);
});

// Ensure virtuals are included when converting to JSON
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

// Add timestamps
orderSchema.set('timestamps', true);

// Indexes for better query performance
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ assignedChef: 1, status: 1 });
orderSchema.index({ assignedDelivery: 1, status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);