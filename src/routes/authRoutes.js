const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getUserProfile,
  getUserPermissions,
  getRoleMap,
  updatePageAccess,
  getUserPermissionOverrides,
  updateUserPermissions,
  updateUserPageAccess
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole, requirePermission } = require('../middleware/roleMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);

router.get('/profile', protect, getUserProfile);
router.get('/permissions', protect, getUserPermissions);
router.get('/roles', protect, requireRole('admin'), getRoleMap);
router.put('/roles/page-access', protect, requireRole('admin'), updatePageAccess);

router.get('/staff/:userId/permissions', protect, requireRole('admin'), getUserPermissionOverrides);
router.put('/staff/:userId/permissions', protect, requireRole('admin'), updateUserPermissions);
router.put('/staff/:userId/page-access', protect, requireRole('admin'), updateUserPageAccess);

module.exports = router;