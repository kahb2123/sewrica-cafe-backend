const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Protect all admin routes - only admins can access
router.use(protect); // First check if user is authenticated
router.use(adminOnly); // Then check if user is admin

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

// @desc    Toggle user status (if you have status field)
// @route   PATCH /api/admin/users/:id/toggle-status
router.patch('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // If you have a status field, toggle it
    // If not, you can toggle an 'active' field or just return success
    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();
    
    res.json({ message: 'User status updated', status: user.status });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

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
    
    // Category breakdown
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
    
    // Delivery breakdown (if you have assignedTo field)
    const deliveryBreakdown = {};
    orders.forEach(order => {
      if (order.assignedTo) {
        if (!deliveryBreakdown[order.assignedTo]) {
          deliveryBreakdown[order.assignedTo] = { ordersCount: 0, totalAmount: 0 };
        }
        deliveryBreakdown[order.assignedTo].ordersCount += 1;
        deliveryBreakdown[order.assignedTo].totalAmount += order.totalAmount;
      }
    });
    
    // Top items
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