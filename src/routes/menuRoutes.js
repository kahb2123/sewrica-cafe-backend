const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  getAllMenuItems,
  getMenuItemById,
  getMenuItemsByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  getAllCategories
} = require('../controllers/menuController');

// Public routes (no authentication required)
// GET /api/menu - Get all menu items with optional filters
router.get('/', getAllMenuItems);

// GET /api/menu/categories - Get all unique categories
router.get('/categories', getAllCategories);

// GET /api/menu/category/:category - Get items by specific category
router.get('/category/:category', getMenuItemsByCategory);

// GET /api/menu/:id - Get single menu item by ID
router.get('/:id', getMenuItemById);

// Admin only routes (require authentication and admin role)
// POST /api/menu - Create new menu item
router.post(
  '/',
  protect,
  authorize('admin'),
  upload.single('image'),
  createMenuItem
);

// PUT /api/menu/:id - Update menu item
router.put(
  '/:id',
  protect,
  authorize('admin'),
  upload.single('image'),
  updateMenuItem
);

// DELETE /api/menu/:id - Delete menu item
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  deleteMenuItem
);

// PATCH /api/menu/:id/toggle - Toggle availability (in stock/out of stock)
router.patch(
  '/:id/toggle',
  protect,
  authorize('admin'),
  toggleAvailability
);

module.exports = router;