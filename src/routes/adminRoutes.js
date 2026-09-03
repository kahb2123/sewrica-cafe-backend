// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

const salesFilter = {
  status: { $ne: 'cancelled' }
};

const buildSalesReport = async (startDate, endDate) => {
  const orders = await Order.find({
    createdAt: { $gte: startDate, $lt: endDate },
    ...salesFilter
  })
    .populate('items.menuItem')
    .populate('assignedDelivery', 'name');

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
  const categoryBreakdown = {};
  const deliveryBreakdown = {};
  const itemSales = {};

  orders.forEach(order => {
    order.items.forEach(item => {
      const category = item.menuItem?.category || item.category || 'other';
      categoryBreakdown[category] ||= { itemsSold: 0, revenue: 0 };
      categoryBreakdown[category].itemsSold += item.quantity;
      categoryBreakdown[category].revenue += item.price * item.quantity;

      const itemName = item.name || item.menuItem?.name || 'Unknown item';
      itemSales[itemName] ||= { quantity: 0, revenue: 0 };
      itemSales[itemName].quantity += item.quantity;
      itemSales[itemName].revenue += item.price * item.quantity;
    });

    if (order.assignedDelivery) {
      const deliveryName = order.assignedDelivery.name || String(order.assignedDelivery);
      deliveryBreakdown[deliveryName] ||= { ordersCount: 0, totalAmount: 0 };
      deliveryBreakdown[deliveryName].ordersCount += 1;
      deliveryBreakdown[deliveryName].totalAmount += Number(order.totalAmount) || 0;
    }
  });

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
    categoryBreakdown: Object.entries(categoryBreakdown).map(([category, data]) => ({ category, ...data })),
    deliveryBreakdown: Object.entries(deliveryBreakdown).map(([name, data]) => ({ name, ...data })),
    topItems: Object.entries(itemSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
  };
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const getReportPeriod = (type, start, end) => {
  if (type === 'custom') {
    if (!start || !end) throw new Error('Start and end dates are required');
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new Error('Invalid date range');
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (startDate > endDate) throw new Error('Start date must be before or equal to end date');
    endDate.setDate(endDate.getDate() + 1);
    return [startDate, endDate];
  }

  if (type === 'daily') {
    const date = new Date(start || new Date());
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return [date, nextDay];
  }

  if (type === 'weekly') {
    const date = new Date(start || new Date());
    if (Number.isNaN(date.getTime())) throw new Error('Invalid week date');
    date.setHours(0, 0, 0, 0);
    const weekStart = start ? date : new Date(date.setDate(date.getDate() - date.getDay()));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return [weekStart, weekEnd];
  }

  if (type === 'monthly') {
    const date = new Date(start || new Date());
    if (Number.isNaN(date.getTime())) throw new Error('Invalid month date');
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    return [monthStart, new Date(date.getFullYear(), date.getMonth() + 1, 1)];
  }

  throw new Error('Unsupported report type');
};

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

    const validRoles = ['cook', 'delivery', 'cashier', 'supply_chain', 'admin'];
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
    
    if (role && ['cook', 'delivery', 'cashier', 'supply_chain', 'admin'].includes(role)) {
      query.role = role;
    } else if (!role) {
      query.role = { $in: ['cook', 'delivery', 'cashier', 'supply_chain', 'admin'] };
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
    
    res.json(await buildSalesReport(reportDate, nextDay));
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
    
    res.json({
      ...(await buildSalesReport(startOfWeek, endOfWeek)),
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
    const endExclusive = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    res.json({
      ...(await buildSalesReport(startOfMonth, endExclusive)),
      period: 'monthly'
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Export a sales report as CSV or PDF
// @route   GET /api/admin/reports/export/:type
router.get('/reports/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['daily', 'weekly', 'monthly', 'custom'].includes(type)) {
      return res.status(400).json({ message: 'Unsupported report type' });
    }
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({ message: 'Format must be csv or pdf' });
    }

    const [startDate, endDate] = getReportPeriod(type, req.query.start, req.query.end);
    const report = await buildSalesReport(startDate, endDate);
    const filename = `report-${type}.${format}`;

    if (format === 'csv') {
      const rows = [
        ['Sales Report', type],
        ['Total Orders', report.totalOrders],
        ['Total Revenue', report.totalRevenue],
        ['Average Order Value', report.averageOrderValue],
        [],
        ['Top Selling Items'],
        ['Item', 'Quantity', 'Revenue'],
        ...report.topItems.map(item => [item.name, item.quantity, item.revenue]),
        [],
        ['Sales by Category'],
        ['Category', 'Items Sold', 'Revenue'],
        ...report.categoryBreakdown.map(item => [item.category, item.itemsSold, item.revenue]),
        [],
        ['Delivery Performance'],
        ['Delivery Person', 'Orders', 'Amount'],
        ...report.deliveryBreakdown.map(item => [item.name, item.ordersCount, item.totalAmount])
      ];
      const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` });
      return res.send(csv);
    }

    const document = new PDFDocument({ margin: 48 });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    document.pipe(res);
    document.fontSize(18).text(`Sewrica Cafe ${type} Sales Report`);
    document.moveDown().fontSize(11).text(`Period: ${startDate.toISOString().slice(0, 10)} to ${new Date(endDate - 1).toISOString().slice(0, 10)}`);
    document.moveDown().text(`Total orders: ${report.totalOrders}`);
    document.text(`Total revenue: ${report.totalRevenue.toLocaleString()} ETB`);
    document.text(`Average order value: ${report.averageOrderValue.toLocaleString()} ETB`);
    document.moveDown().fontSize(14).text('Top Selling Items');
    document.fontSize(10);
    report.topItems.forEach(item => document.text(`${item.name}: ${item.quantity} items, ${item.revenue.toLocaleString()} ETB`));
    document.moveDown().fontSize(14).text('Sales by Category');
    document.fontSize(10);
    report.categoryBreakdown.forEach(item => document.text(`${item.category}: ${item.itemsSold} items, ${item.revenue.toLocaleString()} ETB`));
    document.moveDown().fontSize(14).text('Delivery Performance');
    document.fontSize(10);
    report.deliveryBreakdown.forEach(item => document.text(`${item.name}: ${item.ordersCount} orders, ${item.totalAmount.toLocaleString()} ETB`));
    return document.end();
  } catch (error) {
    console.error('Report export error:', error);
    return res.status(400).json({ message: error.message || 'Failed to export report' });
  }
});

// @desc    Get a report for a custom date range
// @route   GET /api/admin/reports/custom
router.get('/reports/custom', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (startDate > endDate) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    endDate.setDate(endDate.getDate() + 1);
    res.json(await buildSalesReport(startDate, endDate));
  } catch (error) {
    console.error('Custom report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;