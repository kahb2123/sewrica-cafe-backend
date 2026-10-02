// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');
const { getUnifiedReport, buildCsv, buildPdf } = require('../services/reportService');


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
      isActive: true,
      extraPermissions: req.body.extraPermissions || [],
      deniedPermissions: req.body.deniedPermissions || [],
      pageAccessOverrides: req.body.pageAccessOverrides || {}
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

// @desc    Get staff member's permission overrides
// @route   GET /api/admin/staff/:id/permissions
router.get('/staff/:id/permissions', async (req, res) => {
  try {
    const staff = await User.findById(req.params.id).select('-password');
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }
    res.json({
      success: true,
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
      extraPermissions: staff.extraPermissions || [],
      deniedPermissions: staff.deniedPermissions || [],
      pageAccessOverrides: staff.pageAccessOverrides || {},
    });
  } catch (error) {
    console.error('Error fetching staff permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch staff permissions' });
  }
});

// @desc    Update staff member's permission overrides
// @route   PUT /api/admin/staff/:id/permissions
router.put('/staff/:id/permissions', async (req, res) => {
  try {
    const { extraPermissions, deniedPermissions, pageAccessOverrides } = req.body;

    const staff = await User.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    if (extraPermissions) staff.extraPermissions = extraPermissions;
    if (deniedPermissions) staff.deniedPermissions = deniedPermissions;
    if (pageAccessOverrides) staff.pageAccessOverrides = pageAccessOverrides;

    await staff.save();

    res.json({
      success: true,
      message: 'Staff permissions updated',
      extraPermissions: staff.extraPermissions,
      deniedPermissions: staff.deniedPermissions,
      pageAccessOverrides: staff.pageAccessOverrides,
    });
  } catch (error) {
    console.error('Error updating staff permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to update staff permissions' });
  }
});

// @desc    Delete staff member
// @route   DELETE /api/admin/staff/:id
router.delete('/staff/:id', async (req, res) => {
  try {
    const staff = await User.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    await staff.deleteOne();

    res.json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member'
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

    const isReassignment = order.assignedChef && order.assignedChef.toString() !== chefId;

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
       notes: `Assigned to chef: ${chef.name}${notes ? ` (${notes})` : ''}${isReassignment ? ' (Reassigned)' : ''}`
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

    if (order.assignedDelivery && order.assignedDelivery.toString() !== deliveryId) {
      // Reassignment allowed for admin
    }

    const isReassignment = order.assignedDelivery && order.assignedDelivery.toString() !== deliveryId;

    order.assignedDelivery = deliveryId;
    if (!order.assignedAt) order.assignedAt = {};
    order.assignedAt.delivery = new Date();
    if (notes) order.deliveryNotes = notes;
    
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: 'ready',
      changedBy: req.user._id,
      changedAt: new Date(),
       notes: `Assigned to delivery: ${delivery.name}${notes ? ` (${notes})` : ''}${isReassignment ? ' (Reassigned)' : ''}`
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

// ========== UNIFIED REPORTS ==========
// One endpoint replaces /reports/{daily,weekly,monthly,custom} and /reports/export/:type.
// The optional `section` query param (sales | items | staff) skips the unneeded
// aggregations, so an export can be focused on just the staff or just the items.

const isValidationError = (message) =>
  !message || /Invalid date range|Start date must be before/i.test(message);

router.get('/reports/unified', async (req, res) => {
  try {
    const report = await getUnifiedReport({
      start: req.query.start,
      end: req.query.end,
      role: req.query.role,
      staffId: req.query.staffId,
      section: req.query.section
    });
    res.json({ success: true, data: report });
  } catch (error) {
    const status = isValidationError(error.message) ? 400 : 500;
    res.status(status).json({ success: false, message: error.message || 'Failed to build report' });
  }
});

router.get('/reports/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({ success: false, message: 'Format must be csv or pdf' });
    }

    const report = await getUnifiedReport({
      start: req.query.start,
      end: req.query.end,
      role: req.query.role,
      section: req.query.section
    });
    const filename = `sewrica-report-${report.period.start}-to-${report.period.end}.${format}`;

    if (format === 'csv') {
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      return res.send(buildCsv(report));
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return buildPdf(report, PDFDocument).pipe(res);
  } catch (error) {
    const status = isValidationError(error.message) ? 400 : 500;
    res.status(status).json({ success: false, message: error.message || 'Failed to export report' });
  }
});

// @desc    Staff performance report — revenue and orders per staff member
// @route   GET /api/admin/reports/staff-performance
router.get('/reports/staff-performance', async (req, res) => {
  try {
    const range = {};
    if (req.query.start) range.$gte = new Date(req.query.start);
    if (req.query.end) {
      range.$lte = new Date(req.query.end);
      range.$lte.setHours(23, 59, 59, 999);
    }

    const match = { ...(Object.keys(range).length ? { createdAt: range } : {}) };

    const [cashierData, chefData, deliveryData, allStaff] = await Promise.all([
      Order.aggregate([
        { $match: { ...match, processedBy: { $ne: null } } },
        { $group: { _id: '$processedBy', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { ...match, assignedChef: { $ne: null } } },
        { $group: { _id: '$assignedChef', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { ...match, assignedDelivery: { $ne: null } } },
        { $group: { _id: '$assignedDelivery', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
      ]),
      User.find({ isActive: true, role: { $in: ['cook', 'delivery', 'cashier'] } }).lean()
    ]);

    const allStaffIds = new Set();
    const mergedMap = new Map();

    [cashierData, chefData, deliveryData].forEach((dataList) => {
      dataList.forEach((row) => {
        const id = String(row._id);
        allStaffIds.add(id);
        const existing = mergedMap.get(id) || { totalOrders: 0, totalRevenue: 0 };
        mergedMap.set(id, {
          totalOrders: existing.totalOrders + row.totalOrders,
          totalRevenue: existing.totalRevenue + row.totalRevenue
        });
      });
    });

    const staffIdMap = new Map();
    (allStaff || []).forEach((u) => {
      staffIdMap.set(String(u._id), u);
    });

    const staffData = Array.from(mergedMap.entries()).map(([id, data]) => {
      const user = staffIdMap.get(id) || {};
      return {
        staffId: id,
        name: user.name || 'Unassigned',
        role: user.role || 'unknown',
        totalOrders: data.totalOrders,
        totalRevenue: Math.round(data.totalRevenue * 100) / 100
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json({ success: true, data: { staff: staffData, allStaff } });
  } catch (error) {
    console.error('Staff performance report error:', error);
    res.status(500).json({ success: false, message: 'Failed to build staff performance report' });
  }
});

// @desc    Item performance report — units sold and revenue per menu item
// @route   GET /api/admin/reports/item-performance
router.get('/reports/item-performance', async (req, res) => {
  try {
    const range = {};
    if (req.query.start) range.$gte = new Date(req.query.start);
    if (req.query.end) {
      range.$lte = new Date(req.query.end);
      range.$lte.setHours(23, 59, 59, 999);
    }

    const match = { ...(Object.keys(range).length ? { createdAt: range } : {}) };

    const pipeline = [
      { $match: match },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.menuItem',
        name: { $first: '$items.name' },
        category: { $first: '$items.category' },
        unitsSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        orderCount: { $sum: 1 },
      }},
      { $lookup: { from: 'menuitems', localField: '_id', foreignField: '_id', as: 'menuItem' } },
      { $unwind: { path: '$menuItem', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id: 1,
        name: 1,
        category: 1,
        unitsSold: 1,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        orderCount: 1,
        currentStock: '$menuItem.stockQuantity',
        isAvailable: '$menuItem.isAvailable',
        image: '$menuItem.image',
      }},
      { $sort: { totalRevenue: -1 } }
    ];

    const items = await Order.aggregate(pipeline);
    res.json({ success: true, data: { items } });
  } catch (error) {
    console.error('Item performance report error:', error);
    res.status(500).json({ success: false, message: 'Failed to build item performance report' });
  }
});

// @desc    Export staff or item performance report as CSV or PDF
// @route   GET /api/admin/reports/export
router.get('/reports/export', async (req, res) => {
  try {
    const { format = 'csv', type = 'staff', start, end, staffId } = req.query;
    const range = {};
    if (start) range.$gte = new Date(start);
    if (end) {
      range.$lte = new Date(end);
      range.$lte.setHours(23, 59, 59, 999);
    }

    const dateFilter = Object.keys(range).length ? { createdAt: range } : {};
    let rows = [];

    if (type === 'items') {
      rows = await Order.aggregate([
        { $match: dateFilter },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          category: { $first: '$items.category' },
          unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
          totalRevenue: { $sum: { $multiply: [{ $ifNull: ['$items.price', 0] }, { $ifNull: ['$items.quantity', 0] }] } },
          orderCount: { $sum: { $cond: [{ $ifNull: ['$items._id', false] }, 1, 0] } }
        }},
        { $sort: { totalRevenue: -1 } }
      ]);
    } else {
      const mongoose = require('mongoose');
      const { isValidObjectId } = mongoose;
      const staffFilter = staffId && isValidObjectId(staffId)
        ? { $or: [
            { processedBy: mongoose.Types.ObjectId(staffId) },
            { assignedChef: mongoose.Types.ObjectId(staffId) },
            { assignedDelivery: mongoose.Types.ObjectId(staffId) }
          ] }
        : {};

      const [cashierRows, chefRows, deliveryRows, allStaffList] = await Promise.all([
        Order.aggregate([
          { $match: { ...staffFilter, processedBy: { $ne: null } } },
          { $group: { _id: '$processedBy', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
        ]),
        Order.aggregate([
          { $match: { ...staffFilter, assignedChef: { $ne: null } } },
          { $group: { _id: '$assignedChef', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
        ]),
        Order.aggregate([
          { $match: { ...staffFilter, assignedDelivery: { $ne: null } } },
          { $group: { _id: '$assignedDelivery', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' } } }
        ]),
        User.find({ isActive: true, role: { $in: ['cook', 'delivery', 'cashier'] } }).lean()
      ]);

      const staffIdMap = new Map();
      (allStaffList || []).forEach((u) => staffIdMap.set(String(u._id), u));

      const mergedMap = new Map();
      [cashierRows, chefRows, deliveryRows].forEach((dataList) => {
        dataList.forEach((row) => {
          const id = String(row._id);
          const existing = mergedMap.get(id) || { totalOrders: 0, totalRevenue: 0 };
          mergedMap.set(id, {
            totalOrders: existing.totalOrders + row.totalOrders,
            totalRevenue: existing.totalRevenue + row.totalRevenue
          });
        });
      });

      rows = Array.from(mergedMap.entries()).map(([id, data]) => {
        const user = staffIdMap.get(id) || {};
        return {
          staffId: id,
          name: user.name || 'Unassigned',
          role: user.role || 'unknown',
          totalOrders: data.totalOrders,
          totalRevenue: Math.round(data.totalRevenue * 100) / 100
        };
      }).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    if (format === 'csv') {
      const headers = type === 'items'
        ? ['Menu Item', 'Category', 'Units Sold', 'Revenue (ETB)', 'Orders']
        : ['Name', 'Role', 'Orders Handled', 'Revenue (ETB)'];
      const csvRows = [
        headers.join(','),
        ...rows.map((row) => {
          const values = type === 'items'
            ? [row.name, row.category || 'N/A', row.unitsSold, Number(row.totalRevenue).toFixed(2), row.orderCount]
            : [row.name || 'Unassigned', row.role || 'N/A', row.totalOrders, Number(row.totalRevenue).toFixed(2)];
          return values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        })
      ];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sewrica-report-${type}-${start || 'start'}-to-${end || 'end'}.csv"`);
      return res.send(csvRows.join('\n'));
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });
      const filename = `sewrica-report-${type}-${start || 'start'}-to-${end || 'end'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.fontSize(18).text('Sewrica Cafe - Report');
      doc.fontSize(12).text(`${type === 'items' ? 'Item Performance' : 'Staff Performance'} Report`, { paragraphGap: 10 });
      doc.text(`Period: ${start || 'All time'} to ${end || 'Present'}`);
      doc.moveDown();
      doc.fontSize(10);
      if (type === 'items') {
        doc.text('Menu Item | Category | Units Sold | Revenue (ETB) | Orders');
        rows.forEach((row) => {
          doc.text(`${row.name} | ${row.category || 'N/A'} | ${row.unitsSold} | ${Number(row.totalRevenue).toFixed(2)} | ${row.orderCount}`);
        });
      } else {
        doc.text('Name | Role | Orders Handled | Revenue (ETB)');
        rows.forEach((row) => {
          doc.text(`${row.name || 'Unassigned'} | ${row.role || 'N/A'} | ${row.totalOrders} | ${Number(row.totalRevenue).toFixed(2)}`);
        });
      }
      doc.pipe(res);
      doc.end();
      return;
    }

    res.status(400).json({ success: false, message: 'Format must be csv or pdf' });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ success: false, message: 'Failed to export report' });
  }
});

// @desc    Staff detail report with item breakdown
// @route   GET /api/admin/reports/staff/:staffId
router.get('/reports/staff/:staffId', async (req, res) => {
  try {
    const { staffId } = req.params;
    const range = {};
    if (req.query.start) range.$gte = new Date(req.query.start);
    if (req.query.end) {
      range.$lte = new Date(req.query.end);
      range.$lte.setHours(23, 59, 59, 999);
    }

    const mongoose = require('mongoose');
    const { isValidObjectId } = mongoose;

    if (!isValidObjectId(staffId)) {
      return res.status(400).json({ success: false, message: 'Invalid staff ID' });
    }

    const staffObjId = mongoose.Types.ObjectId(staffId);
    const dateMatch = Object.keys(range).length ? { createdAt: range } : {};
    const staffFilter = {
      $or: [
        { processedBy: staffObjId },
        { assignedChef: staffObjId },
        { assignedDelivery: staffObjId }
      ]
    };
    const fullFilter = { ...dateMatch, ...staffFilter };

    let staffInfo = null, orders = [], items = [];
    try {
      [staffInfo, orders] = await Promise.all([
        User.findById(staffId, 'name role email phone').lean(),
        Order.find(fullFilter).select('orderNumber status paymentStatus totalAmount items createdAt').lean()
      ]);
    } catch (queryError) {
      console.error('Staff detail query error:', queryError.message, queryError.stack);
      throw queryError;
    }

    const itemsMap = new Map();
    (orders || []).forEach((order) => {
      (order.items || []).forEach((item) => {
        const itemName = item?.name || 'Unknown item';
        const qty = Number(item?.quantity) || 0;
        const price = Number(item?.price) || 0;
        const existing = itemsMap.get(itemName) || { quantity: 0, revenue: 0 };
        itemsMap.set(itemName, {
          quantity: existing.quantity + qty,
          revenue: existing.revenue + (price * qty)
        });
      });
    });

    items = Array.from(itemsMap.entries()).map(([name, data]) => ({
      _id: name,
      quantity: data.quantity,
      revenue: data.revenue
    })).sort((a, b) => b.quantity - a.quantity);

    if (!staffInfo) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    const detail = {
      staffId: staffInfo._id,
      name: staffInfo.name,
      role: staffInfo.role,
      email: staffInfo.email || '',
      phone: staffInfo.phone || '',
      summary: {
        totalOrders: orders.length,
        totalRevenue: Number(orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0)).toFixed(2),
        avgOrderValue: orders.length ? Number(orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) / orders.length).toFixed(2) : '0.00'
      },
      itemsBreakdown: Object.fromEntries(items.map((row) => [row._id, row.quantity])),
      recentOrders: orders.slice(0, 20).map((order) => ({
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: Number(order.totalAmount || 0).toFixed(2),
        itemCount: order.items?.length || 0,
        createdAt: order.createdAt
      }))
    };

    res.json({ success: true, data: { staffDetail: detail } });
  } catch (error) {
    console.error('Staff detail report error:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to build staff detail report' });
  }
});

module.exports = router;
