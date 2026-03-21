// src/routes/staffRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const User = require('../models/User');

// Apply protect middleware to ALL staff routes
router.use(protect);

// Debug middleware to log user info for all staff routes
router.use((req, res, next) => {
  console.log('📡 Staff API called:', req.method, req.originalUrl);
  console.log('   User:', req.user ? { id: req.user._id, role: req.user.role, email: req.user.email } : 'No user');
  next();
});

// ========== GET STAFF BY ROLE ==========
router.get('/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const validRoles = ['cook', 'delivery', 'cashier'];
    
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const staff = await User.find({ 
      role: role,
      isActive: true 
    }).select('name email phone');

    res.json({
      success: true,
      count: staff.length,
      staff
    });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ message: 'Failed to fetch staff' });
  }
});

// ========== STAFF ORDER ENDPOINTS ==========

// Get orders assigned to current chef (active cooking orders)
router.get('/orders/cooking', async (req, res) => {
  try {
    console.log('👨‍🍳 Chef orders requested by:', req.user._id, 'Role:', req.user.role);
    
    if (req.user.role !== 'cook' && req.user.role !== 'chef') {
      console.log('❌ User is not a cook/chef, role:', req.user.role);
      return res.status(403).json({ message: 'Access denied. Cooks only.' });
    }

    const orders = await Order.find({
      assignedChef: req.user._id,
      status: { $in: ['confirmed', 'preparing', 'cooking'] }
    })
    .sort({ createdAt: -1 })
    .populate('customer', 'name email phone');

    console.log(`📦 Found ${orders.length} orders for chef`);
    
    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Error fetching chef orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Get orders assigned to current delivery person (active deliveries)
router.get('/orders/delivery', async (req, res) => {
  try {
    console.log('🚚 Delivery orders requested by:', req.user._id);
    
    if (req.user.role !== 'delivery') {
      return res.status(403).json({ message: 'Access denied. Delivery only.' });
    }

    const orders = await Order.find({
      assignedDelivery: req.user._id,
      status: { $in: ['ready', 'out-for-delivery'] }
    })
    .sort({ createdAt: -1 })
    .populate('customer', 'name email phone address');

    console.log(`📦 Found ${orders.length} delivery orders`);
    
    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Error fetching delivery orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Get completed orders for chef
router.get('/orders/cooking/completed', async (req, res) => {
  try {
    if (req.user.role !== 'cook' && req.user.role !== 'chef') {
      return res.status(403).json({ message: 'Access denied. Cooks only.' });
    }

    const orders = await Order.find({
      assignedChef: req.user._id,
      status: { $in: ['ready', 'delivered'] }
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('customer', 'name email phone');

    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Error fetching completed orders:', error);
    res.status(500).json({ message: 'Failed to fetch completed orders' });
  }
});

// Get completed deliveries for delivery person
router.get('/orders/delivery/completed', async (req, res) => {
  try {
    if (req.user.role !== 'delivery') {
      return res.status(403).json({ message: 'Access denied. Delivery only.' });
    }

    const orders = await Order.find({
      assignedDelivery: req.user._id,
      status: 'delivered'
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('customer', 'name email phone');

    res.json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Error fetching completed deliveries:', error);
    res.status(500).json({ message: 'Failed to fetch completed deliveries' });
  }
});

// ========== CHEF ACCEPTANCE ENDPOINTS ==========

// Chef accepts order
router.post('/orders/:orderId/chef-accept', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.chefAccepted) {
      return res.status(400).json({ success: false, message: 'Order already accepted' });
    }

    order.chefAccepted = true;
    order.chefAcceptedAt = new Date();
    if (notes) order.chefNotes = notes;
    order.status = 'preparing';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('preparing', req.user._id, `Chef accepted order: ${notes || 'No notes'}`);
    } else {
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: 'preparing',
        changedBy: req.user._id,
        changedAt: new Date(),
        notes: `Chef accepted order: ${notes || 'No notes'}`
      });
    }

    await order.save();
    await order.populate('customer', 'name email');

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('chef-accepted', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        chefName: req.user.name,
        acceptedAt: order.chefAcceptedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'preparing',
        message: `Chef ${req.user.name} has started preparing your order!`,
        updatedAt: new Date()
      });
      
      console.log(`📢 Chef accepted notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Order accepted successfully', order });
  } catch (error) {
    console.error('Chef accept error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept order' });
  }
});

// Chef rejects order
router.post('/orders/:orderId/chef-reject', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    order.chefRejected = true;
    order.chefRejectionReason = reason;
    order.chefRejectedAt = new Date();
    order.status = 'cancelled';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('cancelled', req.user._id, `Chef rejected order: ${reason}`);
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('chef-rejected', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        chefName: req.user.name,
        reason,
        rejectedAt: order.chefRejectedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'cancelled',
        message: `Your order has been rejected. Reason: ${reason}`,
        updatedAt: new Date()
      });
      
      console.log(`📢 Chef rejected notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Order rejected', order });
  } catch (error) {
    console.error('Chef reject error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject order' });
  }
});

// ========== DELIVERY ACCEPTANCE ENDPOINTS ==========

// Delivery accepts order
router.post('/orders/:orderId/delivery-accept', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.deliveryAccepted) {
      return res.status(400).json({ success: false, message: 'Delivery already accepted' });
    }

    order.deliveryAccepted = true;
    order.deliveryAcceptedAt = new Date();
    if (notes) order.deliveryNotes = notes;
    order.status = 'out-for-delivery';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('out-for-delivery', req.user._id, `Delivery accepted: ${notes || 'No notes'}`);
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('delivery-accepted', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryName: req.user.name,
        acceptedAt: order.deliveryAcceptedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'out-for-delivery',
        message: `Your order is out for delivery with ${req.user.name}!`,
        updatedAt: new Date()
      });
      
      console.log(`📢 Delivery accepted notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Delivery accepted successfully', order });
  } catch (error) {
    console.error('Delivery accept error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept delivery' });
  }
});

// Delivery rejects order
router.post('/orders/:orderId/delivery-reject', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    order.deliveryRejected = true;
    order.deliveryRejectionReason = reason;
    order.deliveryRejectedAt = new Date();
    order.status = 'cancelled';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('cancelled', req.user._id, `Delivery rejected: ${reason}`);
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('delivery-rejected', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryName: req.user.name,
        reason,
        rejectedAt: order.deliveryRejectedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'cancelled',
        message: `Your delivery has been rejected. Reason: ${reason}`,
        updatedAt: new Date()
      });
      
      console.log(`📢 Delivery rejected notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Delivery rejected', order });
  } catch (error) {
    console.error('Delivery reject error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject delivery' });
  }
});

// ========== COOKING ENDPOINTS ==========

// Chef starts cooking
router.post('/start-cooking/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.status !== 'preparing') {
      return res.status(400).json({ success: false, message: 'Order must be preparing to start cooking' });
    }

    order.cookingStartedAt = new Date();
    order.status = 'cooking';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('cooking', req.user._id, 'Started cooking');
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('cooking-started', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        chefName: req.user.name,
        startedAt: order.cookingStartedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'cooking',
        message: 'Your order is being cooked!',
        updatedAt: new Date()
      });
      
      console.log(`📢 Cooking started notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Started cooking', order });
  } catch (error) {
    console.error('Start cooking error:', error);
    res.status(500).json({ success: false, message: 'Failed to start cooking' });
  }
});

// Chef completes cooking (marks as ready)
router.post('/complete-cooking/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.status !== 'cooking') {
      return res.status(400).json({ success: false, message: 'Order must be cooking to complete' });
    }

    order.cookingCompletedAt = new Date();
    if (order.cookingStartedAt) {
      const diffMs = order.cookingCompletedAt - order.cookingStartedAt;
      order.cookingTime = Math.round(diffMs / 60000);
    }
    order.status = 'ready';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('ready', req.user._id, `Cooking completed in ${order.cookingTime} minutes`);
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').to('staff-delivery').emit('order-ready', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        cookingTime: order.cookingTime,
        completedAt: order.cookingCompletedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'ready',
        message: 'Your order is ready for pickup/delivery!',
        updatedAt: new Date()
      });
      
      console.log(`📢 Order ready notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Order marked as ready', order });
  } catch (error) {
    console.error('Complete cooking error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete cooking' });
  }
});

// ========== DELIVERY ENDPOINTS ==========

// Delivery starts delivery
router.post('/start-delivery/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.status !== 'ready') {
      return res.status(400).json({ success: false, message: 'Order must be ready to start delivery' });
    }

    order.deliveryStartedAt = new Date();
    order.status = 'out-for-delivery';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('out-for-delivery', req.user._id, 'Started delivery');
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('delivery-started', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryName: req.user.name,
        startedAt: order.deliveryStartedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'out-for-delivery',
        message: 'Your order is on the way!',
        updatedAt: new Date()
      });
      
      console.log(`📢 Delivery started notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Started delivery', order });
  } catch (error) {
    console.error('Start delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to start delivery' });
  }
});

// Delivery completes delivery
router.post('/complete-delivery/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
    }

    if (order.status !== 'out-for-delivery') {
      return res.status(400).json({ success: false, message: 'Order must be out for delivery to complete' });
    }

    order.deliveryCompletedAt = new Date();
    if (order.deliveryStartedAt) {
      const diffMs = order.deliveryCompletedAt - order.deliveryStartedAt;
      order.deliveryTime = Math.round(diffMs / 60000);
    }
    order.status = 'delivered';
    
    if (order.addStatusHistory) {
      order.addStatusHistory('delivered', req.user._id, `Delivery completed in ${order.deliveryTime} minutes`);
    }

    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to('staff-admin').emit('order-delivered', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryName: req.user.name,
        deliveryTime: order.deliveryTime,
        completedAt: order.deliveryCompletedAt
      });
      
      io.to(`order-${order._id}`).emit('order-status-updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'delivered',
        message: 'Your order has been delivered! Thank you for ordering from Sewrica Cafe!',
        updatedAt: new Date()
      });
      
      console.log(`📢 Order delivered notification sent for order #${order.orderNumber}`);
    }

    res.json({ success: true, message: 'Delivery completed', order });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete delivery' });
  }
});

// ========== STAFF STATS ENDPOINTS ==========

// Get chef stats
router.get('/stats/chef', async (req, res) => {
  try {
    if (req.user.role !== 'cook' && req.user.role !== 'chef') {
      return res.status(403).json({ message: 'Access denied. Cooks only.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = await Order.countDocuments({
      assignedChef: req.user._id,
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const pendingOrders = await Order.countDocuments({
      assignedChef: req.user._id,
      status: 'cooking'
    });

    const completedOrders = await Order.countDocuments({
      assignedChef: req.user._id,
      status: { $in: ['ready', 'delivered'] }
    });

    res.json({
      success: true,
      stats: {
        todayOrders,
        pendingOrders,
        completedOrders,
        totalOrders: todayOrders + pendingOrders + completedOrders
      }
    });
  } catch (error) {
    console.error('Error fetching chef stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// Get delivery stats
router.get('/stats/delivery', async (req, res) => {
  try {
    if (req.user.role !== 'delivery') {
      return res.status(403).json({ message: 'Access denied. Delivery only.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayDeliveries = await Order.countDocuments({
      assignedDelivery: req.user._id,
      deliveryStartedAt: { $gte: today, $lt: tomorrow }
    });

    const pendingDeliveries = await Order.countDocuments({
      assignedDelivery: req.user._id,
      status: 'out-for-delivery'
    });

    const completedDeliveries = await Order.countDocuments({
      assignedDelivery: req.user._id,
      status: 'delivered'
    });

    res.json({
      success: true,
      stats: {
        todayDeliveries,
        pendingDeliveries,
        completedDeliveries,
        totalDeliveries: todayDeliveries + pendingDeliveries + completedDeliveries
      }
    });
  } catch (error) {
    console.error('Error fetching delivery stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// ========== INDIVIDUAL PERFORMANCE REPORTS ==========

// Get chef performance report
router.get('/reports/chef/:chefId', async (req, res) => {
  try {
    const { chefId } = req.params;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.cookingCompletedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const orders = await Order.find({
      assignedChef: chefId,
      cookingCompletedAt: { $ne: null },
      ...dateFilter
    });

    let totalItemsCooked = 0;
    let totalCookingTime = 0;
    const itemsBreakdown = {};

    orders.forEach(order => {
      totalCookingTime += order.cookingTime || 0;
      order.items.forEach(item => {
        totalItemsCooked += item.quantity;
        itemsBreakdown[item.name] = (itemsBreakdown[item.name] || 0) + item.quantity;
      });
    });

    const avgCookingTime = orders.length > 0 ? (totalCookingTime / orders.length).toFixed(1) : 0;

    res.json({
      success: true,
      summary: {
        totalOrders: orders.length,
        totalItemsCooked,
        totalCookingTime,
        averageCookingTime: avgCookingTime
      },
      itemsBreakdown
    });
  } catch (error) {
    console.error('Get chef report error:', error);
    res.status(500).json({ message: 'Failed to get chef report' });
  }
});

// Get delivery performance report
router.get('/reports/delivery/:deliveryId', async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.deliveryCompletedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const orders = await Order.find({
      assignedDelivery: deliveryId,
      deliveryCompletedAt: { $ne: null },
      ...dateFilter
    });

    let totalDeliveryTime = 0;
    let totalAmount = 0;

    orders.forEach(order => {
      totalDeliveryTime += order.deliveryTime || 0;
      totalAmount += order.totalAmount || 0;
    });

    const avgDeliveryTime = orders.length > 0 ? (totalDeliveryTime / orders.length).toFixed(1) : 0;

    res.json({
      success: true,
      summary: {
        totalDeliveries: orders.length,
        totalAmount,
        totalDeliveryTime,
        averageDeliveryTime: avgDeliveryTime
      }
    });
  } catch (error) {
    console.error('Get delivery report error:', error);
    res.status(500).json({ message: 'Failed to get delivery report' });
  }
});

// ========== STAFF REPORTS FOR ADMIN ==========

// Get all staff reports (for admin)
router.get('/reports/all', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log('📊 Fetching all staff reports');
    console.log('   Start Date:', startDate);
    console.log('   End Date:', endDate);
    
    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Get all staff (cooks, delivery, cashier)
    const staff = await User.find({
      role: { $in: ['cook', 'delivery', 'cashier'] },
      isActive: true
    }).select('name email phone role');
    
    console.log(`📋 Found ${staff.length} staff members`);
    
    const reports = [];
    
    for (const member of staff) {
      let orders = [];
      let totalRevenue = 0;
      let completedOrders = 0;
      let cancelledOrders = 0;
      const performance = {};
      
      if (member.role === 'cook') {
        orders = await Order.find({
          assignedChef: member._id,
          ...dateFilter
        });
        
        completedOrders = orders.filter(o => o.status === 'ready' || o.status === 'delivered').length;
        cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        // Daily breakdown
        orders.forEach(order => {
          const date = order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { orders: 0, revenue: 0 };
          }
          performance[date].orders++;
          performance[date].revenue += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders,
          averageRating: 4.5,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            orders: data.orders,
            revenue: data.revenue
          }))
        });
        
      } else if (member.role === 'delivery') {
        orders = await Order.find({
          assignedDelivery: member._id,
          status: 'delivered',
          ...dateFilter
        });
        
        completedOrders = orders.length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        // Daily breakdown
        orders.forEach(order => {
          const date = order.deliveryCompletedAt?.toISOString().split('T')[0] || order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { deliveries: 0, amount: 0 };
          }
          performance[date].deliveries++;
          performance[date].amount += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders: 0,
          averageRating: 4.6,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            deliveries: data.deliveries,
            amount: data.amount
          }))
        });
      } else if (member.role === 'cashier') {
        orders = await Order.find({
          paymentStatus: 'completed',
          ...dateFilter
        });
        
        completedOrders = orders.length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        // Daily breakdown
        orders.forEach(order => {
          const date = order.paidAt?.toISOString().split('T')[0] || order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { transactions: 0, amount: 0 };
          }
          performance[date].transactions++;
          performance[date].amount += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders: 0,
          averageRating: 4.8,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            transactions: data.transactions,
            amount: data.amount
          }))
        });
      }
    }
    
    res.json({
      success: true,
      reports
    });
    
  } catch (error) {
    console.error('Error fetching staff reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch staff reports',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get staff reports by role
router.get('/reports/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const { startDate, endDate } = req.query;
    
    const validRoles = ['cook', 'delivery', 'cashier'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Must be cook, delivery, or cashier' 
      });
    }
    
    console.log(`📊 Fetching ${role} reports`);
    console.log('   Start Date:', startDate);
    console.log('   End Date:', endDate);
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const staff = await User.find({
      role: role,
      isActive: true
    }).select('name email phone');
    
    console.log(`📋 Found ${staff.length} ${role}s`);
    
    const reports = [];
    
    for (const member of staff) {
      let orders = [];
      let totalRevenue = 0;
      let completedOrders = 0;
      const performance = {};
      
      if (role === 'cook') {
        orders = await Order.find({
          assignedChef: member._id,
          ...dateFilter
        });
        
        completedOrders = orders.filter(o => o.status === 'ready' || o.status === 'delivered').length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        orders.forEach(order => {
          const date = order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { orders: 0, revenue: 0 };
          }
          performance[date].orders++;
          performance[date].revenue += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
          averageRating: 4.5,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            orders: data.orders,
            revenue: data.revenue
          }))
        });
        
      } else if (role === 'delivery') {
        orders = await Order.find({
          assignedDelivery: member._id,
          status: 'delivered',
          ...dateFilter
        });
        
        completedOrders = orders.length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        orders.forEach(order => {
          const date = order.deliveryCompletedAt?.toISOString().split('T')[0] || order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { deliveries: 0, amount: 0 };
          }
          performance[date].deliveries++;
          performance[date].amount += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders: 0,
          averageRating: 4.6,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            deliveries: data.deliveries,
            amount: data.amount
          }))
        });
        
      } else if (role === 'cashier') {
        orders = await Order.find({
          paymentStatus: 'completed',
          ...dateFilter
        });
        
        completedOrders = orders.length;
        totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
        orders.forEach(order => {
          const date = order.paidAt?.toISOString().split('T')[0] || order.createdAt.toISOString().split('T')[0];
          if (!performance[date]) {
            performance[date] = { transactions: 0, amount: 0 };
          }
          performance[date].transactions++;
          performance[date].amount += order.totalAmount || 0;
        });
        
        reports.push({
          _id: member._id,
          staffId: member._id,
          name: member.name,
          role: member.role,
          totalOrders: orders.length,
          totalRevenue,
          completedOrders,
          cancelledOrders: 0,
          averageRating: 4.8,
          performance: Object.entries(performance).map(([date, data]) => ({
            date,
            transactions: data.transactions,
            amount: data.amount
          }))
        });
      }
    }
    
    res.json({
      success: true,
      reports
    });
    
  } catch (error) {
    console.error(`Error fetching ${role} reports:`, error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to fetch ${role} reports`,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Export staff report as CSV/PDF
router.get('/reports/export', async (req, res) => {
  try {
    const { format, staffId, startDate, endDate, role } = req.query;
    
    console.log('📊 Exporting staff report');
    console.log('   Format:', format);
    console.log('   Staff ID:', staffId);
    console.log('   Role:', role);
    console.log('   Date Range:', startDate, '-', endDate);
    
    // Build query based on parameters
    let query = {};
    if (staffId) {
      query._id = staffId;
    } else if (role && role !== 'all') {
      query.role = role;
    } else {
      query.role = { $in: ['cook', 'delivery', 'cashier'] };
    }
    
    const staff = await User.find(query).select('name email phone role');
    
    // For now, return JSON. In production, you'd generate CSV/PDF
    res.json({
      success: true,
      message: `Export as ${format} would be generated here`,
      data: staff
    });
    
  } catch (error) {
    console.error('Error exporting staff report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to export staff report' 
    });
  }
});

module.exports = router;