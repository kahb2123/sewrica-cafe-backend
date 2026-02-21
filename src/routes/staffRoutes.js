const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/staffController');

// All routes require authentication
router.use(protect);

// ========== STAFF MANAGEMENT ==========

// @desc    Get staff by role
// @route   GET /api/staff/:role
// @access  Private (admin, cashier)
router.get('/:role', getStaffByRole);

// ========== ASSIGNMENT ROUTES ==========

// @desc    Assign order to chef
// @route   POST /api/staff/assign-chef/:orderId
// @access  Private (admin, cashier)
router.post('/assign-chef/:orderId', assignChef);

// @desc    Assign order to delivery person
// @route   POST /api/staff/assign-delivery/:orderId
// @access  Private (admin, cashier)
router.post('/assign-delivery/:orderId', assignDelivery);

// ========== COOK ROUTES ==========

// @desc    Start cooking
// @route   POST /api/staff/start-cooking/:orderId
// @access  Private (cook only)
router.post('/start-cooking/:orderId', startCooking);

// @desc    Complete cooking
// @route   POST /api/staff/complete-cooking/:orderId
// @access  Private (cook only)
router.post('/complete-cooking/:orderId', completeCooking);

// ========== DELIVERY ROUTES ==========

// @desc    Start delivery
// @route   POST /api/staff/start-delivery/:orderId
// @access  Private (delivery only)
router.post('/start-delivery/:orderId', startDelivery);

// @desc    Complete delivery
// @route   POST /api/staff/complete-delivery/:orderId
// @access  Private (delivery only)
router.post('/complete-delivery/:orderId', completeDelivery);

// ========== REPORT ROUTES ==========

// @desc    Get chef performance report
// @route   GET /api/staff/reports/chef/:chefId
// @access  Private (admin only)
router.get('/reports/chef/:chefId', getChefReport);

// @desc    Get delivery person report
// @route   GET /api/staff/reports/delivery/:deliveryId
// @access  Private (admin only)
router.get('/reports/delivery/:deliveryId', getDeliveryReport);

// @desc    Get staff summary report
// @route   GET /api/staff/reports/summary
// @access  Private (admin only)
router.get('/reports/summary', getStaffSummary);

module.exports = router;