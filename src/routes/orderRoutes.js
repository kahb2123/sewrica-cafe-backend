const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus,
  // Import new payment functions
  processCashPayment,
  confirmPayment,
  getOrdersByPaymentStatus,
  getPaymentStatus,
  refundPayment
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { requirePagePermission, requirePermission, requireRole } = require('../middleware/roleMiddleware');
const { PERMISSIONS } = require('../config/roleMap');

const requireOrderStatusPagePermission = (req, res, next) => {
  const pagesByRole = {
    admin: ['adminOrders'],
    cashier: ['adminOrders'],
    cook: ['staffDashboard', 'staffOrdersCooking'],
    chef: ['staffDashboard', 'staffOrdersCooking'],
    delivery: ['staffDashboard', 'staffOrdersDelivery'],
  };
  const requiredPages = pagesByRole[req.user.role];

  if (!requiredPages) {
    return res.status(403).json({ message: 'Access denied. Order status updates are not allowed for this role' });
  }

  const checkPage = (index) => {
    if (index === requiredPages.length) {
      return next();
    }
    return requirePagePermission(requiredPages[index], 'write')(req, res, () => checkPage(index + 1));
  };

  return checkPage(0);
};

// All order routes require authentication
router.use(protect);

// ========== CUSTOMER ROUTES ==========

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (authenticated users)
router.post('/', createOrder);

// @desc    Get user's orders
// @route   GET /api/orders/my-orders
// @access  Private
router.get('/my-orders', getUserOrders);

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private (order owner or admin)
router.get('/:id', getOrder);

// @desc    Cancel order
// @route   PATCH /api/orders/:id/cancel
// @access  Private (order owner)
router.patch('/:id/cancel', cancelOrder);

// @desc    Get payment status for an order
// @route   GET /api/orders/:id/payment-status
// @access  Private (order owner or staff)
router.get('/:id/payment-status', getPaymentStatus);

// ========== STAFF ROUTES (Admin, Cashier, Cook, Delivery) ==========

// @desc    Update order status (staff only)
// @route   PATCH /api/orders/:id/status
// @access  Private (admin, cashier, cook, delivery)
router.patch('/:id/status', requireOrderStatusPagePermission, updateOrderStatus);

// @desc    Process cash payment (staff only)
// @route   POST /api/orders/:id/cash-payment
// @access  Private (admin, cashier only)
router.post('/:id/cash-payment',
  requireRole('admin', 'cashier'),
  requirePagePermission('staffDashboard', 'write'),
  requirePermission(PERMISSIONS.PAYMENTS_PROCESS),
  processCashPayment
);

// @desc    Get orders by payment status (staff only)
// @route   GET /api/orders/payment-status/:status
// @access  Private (admin, cashier only)
router.get('/payment-status/:status',
  requireRole('admin', 'cashier'),
  requirePagePermission('staffDashboard', 'read'),
  requirePermission(PERMISSIONS.PAYMENTS_VIEW),
  getOrdersByPaymentStatus
);

// ========== PAYMENT CONFIRMATION ROUTES ==========

// @desc    Confirm order after successful card payment
// @route   POST /api/orders/:id/confirm-payment
// @access  Private (customer who placed the order)
router.post('/:id/confirm-payment', confirmPayment);

// ========== ADMIN ONLY ROUTES ==========

// @desc    Refund payment (admin only)
// @route   POST /api/orders/:id/refund
// @access  Private (admin only)
router.post('/:id/refund',
  requireRole('admin'),
  requirePagePermission('adminOrders', 'write'),
  refundPayment
);

module.exports = router;