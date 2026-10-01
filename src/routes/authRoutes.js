const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getUserProfile,
  getUserPermissions,
  getRoleMap,
  updatePageAccess
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole, requirePermission } = require('../middleware/roleMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);

router.get('/profile', protect, getUserProfile);
router.get('/permissions', protect, getUserPermissions);
router.get('/roles', protect, requireRole('admin'), getRoleMap);
router.put('/roles/page-access', protect, requireRole('admin'), updatePageAccess);

module.exports = router;