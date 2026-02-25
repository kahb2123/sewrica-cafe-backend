const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');

// ============================================
// HELPER FUNCTION TO GET SCHEMA INFO
// ============================================
router.get('/debug-schema', async (req, res) => {
  try {
    // Get schema information
    const schemaPaths = MenuItem.schema.paths;
    const schemaObj = {};
    
    Object.keys(schemaPaths).forEach(key => {
      const path = schemaPaths[key];
      schemaObj[key] = {
        type: path.instance,
        required: path.isRequired || false,
        enum: path.enumValues || null,
        default: path.defaultValue
      };
    });
    
    res.json({
      success: true,
      schema: schemaObj,
      collectionName: MenuItem.collection.name
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CREATE TEST MENU ITEMS (AUTO-DETECTS SCHEMA)
// ============================================
router.get('/create-test-menu', async (req, res) => {
  try {
    console.log('🔧 Creating test menu items...');
    
    // Get schema info to know what fields are required
    const schemaPaths = MenuItem.schema.paths;
    const requiredFields = [];
    const enumFields = {};
    
    Object.keys(schemaPaths).forEach(key => {
      const path = schemaPaths[key];
      if (path.isRequired) {
        requiredFields.push(key);
      }
      if (path.enumValues && path.enumValues.length > 0) {
        enumFields[key] = path.enumValues;
      }
    });
    
    console.log('Required fields:', requiredFields);
    console.log('Enum fields:', enumFields);
    
    // Determine category enum values
    let categoryValues = ['burgers', 'sandwiches', 'fastfood', 'pizza', 'wraps', 'fetira', 'traditional', 'beverages', 'desserts'];
    if (enumFields.category && enumFields.category.length > 0) {
      categoryValues = enumFields.category;
    }
    
    // Base menu item template
    const baseItem = {
      name: 'Sample Item',
      price: 100,
      isAvailable: true
    };
    
    // Add required fields with sensible defaults
    const testItems = [];
    
    // Item 1: Cheese Burger
    const item1 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item1.name = 'Cheese Burger';
      else if (field === 'nameAm') item1.nameAm = 'ቺዝ በርገር';
      else if (field === 'description') item1.description = 'Delicious beef patty with melted cheese, lettuce, and tomato';
      else if (field === 'fullDescription') item1.fullDescription = 'A juicy beef patty topped with melted cheddar cheese, fresh lettuce, ripe tomatoes, and our special sauce, served in a toasted brioche bun with a side of crispy fries.';
      else if (field === 'price') item1.price = 250;
      else if (field === 'category') item1.category = 'burgers';
      else if (field === 'image') item1.image = '/uploads/cheese-burger.jpg';
      else if (!item1[field]) item1[field] = '';
    });
    testItems.push(item1);
    
    // Item 2: Doro Wat
    const item2 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item2.name = 'Doro Wat';
      else if (field === 'nameAm') item2.nameAm = 'ዶሮ ወጥ';
      else if (field === 'description') item2.description = 'Spicy Ethiopian chicken stew with hard-boiled eggs';
      else if (field === 'fullDescription') item2.fullDescription = 'Traditional Ethiopian chicken stew simmered with berbere spice, onions, garlic, and ginger for hours until tender, served with a hard-boiled egg and injera.';
      else if (field === 'price') item2.price = 280;
      else if (field === 'category') item2.category = 'traditional';
      else if (field === 'image') item2.image = '/uploads/doro-wat.jpg';
      else if (!item2[field]) item2[field] = '';
    });
    testItems.push(item2);
    
    // Item 3: Kitfo
    const item3 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item3.name = 'Kitfo';
      else if (field === 'nameAm') item3.nameAm = 'ክትፎ';
      else if (field === 'description') item3.description = 'Ethiopian minced raw beef with spices and clarified butter';
      else if (field === 'fullDescription') item3.fullDescription = 'Finely minced raw beef seasoned with mitmita spice and niter kibbeh (clarified butter), served with ayib (cottage cheese) and injera. Can be cooked lightly upon request.';
      else if (field === 'price') item3.price = 320;
      else if (field === 'category') item3.category = 'traditional';
      else if (field === 'image') item3.image = '/uploads/kitfo.jpg';
      else if (!item3[field]) item3[field] = '';
    });
    testItems.push(item3);
    
    // Item 4: Shiro Wat
    const item4 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item4.name = 'Shiro Wat';
      else if (field === 'nameAm') item4.nameAm = 'ሽሮ ወጥ';
      else if (field === 'description') item4.description = 'Ethiopian chickpea stew with berbere spice';
      else if (field === 'fullDescription') item4.fullDescription = 'Smooth and flavorful chickpea stew simmered with berbere spice, garlic, and onions until thick and aromatic, served with injera.';
      else if (field === 'price') item4.price = 180;
      else if (field === 'category') item4.category = 'traditional';
      else if (field === 'image') item4.image = '/uploads/shiro-wat.jpg';
      else if (!item4[field]) item4[field] = '';
    });
    testItems.push(item4);
    
    // Item 5: Tibs
    const item5 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item5.name = 'Tibs';
      else if (field === 'nameAm') item5.nameAm = 'ጥብስ';
      else if (field === 'description') item5.description = 'Sautéed meat with onions, peppers, and rosemary';
      else if (field === 'fullDescription') item5.fullDescription = 'Tender cubes of beef or lamb sautéed with onions, jalapeños, tomatoes, and rosemary in niter kibbeh, served with injera.';
      else if (field === 'price') item5.price = 290;
      else if (field === 'category') item5.category = 'traditional';
      else if (field === 'image') item5.image = '/uploads/tibs.jpg';
      else if (!item5[field]) item5[field] = '';
    });
    testItems.push(item5);
    
    // Item 6: Sambusa
    const item6 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item6.name = 'Sambusa';
      else if (field === 'nameAm') item6.nameAm = 'ሳምቡሳ';
      else if (field === 'description') item6.description = 'Fried pastry filled with lentils or meat';
      else if (field === 'fullDescription') item6.fullDescription = 'Crispy triangular pastries filled with spiced lentils, onions, and green peppers, served with a side of tangy sauce.';
      else if (field === 'price') item6.price = 80;
      else if (field === 'category') item6.category = 'sandwiches';
      else if (field === 'image') item6.image = '/uploads/sambusa.jpg';
      else if (!item6[field]) item6[field] = '';
    });
    testItems.push(item6);
    
    // Item 7: Ethiopian Coffee
    const item7 = { ...baseItem };
    requiredFields.forEach(field => {
      if (field === 'name') item7.name = 'Ethiopian Coffee';
      else if (field === 'nameAm') item7.nameAm = 'ቡና';
      else if (field === 'description') item7.description = 'Traditional coffee ceremony style';
      else if (field === 'fullDescription') item7.fullDescription = 'Freshly roasted and brewed Ethiopian coffee served in a jebena (clay pot) with the traditional coffee ceremony, accompanied by popcorn or traditional bread.';
      else if (field === 'price') item7.price = 50;
      else if (field === 'category') item7.category = 'beverages';
      else if (field === 'image') item7.image = '/uploads/coffee.jpg';
      else if (!item7[field]) item7[field] = '';
    });
    testItems.push(item7);
    
    // Clear existing items
    await MenuItem.deleteMany({});
    console.log('✅ Cleared existing menu items');
    
    // Create new menu items
    const created = await MenuItem.insertMany(testItems);
    console.log(`✅ Created ${created.length} test menu items`);
    
    res.json({
      success: true,
      message: 'Test menu items created successfully',
      count: created.length,
      requiredFields: requiredFields,
      categoryEnum: enumFields.category || 'Using defaults',
      items: created.map(item => ({
        id: item._id,
        name: item.name,
        category: item.category,
        price: item.price
      }))
    });
  } catch (error) {
    console.error('❌ Create test menu error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating menu items',
      error: error.message,
      errors: error.errors || 'Unknown error'
    });
  }
});

// ============================================
// FIX CATEGORIES ROUTE
// ============================================
router.get('/fix-categories', async (req, res) => {
  try {
    console.log('🔧 Fixing menu item categories...');
    
    // Update items with correct categories
    await MenuItem.updateOne({ name: 'Cheese Burger' }, { category: 'burgers' });
    await MenuItem.updateOne({ name: 'Doro Wat' }, { category: 'traditional' });
    await MenuItem.updateOne({ name: 'Kitfo' }, { category: 'traditional' });
    await MenuItem.updateOne({ name: 'Shiro Wat' }, { category: 'traditional' });
    await MenuItem.updateOne({ name: 'Tibs' }, { category: 'traditional' });
    await MenuItem.updateOne({ name: 'Sambusa' }, { category: 'sandwiches' });
    await MenuItem.updateOne({ name: 'Ethiopian Coffee' }, { category: 'beverages' });
    
    // Get all items to confirm
    const items = await MenuItem.find();
    
    console.log('✅ Categories fixed!');
    res.json({ 
      success: true, 
      message: 'Categories fixed successfully!',
      items: items.map(item => ({
        name: item.name,
        category: item.category
      }))
    });
  } catch (error) {
    console.error('❌ Fix categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SIMPLE ROUTE - CREATE JUST ONE ITEM
// ============================================
router.get('/create-one-item', async (req, res) => {
  try {
    // Get schema info
    const schemaPaths = MenuItem.schema.paths;
    const item = {};
    
    // Set sensible defaults based on schema
    Object.keys(schemaPaths).forEach(key => {
      const path = schemaPaths[key];
      if (key === '_id' || key === '__v') return;
      
      if (key === 'name') item.name = 'Test Item';
      else if (key === 'nameAm') item.nameAm = 'የሙከራ ምግብ';
      else if (key === 'description') item.description = 'This is a test menu item';
      else if (key === 'fullDescription') item.fullDescription = 'This is a longer description for testing purposes.';
      else if (key === 'price') item.price = 199;
      else if (key === 'category') {
        if (path.enumValues && path.enumValues.length > 0) {
          item.category = path.enumValues[0];
        } else {
          item.category = 'burgers';
        }
      }
      else if (key === 'image') item.image = '/uploads/test.jpg';
      else if (key === 'available') item.available = true;
      else if (path.isRequired) {
        // For any other required field, set a default
        if (path.instance === 'String') item[key] = 'Default ' + key;
        else if (path.instance === 'Number') item[key] = 0;
        else if (path.instance === 'Boolean') item[key] = true;
        else if (path.instance === 'Date') item[key] = new Date();
        else item[key] = null;
      }
    });
    
    // Clear existing and create one item
    await MenuItem.deleteMany({});
    const created = await MenuItem.create(item);
    
    res.json({
      success: true,
      message: 'Created one test item',
      item: created
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      errors: error.errors
    });
  }
});

// ============================================
// ADMIN USER ROUTES
// ============================================
router.get('/create-admin', async (req, res) => {
  try {
    console.log('🔧 Creating admin user...');
    
    const existingAdmin = await User.findOne({ email: 'admin@sewrica.com' });
    
    if (existingAdmin) {
      return res.json({ 
        message: 'ℹ️ Admin already exists', 
        admin: {
          email: existingAdmin.email,
          role: existingAdmin.role
        }
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const admin = new User({
      name: 'Admin User',
      email: 'admin@sewrica.com',
      password: hashedPassword,
      role: 'admin',
      phone: '0912345678',
      createdAt: new Date()
    });

    await admin.save();
    
    res.json({ 
      message: '✅ Admin created successfully', 
      login: {
        email: 'admin@sewrica.com',
        password: 'admin123'
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/fix-admin', async (req, res) => {
  try {
    const admin = await User.findOne({ email: 'admin@sewrica.com' });
    
    if (!admin) {
      return res.json({ message: '❌ Admin user not found' });
    }
    
    const oldRole = admin.role;
    admin.role = 'admin';
    await admin.save();
    
    res.json({ 
      message: '✅ Admin role fixed', 
      user: {
        email: admin.email,
        oldRole: oldRole,
        newRole: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;