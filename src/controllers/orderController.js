const Order = require('../models/Order');
const User = require('../models/User');
const MenuItem = require('../models/MenuItem');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (authenticated users)
const createOrder = async (req, res) => {
  try {

    const {
      items,
      customerInfo,
      paymentMethod,
      deliveryMethod,
      deliveryTime,
      specialInstructions
    } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
      return res.status(400).json({ message: 'Customer information is required' });
    }

    if (!paymentMethod || !deliveryMethod) {
      return res.status(400).json({ message: 'Payment method and delivery method are required' });
    }

    // Get user from token
    const user = req.user;

    // Validate and calculate order items
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      // Find menu item to ensure it exists and get current price
      const menuItem = await MenuItem.findById(item.menuItem);
      if (!menuItem) {
        return res.status(400).json({ message: `Menu item ${item.menuItem} not found` });
      }

      if (!menuItem.isAvailable) {
        return res.status(400).json({ message: `${menuItem.name} is currently unavailable` });
      }

      const itemTotal = menuItem.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price
      });
    }

    // Calculate total (for now, no additional fees)
    const totalAmount = subtotal;

    // Generate unique order number
    const orderNumber = generateOrderNumber();

    // ========== NEW: Set payment status based on payment method ==========
    let paymentStatus = 'pending';
    if (paymentMethod === 'card') {
      paymentStatus = 'processing'; // Will be updated when payment succeeds
    } else if (paymentMethod === 'cash') {
      paymentStatus = 'pending'; // Cash payment pending until delivery
    } else if (paymentMethod === 'tele_birr') {
      paymentStatus = 'pending'; // Tele Birr payment pending until confirmed
    } else if (paymentMethod === 'bank') {
      paymentStatus = 'pending'; // Bank transfer pending until confirmed
    }

    // Create order with all fields including payment status
    const order = await Order.create({
      orderNumber,
      customer: user._id,
      customerName: customerInfo.name,
      customerPhone: customerInfo.phone,
      customerEmail: customerInfo.email || user.email,
      items: orderItems,
      subtotal,
      totalAmount,
      paymentMethod,
      paymentStatus, // NEW: Set initial payment status
      deliveryMethod,
      deliveryTime: deliveryTime || 'asap',
      specialInstructions: specialInstructions || '',
      status: 'pending',
      // Initialize payment tracking fields
      stripePaymentIntentId: null,
      amountReceived: null,
      change: null,
      paidAt: null
    });

    // Populate menu item details for response
    await order.populate('items.menuItem');

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        items: order.items,
        subtotal: order.subtotal,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus, // NEW: Include payment status in response
        createdAt: order.createdAt
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order', error: error.message });
  }
};

// @desc    Get user's orders
// @route   GET /api/orders/my-orders
// @access  Private
const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .populate('items.menuItem')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private (order owner or admin)
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.menuItem')
      .populate('customer', 'name email phone');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns this order or is admin
    if (order.customer._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Failed to fetch order' });
  }
};

// @desc    Cancel order
// @route   PATCH /api/orders/:id/cancel
// @access  Private (order owner)
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns this order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this order' });
    }

    // Only allow cancellation if order is still pending
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Order cannot be cancelled at this stage' });
    }

    order.status = 'cancelled';
    
    // NEW: If payment was processing, update payment status
    if (order.paymentStatus === 'processing') {
      order.paymentStatus = 'failed';
    }
    
    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Failed to cancel order' });
  }
};

// @desc    Update order status (for staff)
// @route   PATCH /api/orders/:id/status
// @access  Private (admin, cashier, cook, delivery)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Find order
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check permissions based on user role
    const userRole = req.user.role;
    const currentStatus = order.status;

    // Define allowed status transitions for each role
    const allowedTransitions = {
      admin: {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['ready', 'cancelled'],
        ready: ['delivered', 'cancelled'],
        delivered: [],
        cancelled: []
      },
      cashier: {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['preparing', 'cancelled'],
        preparing: ['ready', 'cancelled'],
        ready: ['delivered', 'cancelled'],
        delivered: [],
        cancelled: []
      },
      cook: {
        preparing: ['ready'],
        ready: ['preparing'] // Allow going back if mistake
      },
      delivery: {
        ready: ['delivered'],
        delivered: ['ready'] // Allow going back if delivery failed
      }
    };

    // Check if transition is allowed
    if (!allowedTransitions[userRole]?.[currentStatus]?.includes(status)) {
      return res.status(403).json({ 
        message: `You don't have permission to change order status from ${currentStatus} to ${status}` 
      });
    }

    // Update order
    order.status = status;
    if (notes) {
      order.notes = notes;
    }
    order.updatedAt = new Date();

    await order.save();

    // Populate for response
    await order.populate('customer', 'name email');
    await order.populate('items.menuItem', 'name price');

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status' });
  }
};

// ========== NEW: Process cash payment ==========
// @desc    Process cash payment (for cash on delivery)
// @route   POST /api/orders/:id/cash-payment
// @access  Private (staff only)
const processCashPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amountReceived } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check authorization (admin or cashier only)
    if (!['admin', 'cashier'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to process cash payments' });
    }

    // Verify this is a cash order
    if (order.paymentMethod !== 'cash') {
      return res.status(400).json({ message: 'Not a cash order' });
    }

    // Check if already paid
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Order already paid' });
    }

    // Calculate change
    const change = amountReceived - order.totalAmount;
    if (change < 0) {
      return res.status(400).json({ 
        message: `Insufficient amount. Need ETB ${(order.totalAmount - amountReceived).toFixed(2)} more` 
      });
    }

    // Update order
    order.paymentStatus = 'completed';
    order.amountReceived = amountReceived;
    order.change = change;
    order.paidAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Cash payment processed successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        amountReceived,
        change,
        paidAt: order.paidAt,
        paymentStatus: order.paymentStatus
      }
    });
  } catch (error) {
    console.error('Process cash payment error:', error);
    res.status(500).json({ message: 'Failed to process cash payment' });
  }
};

// ========== NEW: Confirm card payment ==========
// @desc    Confirm order after successful card payment
// @route   POST /api/orders/:id/confirm-payment
// @access  Private
const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentIntentId } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify this is a card order
    if (order.paymentMethod !== 'card') {
      return res.status(400).json({ message: 'Not a card payment order' });
    }

    // Check if already paid
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ message: 'Order already paid' });
    }

    // Update order
    order.paymentStatus = 'completed';
    order.stripePaymentIntentId = paymentIntentId;
    order.paidAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        paidAt: order.paidAt
      }
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ message: 'Failed to confirm payment' });
  }
};

// ========== NEW: Get orders by payment status ==========
// @desc    Get orders by payment status (for staff)
// @route   GET /api/orders/payment-status/:status
// @access  Private (admin, cashier)
const getOrdersByPaymentStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const orders = await Order.find({ paymentStatus: status })
      .populate('customer', 'name email phone')
      .populate('items.menuItem', 'name price')
      .sort('-createdAt');

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error('Get orders by payment status error:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};

// ========== NEW: Get payment status for an order ==========
// @desc    Get payment status for an order
// @route   GET /api/orders/:id/payment-status
// @access  Private
const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).select('paymentStatus paymentMethod paidAt amountReceived change');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns this order or is staff
    if (order.customer.toString() !== req.user._id.toString() && 
        !['admin', 'cashier'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    res.json({
      success: true,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      amountReceived: order.amountReceived,
      change: order.change
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ message: 'Failed to get payment status' });
  }
};

// ========== NEW: Refund payment (admin only) ==========
// @desc    Refund payment for an order
// @route   POST /api/orders/:id/refund
// @access  Private (admin only)
const refundPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can process refunds' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if order is paid
    if (order.paymentStatus !== 'completed') {
      return res.status(400).json({ message: 'Order is not paid' });
    }

    // For card payments, you would process refund through Stripe here
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // if (order.stripePaymentIntentId) {
    //   await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
    // }

    // Update order
    order.paymentStatus = 'refunded';
    order.refundReason = reason;
    order.refundedAt = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        refundedAt: order.refundedAt
      }
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({ message: 'Failed to process refund' });
  }
};

// Helper function to generate unique order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); // 3-digit random
  return `ORD${timestamp}${random}`;
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus,
  // NEW: Export new payment functions
  processCashPayment,
  confirmPayment,
  getOrdersByPaymentStatus,
  getPaymentStatus,
  refundPayment
};