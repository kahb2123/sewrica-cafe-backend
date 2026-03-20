// src/models/Order.js
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
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled'],
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
  amountReceived: Number,
  change: Number,
  paidAt: Date,
  deliveryMethod: {
    type: String,
    enum: ['delivery', 'pickup'],
    required: true
  },
  
  // ========== STAFF ASSIGNMENTS ==========
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
  
  // ========== STAFF ACCEPTANCE/REJECTION ==========
  chefAccepted: {
    type: Boolean,
    default: false
  },
  chefAcceptedAt: Date,
  chefRejected: {
    type: Boolean,
    default: false
  },
  chefRejectionReason: String,
  chefRejectedAt: Date,
  
  deliveryAccepted: {
    type: Boolean,
    default: false
  },
  deliveryAcceptedAt: Date,
  deliveryRejected: {
    type: Boolean,
    default: false
  },
  deliveryRejectionReason: String,
  deliveryRejectedAt: Date,
  
  // ========== ASSIGNMENT TIMESTAMPS ==========
  assignedAt: {
    chef: Date,
    delivery: Date
  },
  
  // ========== TIME TRACKING ==========
  cookingStartedAt: Date,
  cookingCompletedAt: Date,
  cookingTime: {
    type: Number,
    default: 0
  },
  deliveryStartedAt: Date,
  deliveryCompletedAt: Date,
  deliveryTime: {
    type: Number,
    default: 0
  },
  deliveryTimeEstimate: {
    type: String,
    default: 'asap'
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
  
  // ========== DELIVERY DETAILS ==========
  deliveryAddress: {
    street: String,
    area: String,
    building: String,
    floor: String,
    city: String,
    additionalInfo: String
  },
  
  // ========== ORDER METADATA ==========
  orderSource: {
    type: String,
    enum: ['web', 'mobile', 'walk-in', 'phone'],
    default: 'web'
  },
  specialRequests: String,
  
  // ========== STATUS HISTORY ==========
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled']
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

  // ========== NOTIFICATION TRACKING ==========
  notificationsSent: {
    chefAssigned: { type: Boolean, default: false },
    deliveryAssigned: { type: Boolean, default: false },
    orderReady: { type: Boolean, default: false },
    orderDelivered: { type: Boolean, default: false }
  }

}, { timestamps: true });

// Methods
orderSchema.methods.addStatusHistory = function(status, userId, notes = '') {
  this.statusHistory.push({
    status,
    changedBy: userId,
    changedAt: new Date(),
    notes
  });
};

orderSchema.methods.calculateCookingTime = function() {
  if (this.cookingStartedAt && this.cookingCompletedAt) {
    const diffMs = this.cookingCompletedAt - this.cookingStartedAt;
    this.cookingTime = Math.round(diffMs / 60000);
  }
};

orderSchema.methods.calculateDeliveryTime = function() {
  if (this.deliveryStartedAt && this.deliveryCompletedAt) {
    const diffMs = this.deliveryCompletedAt - this.deliveryStartedAt;
    this.deliveryTime = Math.round(diffMs / 60000);
  }
};

// Virtuals
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

// Indexes
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ assignedChef: 1, status: 1 });
orderSchema.index({ assignedDelivery: 1, status: 1 });
orderSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);