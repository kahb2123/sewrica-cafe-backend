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
    // Log incoming request info for debugging
    console.log('\n[createMenuItem] headers:', req.headers['content-type']);
    console.log('[createMenuItem] file:', !!req.file, req.file && req.file.filename);
    console.log('[createMenuItem] body keys:', Object.keys(req.body));

    let {
      name, nameAm, description, fullDescription, price,
      category, spiceLevel, prepTime, calories, isVegetarian,
      isSpicy, isPopular, isSignature, ingredients, greekText
    } = req.body;

    // Parse boolean values (they come as strings from FormData)
    const parseBoolean = (value) => {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return !!value;
    };

    // Provide server-side defaults if frontend didn't send them
    if (!nameAm || nameAm === '') nameAm = name || '';
    if (!fullDescription || fullDescription === '') fullDescription = description || '';

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
      console.log('✅ Image saved as:', imagePath);
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
      isVegetarian: parseBoolean(isVegetarian),
      isSpicy: parseBoolean(isSpicy),
      isPopular: parseBoolean(isPopular),
      isSignature: parseBoolean(isSignature),
      ingredients: ingredients ? (typeof ingredients === 'string' ? ingredients.split(',').map(i => i.trim()) : ingredients) : [],
      greekText: greekText || ''
    });

    console.log('✅ Menu item created with image:', menuItem.image);

    res.status(201).json({
      success: true,
      data: menuItem
    });
  } catch (error) {
    console.error('❌ Error creating menu item:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update menu item
// @route   PUT /api/menu/:id
// @access  Private/Admin
// const updateMenuItem = async (req, res) => {
//   try {
//     let menuItem = await MenuItem.findById(req.params.id);
    
//     if (!menuItem) {
//       return res.status(404).json({
//         success: false,
//         message: 'Menu item not found'
//       });
//     }

//     // Parse boolean values
//     const parseBoolean = (value) => {
//       if (value === 'true') return true;
//       if (value === 'false') return false;
//       return !!value;
//     };

//     // Handle image update
//     if (req.file) {
//       // Delete old image if not default
//       if (menuItem.image && menuItem.image !== 'default-food.jpg') {
//         const oldImagePath = path.join(__dirname, '../../uploads', menuItem.image);
//         if (fs.existsSync(oldImagePath)) {
//           fs.unlinkSync(oldImagePath);
//           console.log('✅ Deleted old image:', menuItem.image);
//         }
//       }
//       req.body.image = req.file.filename;
//       console.log('✅ Updated with new image:', req.file.filename);
//     }

//     // Parse ingredients if provided
//     if (req.body.ingredients) {
//       req.body.ingredients = typeof req.body.ingredients === 'string' 
//         ? req.body.ingredients.split(',').map(i => i.trim()) 
//         : req.body.ingredients;
//     }

//     // Parse boolean fields
//     ['isVegetarian', 'isSpicy', 'isPopular', 'isSignature', 'isAvailable'].forEach(field => {
//       if (req.body[field] !== undefined) {
//         req.body[field] = parseBoolean(req.body[field]);
//       }
//     });

//     // Parse price to number
//     if (req.body.price) {
//       req.body.price = Number(req.body.price);
//     }

//     menuItem = await MenuItem.findByIdAndUpdate(
//       req.params.id,
//       req.body,
//       { new: true, runValidators: true }
//     );

//     console.log('✅ Menu item updated, image:', menuItem.image);

//     res.json({
//       success: true,
//       data: menuItem
//     });
//   } catch (error) {
//     console.error('❌ Error updating menu item:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

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