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

    const totalAmount = subtotal;
    const orderNumber = generateOrderNumber();

    let paymentStatus = 'pending';
    if (paymentMethod === 'card') {
      paymentStatus = 'processing';
    } else if (paymentMethod === 'cash') {
      paymentStatus = 'pending';
    } else if (paymentMethod === 'tele_birr') {
      paymentStatus = 'pending';
    } else if (paymentMethod === 'bank') {
      paymentStatus = 'pending';
    }

    // Create order with initial status
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
      paymentStatus,
      deliveryMethod,
      deliveryTime: deliveryTime || 'asap',
      specialRequests: specialInstructions || '',
      status: 'pending',
      stripePaymentIntentId: null,
      amountReceived: null,
      change: null,
      paidAt: null,
      // Initialize status history
      statusHistory: [{
        status: 'pending',
        changedBy: user._id,
        changedAt: new Date(),
        notes: 'Order placed'
      }]
    });

    await order.populate('items.menuItem');

    // ========== SOCKET.IO: Notify admin of new order ==========
    const io = req.app.get('io');
    if (io) {
      // Notify all admin/staff rooms about new order
      io.to('staff-admin').to('staff-cashier').emit('new-order', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt
      });
      console.log(`📢 New order notification sent for order #${order.orderNumber}`);
    }

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
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order', error: error.message });
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
        ready: ['preparing']
      },
      delivery: {
        ready: ['delivered'],
        delivered: ['ready']
      }
    };

    // Check if transition is allowed
    if (!allowedTransitions[userRole]?.[currentStatus]?.includes(status)) {
      return res.status(403).json({ 
        message: `You don't have permission to change order status from ${currentStatus} to ${status}` 
      });
    }

    // Update order
    const oldStatus = order.status;
    order.status = status;
    
    // Add to status history
    order.statusHistory.push({
      status,
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: notes || `Status changed from ${oldStatus} to ${status}`
    });

    // If order is cancelled, update payment status
    if (status === 'cancelled' && order.paymentStatus === 'processing') {
      order.paymentStatus = 'failed';
    }

    await order.save();

    // Populate for response
    await order.populate('customer', 'name email');
    await order.populate('items.menuItem', 'name price');

    // ========== SOCKET.IO: Notify customer about status change ==========
    const io = req.app.get('io');
    if (io) {
      // Send to specific order room
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        oldStatus,
        notes: notes || null,
        updatedAt: new Date(),
        // Special messages for accepted/rejected
        message: status === 'confirmed' ? 'Your order has been accepted!' :
                status === 'cancelled' ? 'Your order has been cancelled' :
                `Your order is now ${status}`
      });

      // Also notify staff rooms about the update
      io.to('staff-admin').to('staff-cashier').emit('order-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        updatedAt: new Date()
      });

      console.log(`📢 Status update notification sent for order #${order.orderNumber}: ${oldStatus} -> ${status}`);
    }

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

    // Check if user owns this order or is admin/staff
    if (order.customer._id.toString() !== req.user._id.toString() && 
        !['admin', 'cashier', 'cook', 'delivery'].includes(req.user.role)) {
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

    const oldStatus = order.status;
    order.status = 'cancelled';
    
    // Add to status history
    order.statusHistory.push({
      status: 'cancelled',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: 'Cancelled by customer'
    });
    
    // If payment was processing, update payment status
    if (order.paymentStatus === 'processing') {
      order.paymentStatus = 'failed';
    }
    
    await order.save();

    // ========== SOCKET.IO: Notify staff about cancellation ==========
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${order._id}`).to('staff-admin').to('staff-cashier').emit('order-cancelled', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        cancelledBy: 'customer',
        reason: 'Cancelled by customer'
      });
    }

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

// @desc    Confirm payment
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

    // ========== SOCKET.IO: Notify about payment completion ==========
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${order._id}`).to('staff-admin').to('staff-cashier').emit('payment-completed', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        paidAt: order.paidAt
      });
    }

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

// ========== ADD THESE MISSING FUNCTIONS ==========

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

    // ========== SOCKET.IO: Notify about cash payment ==========
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${order._id}`).to('staff-admin').to('staff-cashier').emit('payment-completed', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentMethod: 'cash',
        amountReceived,
        change,
        paidAt: order.paidAt
      });
    }

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

// @desc    Get payment status for an order
// @route   GET /api/orders/:id/payment-status
// @access  Private
const getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).select('paymentStatus paymentMethod paidAt amountReceived change customer');
    
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

// @desc    Refund payment (admin only)
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

    // For card payments, process refund through Stripe
    if (order.stripePaymentIntentId && order.paymentMethod === 'card') {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.refunds.create({ 
          payment_intent: order.stripePaymentIntentId 
        });
      } catch (stripeError) {
        console.error('Stripe refund error:', stripeError);
        return res.status(500).json({ message: 'Failed to process Stripe refund' });
      }
    }

    // Update order
    order.paymentStatus = 'refunded';
    order.refundReason = reason;
    order.refundedAt = new Date();
    await order.save();

    // ========== SOCKET.IO: Notify about refund ==========
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${order._id}`).to('staff-admin').emit('payment-refunded', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: 'refunded',
        refundedAt: order.refundedAt,
        reason
      });
    }

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        refundedAt: order.refundedAt,
        refundReason: reason
      }
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({ message: 'Failed to process refund' });
  }
};

// Helper function to generate unique order number
const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD${timestamp}${random}`;
};

// Export all functions
module.exports = {
  createOrder,
  getUserOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus,
  processCashPayment,
  confirmPayment,
  getOrdersByPaymentStatus,
  getPaymentStatus,
  refundPayment
};