const MenuItem = require('../models/MenuItem');
const fs = require('fs');
const path = require('path');

// @desc    Get all menu items
// @route   GET /api/menu
// @access  Public
const getAllMenuItems = async (req, res) => {
  try {
    const { category, vegetarian, spicy, signature, minPrice, maxPrice } = req.query;
    
    // Build filter object
    let filter = {};
    
    if (category) {
      filter.category = category;
    }
    
    if (vegetarian === 'true') {
      filter.isVegetarian = true;
    }
    
    if (spicy === 'true') {
      filter.isSpicy = true;
    }
    
    if (signature === 'true') {
      filter.isSignature = true;
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    
    // Only show available items
    filter.isAvailable = true;
    
    const menuItems = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    
    res.json({
      success: true,
      count: menuItems.length,
      data: menuItems
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single menu item
// @route   GET /api/menu/:id
// @access  Public
const getMenuItemById = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }
    
    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get menu items by category
// @route   GET /api/menu/category/:category
// @access  Public
const getMenuItemsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    const menuItems = await MenuItem.find({ 
      category, 
      isAvailable: true 
    }).sort({ name: 1 });
    
    res.json({
      success: true,
      count: menuItems.length,
      data: menuItems
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create new menu item
// @route   POST /api/menu
// @access  Private/Admin
const createMenuItem = async (req, res) => {
  try {
    const { 
      name, nameAm, description, fullDescription, price, 
      category, spiceLevel, prepTime, calories, isVegetarian,
      isSpicy, isPopular, isSignature, ingredients, greekText
    } = req.body;

    // Check if item already exists
    const itemExists = await MenuItem.findOne({ name });
    if (itemExists) {
      return res.status(400).json({
        success: false,
        message: 'Menu item with this name already exists'
      });
    }

    // Handle image upload
    let imagePath = 'default-food.jpg';
    if (req.file) {
      imagePath = req.file.filename;
    }

    const menuItem = await MenuItem.create({
      name,
      nameAm,
      description,
      fullDescription,
      price: Number(price),
      category,
      image: imagePath,
      spiceLevel: spiceLevel || '🌶️',
      prepTime: prepTime || '15 min',
      calories: calories || '500 kcal',
      isVegetarian: isVegetarian === 'true',
      isSpicy: isSpicy === 'true',
      isPopular: isPopular === 'true',
      isSignature: isSignature === 'true',
      ingredients: ingredients ? ingredients.split(',').map(i => i.trim()) : [],
      greekText: greekText || ''
    });

    res.status(201).json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update menu item
// @route   PUT /api/menu/:id
// @access  Private/Admin
const updateMenuItem = async (req, res) => {
  try {
    let menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image if not default
      if (menuItem.image !== 'default-food.jpg') {
        const oldImagePath = path.join(__dirname, '../../uploads', menuItem.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      req.body.image = req.file.filename;
    }

    // Parse ingredients if provided
    if (req.body.ingredients) {
      req.body.ingredients = req.body.ingredients.split(',').map(i => i.trim());
    }

    // Parse boolean fields
    ['isVegetarian', 'isSpicy', 'isPopular', 'isSignature', 'isAvailable'].forEach(field => {
      if (req.body[field] !== undefined) {
        req.body[field] = req.body[field] === 'true';
      }
    });

    // Parse price to number
    if (req.body.price) {
      req.body.price = Number(req.body.price);
    }

    menuItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete menu item
// @route   DELETE /api/menu/:id
// @access  Private/Admin
const deleteMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    // Delete image file if not default
    if (menuItem.image !== 'default-food.jpg') {
      const imagePath = path.join(__dirname, '../../uploads', menuItem.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await menuItem.deleteOne();

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Toggle availability
// @route   PATCH /api/menu/:id/toggle
// @access  Private/Admin
const toggleAvailability = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    
    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    menuItem.isAvailable = !menuItem.isAvailable;
    await menuItem.save();

    res.json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all categories
// @route   GET /api/menu/categories/all
// @access  Public
const getAllCategories = async (req, res) => {
  try {
    const categories = await MenuItem.distinct('category', {}, { maxTimeMS: 30000 });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getAllMenuItems,
  getMenuItemById,
  getMenuItemsByCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  getAllCategories
};