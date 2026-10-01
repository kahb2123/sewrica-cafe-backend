const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password manually (no middleware)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword, // Store hashed password
      phone
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token: generateToken(user._id)
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email (include password field)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password using bcrypt
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const { getPermissionsForRole, getPageAccessForRole, roleHierarchy, PERMISSIONS, PAGE_ACCESS, rolePermissions } = require('../config/roleMap');

const getUserPermissions = (req, res) => {  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const permissions = getPermissionsForRole(user.role);
  const pageAccess = getPageAccessForRole(user.role);

  res.json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
    },
    permissions,
    pageAccess,
    roleHierarchy,
    PAGE_ACCESS,
    PERMISSIONS,
  });
};

const getRoleMap = (req, res) => {
  const roles = Object.keys(rolePermissions).map((role) => ({
    role,
    label: role.charAt(0).toUpperCase() + role.slice(1),
    level: roleHierarchy[role] ?? 0,
    permissions: rolePermissions[role],
    pageAccess: getPageAccessForRole(role),
    activeStaffCount: 0,
  }));

  res.json({
    success: true,
    roleHierarchy,
    permissions: PERMISSIONS,
    pageAccess: PAGE_ACCESS,
    roles,
  });
};

const updatePageAccess = (req, res) => {
  const { role, page, action } = req.body;

  if (!role || !page || !action) {
    return res.status(400).json({ message: 'role, page, and action are required (action: "grant"|"revoke")' });
  }

  if (!PAGE_ACCESS[page]) {
    return res.status(404).json({ message: `Page '${page}' not found in PAGE_ACCESS` });
  }

  if (!PAGE_ACCESS[page].read) PAGE_ACCESS[page].read = [];
  if (!PAGE_ACCESS[page].write) PAGE_ACCESS[page].write = [];

  const readSet = new Set(PAGE_ACCESS[page].read);
  const writeSet = new Set(PAGE_ACCESS[page].write);

  if (action === 'grant') {
    readSet.add(role);
    writeSet.add(role);
  } else if (action === 'revoke') {
    readSet.delete(role);
    writeSet.delete(role);
  } else if (action === 'grant_read') {
    readSet.add(role);
  } else if (action === 'revoke_read') {
    readSet.delete(role);
  } else if (action === 'grant_write') {
    writeSet.add(role);
  } else if (action === 'revoke_write') {
    writeSet.delete(role);
  } else {
    return res.status(400).json({ message: 'Invalid action. Use: grant, revoke, grant_read, revoke_read, grant_write, revoke_write' });
  }

  PAGE_ACCESS[page].read = [...readSet];
  PAGE_ACCESS[page].write = [...writeSet];

  res.json({
    success: true,
    message: `Page access updated for role '${role}' on page '${page}'`,
    pageAccess: PAGE_ACCESS[page],
  });
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  getUserPermissions,
  getRoleMap,
  updatePageAccess,
};