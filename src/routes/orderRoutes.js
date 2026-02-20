const express = require('express');
const router = express.Router();
const {
  createOrder,
  getUserOrders,
  getOrder,
  cancelOrder,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// All order routes require authentication
router.use(protect);

// @desc    Create new order
// @route   POST /api/orders
router.post('/', createOrder);

// @desc    Get user's orders
// @route   GET /api/orders/my-orders
router.get('/my-orders', getUserOrders);

// @desc    Get single order
// @route   GET /api/orders/:id
router.get('/:id', getOrder);

// @desc    Cancel order
// @route   PATCH /api/orders/:id/cancel
router.patch('/:id/cancel', cancelOrder);

// @desc    Update order status (staff only)
// @route   PATCH /api/orders/:id/status
router.patch('/:id/status', updateOrderStatus);

module.exports = router;