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

    const [staffData, allStaff] = await Promise.all([
      Order.aggregate([
        { $match: match },
        { $group: {
          _id: {
            staff: '$processedBy',
            role: { $first: '$processedByRole' }
          },
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
        }},
        { $lookup: { from: 'users', localField: '_id.staff', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: {
          _id: 0,
          staffId: '$_id.staff',
          name: '$user.name',
          role: '$user.role',
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] }
        }},
        { $sort: { totalRevenue: -1 } }
      ]),
      User.find({ isActive: true, role: { $in: ['cook', 'delivery', 'cashier'] } }).lean()
    ]);

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

module.exports = router;
