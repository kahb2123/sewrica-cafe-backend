const Order = require('../models/Order');
const User = require('../models/User');

// @desc    Get all available staff by role
// @route   GET /api/staff/:role
// @access  Private (admin only)
const getStaffByRole = async (req, res) => {
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
};

// @desc    Assign order to chef
// @route   POST /api/staff/assign-chef/:orderId
// @access  Private (admin, cashier)
const assignChef = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { chefId, notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify chef exists and has correct role
    const chef = await User.findOne({ _id: chefId, role: 'cook', isActive: true });
    if (!chef) {
      return res.status(400).json({ message: 'Invalid chef or chef not available' });
    }

    // Update order
    order.assignedChef = chefId;
    order.assignedAt.chef = new Date();
    if (notes) order.chefNotes = notes;

    await order.save();

    // Populate for response
    await order.populate('assignedChef', 'name email');
    await order.populate('items.menuItem');

    res.json({
      success: true,
      message: `Order assigned to chef ${chef.name}`,
      order
    });
  } catch (error) {
    console.error('Assign chef error:', error);
    res.status(500).json({ message: 'Failed to assign chef' });
  }
};

// @desc    Assign order to delivery person
// @route   POST /api/staff/assign-delivery/:orderId
// @access  Private (admin, cashier)
const assignDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryId, notes } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify delivery person exists
    const delivery = await User.findOne({ _id: deliveryId, role: 'delivery', isActive: true });
    if (!delivery) {
      return res.status(400).json({ message: 'Invalid delivery person or not available' });
    }

    // Update order
    order.assignedDelivery = deliveryId;
    order.assignedAt.delivery = new Date();
    if (notes) order.deliveryNotes = notes;

    await order.save();

    await order.populate('assignedDelivery', 'name email');

    res.json({
      success: true,
      message: `Order assigned to delivery person ${delivery.name}`,
      order
    });
  } catch (error) {
    console.error('Assign delivery error:', error);
    res.status(500).json({ message: 'Failed to assign delivery' });
  }
};

// @desc    Start cooking (chef accepts order)
// @route   POST /api/staff/start-cooking/:orderId
// @access  Private (cook only)
const startCooking = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify this chef is assigned to the order
    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'This order is not assigned to you' });
    }

    // Update order
    order.cookingStartedAt = new Date();
    order.status = 'preparing';
    await order.save();

    res.json({
      success: true,
      message: 'Started cooking',
      order
    });
  } catch (error) {
    console.error('Start cooking error:', error);
    res.status(500).json({ message: 'Failed to start cooking' });
  }
};

// @desc    Complete cooking (chef finishes order)
// @route   POST /api/staff/complete-cooking/:orderId
// @access  Private (cook only)
const completeCooking = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify this chef is assigned
    if (order.assignedChef?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'This order is not assigned to you' });
    }

    // Calculate cooking time
    const cookingCompletedAt = new Date();
    const cookingTime = Math.round((cookingCompletedAt - order.cookingStartedAt) / 60000); // in minutes

    // Update order
    order.cookingCompletedAt = cookingCompletedAt;
    order.cookingTime = cookingTime;
    order.status = 'ready';
    await order.save();

    res.json({
      success: true,
      message: 'Cooking completed',
      cookingTime,
      order
    });
  } catch (error) {
    console.error('Complete cooking error:', error);
    res.status(500).json({ message: 'Failed to complete cooking' });
  }
};

// @desc    Start delivery (delivery person accepts)
// @route   POST /api/staff/start-delivery/:orderId
// @access  Private (delivery only)
const startDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify this delivery person is assigned
    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'This order is not assigned to you' });
    }

    // Update order
    order.deliveryStartedAt = new Date();
    order.status = 'out-for-delivery';
    await order.save();

    res.json({
      success: true,
      message: 'Delivery started',
      order
    });
  } catch (error) {
    console.error('Start delivery error:', error);
    res.status(500).json({ message: 'Failed to start delivery' });
  }
};

// @desc    Complete delivery
// @route   POST /api/staff/complete-delivery/:orderId
// @access  Private (delivery only)
const completeDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify this delivery person is assigned
    if (order.assignedDelivery?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'This order is not assigned to you' });
    }

    // Calculate delivery time
    const deliveryCompletedAt = new Date();
    const deliveryTime = Math.round((deliveryCompletedAt - order.deliveryStartedAt) / 60000); // in minutes

    // Update order
    order.deliveryCompletedAt = deliveryCompletedAt;
    order.deliveryTime = deliveryTime;
    order.status = 'delivered';
    await order.save();

    res.json({
      success: true,
      message: 'Delivery completed',
      deliveryTime,
      order
    });
  } catch (error) {
    console.error('Complete delivery error:', error);
    res.status(500).json({ message: 'Failed to complete delivery' });
  }
};

// @desc    Get chef performance report
// @route   GET /api/staff/reports/chef/:chefId
// @access  Private (admin only)
const getChefReport = async (req, res) => {
  try {
    const { chefId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.cookingCompletedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all orders completed by this chef
    const orders = await Order.find({
      assignedChef: chefId,
      cookingCompletedAt: { $ne: null },
      ...dateFilter
    }).populate('items.menuItem');

    // Calculate statistics
    let totalItemsCooked = 0;
    let totalCookingTime = 0;
    const itemsBreakdown = {};

    orders.forEach(order => {
      totalCookingTime += order.cookingTime || 0;
      
      order.items.forEach(item => {
        totalItemsCooked += item.quantity;
        const itemName = item.name;
        itemsBreakdown[itemName] = (itemsBreakdown[itemName] || 0) + item.quantity;
      });
    });

    const avgCookingTime = orders.length > 0 
      ? (totalCookingTime / orders.length).toFixed(1) 
      : 0;

    res.json({
      success: true,
      chefId,
      period: { startDate, endDate },
      summary: {
        totalOrders: orders.length,
        totalItemsCooked,
        totalCookingTime,
        averageCookingTime: avgCookingTime
      },
      itemsBreakdown,
      orders
    });
  } catch (error) {
    console.error('Get chef report error:', error);
    res.status(500).json({ message: 'Failed to get chef report' });
  }
};

// @desc    Get delivery person performance report
// @route   GET /api/staff/reports/delivery/:deliveryId
// @access  Private (admin only)
const getDeliveryReport = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.deliveryCompletedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all deliveries completed by this person
    const orders = await Order.find({
      assignedDelivery: deliveryId,
      deliveryCompletedAt: { $ne: null },
      ...dateFilter
    });

    // Calculate statistics
    let totalDeliveryTime = 0;
    let totalAmount = 0;

    orders.forEach(order => {
      totalDeliveryTime += order.deliveryTime || 0;
      totalAmount += order.totalAmount || 0;
    });

    const avgDeliveryTime = orders.length > 0 
      ? (totalDeliveryTime / orders.length).toFixed(1) 
      : 0;

    // Group by day
    const dailyBreakdown = {};
    orders.forEach(order => {
      const date = order.deliveryCompletedAt.toISOString().split('T')[0];
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          count: 0,
          totalAmount: 0,
          totalTime: 0
        };
      }
      dailyBreakdown[date].count++;
      dailyBreakdown[date].totalAmount += order.totalAmount;
      dailyBreakdown[date].totalTime += order.deliveryTime || 0;
    });

    res.json({
      success: true,
      deliveryId,
      period: { startDate, endDate },
      summary: {
        totalDeliveries: orders.length,
        totalAmount,
        totalDeliveryTime,
        averageDeliveryTime: avgDeliveryTime
      },
      dailyBreakdown,
      orders
    });
  } catch (error) {
    console.error('Get delivery report error:', error);
    res.status(500).json({ message: 'Failed to get delivery report' });
  }
};

// @desc    Get all staff performance summary
// @route   GET /api/staff/reports/summary
// @access  Private (admin only)
const getStaffSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get all chefs
    const chefs = await User.find({ role: 'cook', isActive: true });
    const delivery = await User.find({ role: 'delivery', isActive: true });

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.cookingCompletedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get chef performance
    const chefPerformance = await Promise.all(chefs.map(async (chef) => {
      const orders = await Order.find({
        assignedChef: chef._id,
        cookingCompletedAt: { $ne: null },
        ...dateFilter
      });

      const totalItems = orders.reduce((sum, order) => 
        sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
      );

      return {
        chefId: chef._id,
        name: chef.name,
        totalOrders: orders.length,
        totalItemsCooked: totalItems
      };
    }));

    // Get delivery performance
    const deliveryPerformance = await Promise.all(delivery.map(async (person) => {
      const orders = await Order.find({
        assignedDelivery: person._id,
        deliveryCompletedAt: { $ne: null },
        ...dateFilter
      });

      return {
        deliveryId: person._id,
        name: person.name,
        totalDeliveries: orders.length,
        totalAmount: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
      };
    }));

    res.json({
      success: true,
      period: { startDate, endDate },
      chefPerformance,
      deliveryPerformance
    });
  } catch (error) {
    console.error('Get staff summary error:', error);
    res.status(500).json({ message: 'Failed to get staff summary' });
  }
};

module.exports = {
  getStaffByRole,
  assignChef,
  assignDelivery,
  startCooking,
  completeCooking,
  startDelivery,
  completeDelivery,
  getChefReport,
  getDeliveryReport,
  getStaffSummary
};