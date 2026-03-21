// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// Protect all admin routes - only admins can access
router.use(protect);
router.use(adminOnly);

// ========== STAFF MANAGEMENT ==========

// @desc    Create new staff member
// @route   POST /api/admin/staff
router.post('/staff', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    
    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    const validRoles = ['cook', 'delivery', 'cashier', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid role. Must be one of: cook, delivery, cashier, admin' 
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User with this email already exists' 
      });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const staff = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      role,
      isActive: true
    });
    
    const staffResponse = staff.toObject();
    delete staffResponse.password;
    
    res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      staff: staffResponse
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create staff member' 
    });
  }
});

// @desc    Get all staff members
// @route   GET /api/admin/staff
router.get('/staff', async (req, res) => {
  try {
    const { role } = req.query;
    let query = {};
    
    if (role && ['cook', 'delivery', 'cashier', 'admin'].includes(role)) {
      query.role = role;
    } else if (!role) {
      query.role = { $in: ['cook', 'delivery', 'cashier', 'admin'] };
    }
    
    const staff = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: staff.length,
      staff
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch staff members' 
    });
  }
});

// ========== ASSIGNMENT ENDPOINTS ==========

// @desc    Assign chef to order
// @route   POST /api/admin/orders/:orderId/assign-chef
router.post('/orders/:orderId/assign-chef', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { chefId, notes } = req.body;

    console.log('👨‍🍳 Assigning chef to order:', orderId);
    console.log('   Chef ID:', chefId);
    console.log('   Notes:', notes);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const chef = await User.findOne({ _id: chefId, role: 'cook', isActive: true });
    if (!chef) {
      return res.status(400).json({ 
        success: false, 
        message: 'Chef not found or not available' 
      });
    }

    if (order.assignedChef) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order already has an assigned chef' 
      });
    }

    order.assignedChef = chefId;
    if (!order.assignedAt) order.assignedAt = {};
    order.assignedAt.chef = new Date();
    if (notes) order.chefNotes = notes;
    order.status = 'confirmed';
    
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: 'confirmed',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: `Assigned to chef: ${chef.name}${notes ? ` (${notes})` : ''}`
    });

    await order.save();
    await order.populate('customer', 'name email');
    await order.populate('assignedChef', 'name email');

    const io = req.app.get('io');
    if (io) {
      io.to(`chef-${chefId}`).emit('order-assigned', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount,
        items: order.items.map(item => ({ name: item.name, quantity: item.quantity })),
        assignedAt: order.assignedAt.chef
      });
      
      io.to('staff-admin').emit('order-assigned-chef', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        chefName: chef.name
      });
    }

    res.json({
      success: true,
      message: `Order assigned to chef ${chef.name}`,
      order
    });
  } catch (error) {
    console.error('❌ Assign chef error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to assign chef',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Assign delivery to order
// @route   POST /api/admin/orders/:orderId/assign-delivery
router.post('/orders/:orderId/assign-delivery', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryId, notes } = req.body;

    console.log('🚚 Assigning delivery to order:', orderId);
    console.log('   Delivery ID:', deliveryId);
    console.log('   Notes:', notes);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const delivery = await User.findOne({ _id: deliveryId, role: 'delivery', isActive: true });
    if (!delivery) {
      return res.status(400).json({ 
        success: false, 
        message: 'Delivery person not found or not available' 
      });
    }

    if (order.assignedDelivery) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order already has an assigned delivery person' 
      });
    }

    if (order.status !== 'ready') {
      return res.status(400).json({ 
        success: false, 
        message: 'Order must be ready before assigning delivery' 
      });
    }

    order.assignedDelivery = deliveryId;
    if (!order.assignedAt) order.assignedAt = {};
    order.assignedAt.delivery = new Date();
    if (notes) order.deliveryNotes = notes;
    
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: 'ready',
      changedBy: req.user._id,
      changedAt: new Date(),
      notes: `Assigned to delivery: ${delivery.name}${notes ? ` (${notes})` : ''}`
    });

    await order.save();
    await order.populate('customer', 'name email phone address');
    await order.populate('assignedDelivery', 'name email phone');

    const io = req.app.get('io');
    if (io) {
      io.to(`delivery-${deliveryId}`).emit('order-assigned', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        totalAmount: order.totalAmount,
        items: order.items.map(item => ({ name: item.name, quantity: item.quantity })),
        assignedAt: order.assignedAt.delivery
      });
      
      io.to('staff-admin').emit('order-assigned-delivery', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryName: delivery.name
      });
    }

    res.json({
      success: true,
      message: `Order assigned to delivery person ${delivery.name}`,
      order
    });
  } catch (error) {
    console.error('❌ Assign delivery error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to assign delivery',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== DASHBOARD STATS ==========

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenueResult = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const totalMenuItems = await MenuItem.countDocuments();
    const totalUsers = await User.countDocuments();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });
    
    const todayRevenueResult = await Order.aggregate([
      { 
        $match: { 
          status: 'delivered',
          createdAt: { $gte: today, $lt: tomorrow }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      totalOrders,
      totalRevenue: totalRevenueResult[0]?.total || 0,
      pendingOrders,
      totalMenuItems,
      totalUsers,
      todayOrders,
      todayRevenue: todayRevenueResult[0]?.total || 0
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get recent orders
// @route   GET /api/admin/recent-orders
router.get('/recent-orders', async (req, res) => {
  try {
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customer', 'name email')
      .lean();
    
    res.json(recentOrders);
  } catch (error) {
    console.error('Recent orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get all orders with filter
// @route   GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email phone')
      .populate('assignedChef', 'name email')
      .populate('assignedDelivery', 'name email')
      .lean();
    
    res.json(orders);
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Update order status
// @route   PUT /api/admin/orders/:id
router.put('/orders/:id', async (req, res) => {
  try {
    const { status, assignedTo } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    order.status = status;
    if (assignedTo) {
      order.assignedTo = assignedTo;
    }
    
    await order.save();
    
    res.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get all users
// @route   GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').lean();
    res.json(users);
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.role = role;
    await user.save();
    
    res.json({ message: 'User role updated', user });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Toggle user status
// @route   PATCH /api/admin/users/:id/toggle-status
router.patch('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();
    
    res.json({ message: 'User status updated', status: user.status });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========== REPORT ENDPOINTS ==========

// @desc    Get daily report
// @route   GET /api/admin/reports/daily
router.get('/reports/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const orders = await Order.find({
      createdAt: { $gte: reportDate, $lt: nextDay },
      status: 'delivered'
    }).populate('items.menuItem');
    
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    const categoryBreakdown = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const category = item.category || 'other';
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { itemsSold: 0, revenue: 0 };
        }
        categoryBreakdown[category].itemsSold += item.quantity;
        categoryBreakdown[category].revenue += item.price * item.quantity;
      });
    });
    
    const deliveryBreakdown = {};
    orders.forEach(order => {
      if (order.assignedDelivery) {
        const deliveryName = order.assignedDelivery.name || order.assignedDelivery;
        if (!deliveryBreakdown[deliveryName]) {
          deliveryBreakdown[deliveryName] = { ordersCount: 0, totalAmount: 0 };
        }
        deliveryBreakdown[deliveryName].ordersCount += 1;
        deliveryBreakdown[deliveryName].totalAmount += order.totalAmount;
      }
    });
    
    const itemSales = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const itemName = item.name;
        if (!itemSales[itemName]) {
          itemSales[itemName] = { quantity: 0, revenue: 0 };
        }
        itemSales[itemName].quantity += item.quantity;
        itemSales[itemName].revenue += item.price * item.quantity;
      });
    });
    
    const topItems = Object.entries(itemSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    
    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      categoryBreakdown: Object.entries(categoryBreakdown).map(([category, data]) => ({
        category,
        ...data
      })),
      deliveryBreakdown: Object.entries(deliveryBreakdown).map(([name, data]) => ({
        name,
        ...data
      })),
      topItems
    });
  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get weekly report
// @route   GET /api/admin/reports/weekly
router.get('/reports/weekly', async (req, res) => {
  try {
    const { week } = req.query;
    const now = new Date();
    const startOfWeek = week ? new Date(week) : new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    
    const orders = await Order.find({
      createdAt: { $gte: startOfWeek, $lt: endOfWeek },
      status: 'delivered'
    }).populate('items.menuItem');
    
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      period: 'weekly'
    });
  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get monthly report
// @route   GET /api/admin/reports/monthly
router.get('/reports/monthly', async (req, res) => {
  try {
    const { month } = req.query;
    const now = new Date();
    const startOfMonth = month ? new Date(month) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    const orders = await Order.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      status: 'delivered'
    }).populate('items.menuItem');
    
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      period: 'monthly'
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;