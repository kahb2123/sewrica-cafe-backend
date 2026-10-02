// src/routes/staffRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { PERMISSIONS } = require('../config/roleMap');
const Order = require('../models/Order');
const User = require('../models/User');

// Apply protect middleware to ALL staff routes
router.use(protect);

// Debug middleware to log user info for all staff routes
router.use((req, res, next) => {
  console.log('Staff API called:', req.method, req.originalUrl);
  console.log('   User:', req.user ? { id: req.user._id, role: req.user.role, email: req.user.email } : 'No user');
  next();
});

// ========== GET STAFF BY ROLE ==========
router.get('/:role', requirePermission(PERMISSIONS.STAFF_VIEW), async (req, res) => {
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
router.get('/orders/cooking',
  requirePermission(PERMISSIONS.ORDERS_VIEW_ASSIGNED),
  requirePermission(PERMISSIONS.ORDERS_ACCEPT),
  async (req, res) => {
    try {
      const orders = await Order.find({
        assignedChef: req.user._id,
        status: { $in: ['confirmed', 'preparing', 'cooking'] }
      })
        .sort({ createdAt: -1 })
        .populate('customer', 'name email phone');

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
router.get('/orders/delivery',
  requirePermission(PERMISSIONS.ORDERS_VIEW_ASSIGNED),
  requirePermission(PERMISSIONS.ORDERS_ACCEPT),
  async (req, res) => {
    try {
      const orders = await Order.find({
        assignedDelivery: req.user._id,
        status: { $in: ['ready', 'out-for-delivery'] }
      })
        .sort({ createdAt: -1 })
        .populate('customer', 'name email phone address');

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
router.get('/orders/cooking/completed',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  async (req, res) => {
    try {
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
router.get('/orders/delivery/completed',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  async (req, res) => {
    try {
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
router.post('/orders/:orderId/chef-accept',
  requirePermission(PERMISSIONS.ORDERS_ACCEPT),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Order accepted successfully', order });
    } catch (error) {
      console.error('Chef accept error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept order' });
    }
  });

// Chef rejects order
router.post('/orders/:orderId/chef-reject',
  requirePermission(PERMISSIONS.ORDERS_REJECT),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Order rejected', order });
    } catch (error) {
      console.error('Chef reject error:', error);
      res.status(500).json({ success: false, message: 'Failed to reject order' });
    }
  });

// ========== DELIVERY ACCEPTANCE ENDPOINTS ==========

// Delivery accepts order
router.post('/orders/:orderId/delivery-accept',
  requirePermission(PERMISSIONS.ORDERS_ACCEPT),
  async (req, res) => {
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

      if (order.status !== 'ready') {
        return res.status(400).json({ success: false, message: 'Order must be ready before accepting delivery' });
      }

      if (order.deliveryAccepted) {
        return res.status(400).json({ success: false, message: 'Delivery already accepted' });
      }

      order.deliveryAccepted = true;
      order.deliveryAcceptedAt = new Date();
      if (notes) order.deliveryNotes = notes;

      if (order.addStatusHistory) {
        order.addStatusHistory('ready', req.user._id, `Delivery accepted: ${notes || 'No notes'}`);
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
          status: 'ready',
          message: `${req.user.name} accepted your delivery and will be on the way soon!`,
          updatedAt: new Date()
        });
      }

      res.json({ success: true, message: 'Delivery accepted successfully', order });
    } catch (error) {
      console.error('Delivery accept error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept delivery' });
    }
  });

// Delivery rejects order
router.post('/orders/:orderId/delivery-reject',
  requirePermission(PERMISSIONS.ORDERS_REJECT),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Delivery rejected', order });
    } catch (error) {
      console.error('Delivery reject error:', error);
      res.status(500).json({ success: false, message: 'Failed to reject delivery' });
    }
  });

// ========== COOKING ENDPOINTS ==========

// Chef starts cooking
router.post('/start-cooking/:orderId',
  requirePermission(PERMISSIONS.ORDERS_START_COOKING),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Started cooking', order });
    } catch (error) {
      console.error('Start cooking error:', error);
      res.status(500).json({ success: false, message: 'Failed to start cooking' });
    }
  });

// Chef completes cooking (marks as ready)
router.post('/complete-cooking/:orderId',
  requirePermission(PERMISSIONS.ORDERS_COMPLETE_COOKING),
  async (req, res) => {
    try {
      const { orderId } = req.params;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (order.assignedChef?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'This order is not assigned to you' });
      }

      // Allow from 'preparing' or 'cooking' status
      if (order.status !== 'preparing' && order.status !== 'cooking') {
        return res.status(400).json({
          success: false,
          message: `Order must be preparing or cooking to mark ready. Current status: ${order.status}`
        });
      }

      // Set cooking completed time
      order.cookingCompletedAt = new Date();
      if (order.cookingStartedAt) {
        const diffMs = order.cookingCompletedAt - order.cookingStartedAt;
        order.cookingTime = Math.round(diffMs / 60000);
      }

      // Set status to 'ready'
      order.status = 'ready';

      if (order.addStatusHistory) {
        order.addStatusHistory('ready', req.user._id, `Cooking completed in ${order.cookingTime} minutes`);
      }

      await order.save();

      // Socket notifications
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
      }

      res.json({
        success: true,
        message: 'Order marked as ready',
        order
      });
    } catch (error) {
      console.error('Complete cooking error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete cooking'
      });
    }
  });

// ========== DELIVERY ENDPOINTS ==========

// Delivery starts delivery
router.post('/start-delivery/:orderId',
  requirePermission(PERMISSIONS.ORDERS_START_DELIVERY),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Started delivery', order });
    } catch (error) {
      console.error('Start delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to start delivery' });
    }
  });

// Delivery completes delivery
router.post('/complete-delivery/:orderId',
  requirePermission(PERMISSIONS.ORDERS_COMPLETE_DELIVERY),
  async (req, res) => {
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
      }

      res.json({ success: true, message: 'Delivery completed', order });
    } catch (error) {
      console.error('Complete delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to complete delivery' });
    }
  });

// ========== STAFF STATS ENDPOINTS ==========

// Get chef stats
router.get('/stats/chef',
  requirePermission(PERMISSIONS.ORDERS_VIEW_ASSIGNED),
  async (req, res) => {
    try {
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
router.get('/stats/delivery',
  requirePermission(PERMISSIONS.ORDERS_VIEW_ASSIGNED),
  async (req, res) => {
    try {
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

// ========== KITCHEN DISPLAY ENDPOINTS ==========

// @desc    Get all orders in the kitchen queue (for kitchen display)
// @route   GET /api/staff/orders/kitchen
// @access  Private (cook, chef, admin)
router.get('/orders/kitchen',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  async (req, res) => {
    try {
      const QUEUE_STATUSES = ['pending', 'confirmed', 'preparing', 'cooking'];
      const orders = await Order.find({
        status: { $in: QUEUE_STATUSES },
      })
        .sort({ createdAt: 1 })
        .populate('assignedChef', 'name')
        .populate('assignedDelivery', 'name')
        .populate('items.menuItem');

      res.json(orders || []);
    } catch (error) {
      console.error('Kitchen orders fetch error:', error);
      res.status(500).json({ message: 'Failed to fetch kitchen orders' });
    }
  }
);

// @desc    Assign chef to order (for kitchen display)
// @route   POST /api/staff/orders/:orderId/assign-chef
// @access  Private (cook, chef, admin)
router.post('/orders/:orderId/assign-chef',
  requirePermission(PERMISSIONS.ORDERS_ASSIGN_CHEF),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { chefId } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (order.assignedChef && order.assignedChef.toString() !== chefId) {
        return res.status(400).json({ success: false, message: 'Order already has an assigned chef' });
      }

      order.assignedChef = chefId;
      order.status = 'confirmed';
      await order.save();

      const io = require('../services/socketService');
      if (io) {
        io.to(`order-${order._id}`).emit('order-updated', { orderId: order._id, assignedChef: chefId, status: 'confirmed' });
      }

      const updated = await Order.findById(orderId)
        .populate('assignedChef', 'name')
        .populate('assignedDelivery', 'name');

      res.json({ success: true, message: 'Chef assigned', order: updated });
    } catch (error) {
      console.error('Assign chef error:', error);
      res.status(500).json({ message: 'Failed to assign chef' });
    }
  }
);

// @desc    Assign or reassign delivery person to order (for kitchen display)
// @route   POST /api/staff/orders/:orderId/assign-delivery
// @access  Private (cook, chef, admin)
router.post('/orders/:orderId/assign-delivery',
  requirePermission(PERMISSIONS.ORDERS_ASSIGN_DELIVERY),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deliveryId } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const delivery = await User.findOne({ _id: deliveryId, role: 'delivery', isActive: true });
      if (!delivery) {
        return res.status(400).json({ success: false, message: 'Delivery person not found or not available' });
      }

      order.assignedDelivery = deliveryId;
      if (!order.assignedAt) order.assignedAt = {};
      order.assignedAt.delivery = new Date();

      await order.save();

      const io = require('../services/socketService');
      if (io) {
        io.to(`order-${order._id}`).emit('order-updated', { orderId: order._id, assignedDelivery: deliveryId });
      }

      const updated = await Order.findById(orderId)
        .populate('assignedChef', 'name')
        .populate('assignedDelivery', 'name');

      res.json({ success: true, message: 'Delivery person assigned', order: updated });
    } catch (error) {
      console.error('Assign delivery error:', error);
      res.status(500).json({ message: 'Failed to assign delivery person' });
    }
  }
);

module.exports = router;

