const mongoose = require('mongoose');
const dotenv = require('dotenv');
const MenuItem = require('../models/MenuItem');

dotenv.config();

const menuItems = [
  // BURGERS (4 items)
  {
    name: 'Beef Burger',
    nameAm: 'በፍ በርግር',
    description: 'Classic beef patty with fresh lettuce, tomato, and special sauce',
    fullDescription: 'Our classic beef burger features a 100% pure beef patty grilled to perfection, topped with fresh lettuce, tomato, onion, pickles, and our special sauce, all served in a toasted brioche bun.',
    price: 380,
    category: 'burgers',
    image: 'beef-burger.jpg',
    rating: 4.5,
    spiceLevel: '🌶️',
    prepTime: '15 min',
    calories: '650 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Beef patty', 'Brioche bun', 'Lettuce', 'Tomato', 'Onion', 'Pickles', 'Special sauce']
  },
  {
    name: 'Cheese Burger',
    nameAm: 'ችዝ በርግር',
    description: 'Beef patty with melted cheddar cheese',
    fullDescription: 'Our classic beef burger with a generous slice of melted cheddar cheese for extra richness and flavor.',
    price: 450,
    category: 'burgers',
    image: 'cheese-burger.jpg',
    rating: 4.7,
    spiceLevel: '🌶️',
    prepTime: '15 min',
    calories: '720 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Beef patty', 'Brioche bun', 'Cheddar cheese', 'Lettuce', 'Tomato', 'Onion', 'Pickles']
  },
  {
    name: 'Chicken Burger',
    nameAm: 'ዶሮ በርግር',
    description: 'Crispy chicken fillet with mayo and lettuce',
    fullDescription: 'Crispy chicken fillet seasoned with our special blend of herbs and spices, topped with fresh lettuce, tomato, and mayo.',
    price: 650,
    category: 'burgers',
    image: 'chicken-burger.jpg',
    rating: 4.6,
    spiceLevel: '🌶️🌶️',
    prepTime: '18 min',
    calories: '580 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Chicken fillet', 'Sesame bun', 'Lettuce', 'Tomato', 'Mayonnaise']
  },
  {
    name: 'Sewrica Burger',
    nameAm: 'ሰውሪካ በርግር',
    description: 'Our signature burger with double patty and special sauce',
    fullDescription: 'Our signature creation! A double beef patty with melted cheese, crispy bacon, caramelized onions, mushrooms, lettuce, tomato, and our secret Sewrica sauce.',
    price: 680,
    category: 'burgers',
    image: 'sewrica-burger.jpg',
    rating: 4.9,
    spiceLevel: '🌶️🌶️',
    prepTime: '20 min',
    calories: '950 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: true,
    ingredients: ['Double beef patty', 'Brioche bun', 'Cheddar cheese', 'Bacon', 'Caramelized onions', 'Mushrooms', 'Lettuce', 'Tomato', 'Sewrica sauce']
  },

  // SANDWICHES (2 items)
  {
    name: 'Chicken Sandwich',
    nameAm: 'ዶሮ ሳንድዊች',
    description: 'Grilled chicken breast with fresh vegetables',
    fullDescription: 'Grilled chicken breast marinated in herbs and spices, served on artisan bread with fresh lettuce, tomato, and our signature aioli sauce.',
    price: 450,
    category: 'sandwiches',
    image: 'chicken-sandwich.jpg',
    rating: 4.4,
    spiceLevel: '🌶️',
    prepTime: '12 min',
    calories: '520 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Grilled chicken', 'Artisan bread', 'Lettuce', 'Tomato', 'Aioli sauce']
  },
  {
    name: 'Club Sandwich',
    nameAm: 'ክለብ ሳንድዊች',
    description: 'Triple-decker sandwich with turkey and bacon',
    fullDescription: 'A classic triple-decker sandwich with toasted bread layers filled with sliced turkey, crispy bacon, fresh lettuce, ripe tomato, and mayonnaise.',
    price: 385,
    category: 'sandwiches',
    image: 'club-sandwich.jpg',
    rating: 4.5,
    spiceLevel: '🌶️',
    prepTime: '15 min',
    calories: '680 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Turkey', 'Bacon', 'Toasted bread', 'Lettuce', 'Tomato', 'Mayonnaise']
  },

  // PIZZA (4 items)
  {
    name: 'Margherita Pizza',
    nameAm: 'ማርጋሪታ ፒዛ',
    description: 'Classic pizza with tomato sauce and mozzarella',
    fullDescription: 'A classic Margherita pizza with our homemade tomato sauce, fresh mozzarella, and basil leaves.',
    price: 450,
    category: 'pizza',
    image: 'margherita-pizza.jpg',
    rating: 4.5,
    spiceLevel: '🌶️',
    prepTime: '18 min',
    calories: '780 kcal',
    isVegetarian: true,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Pizza dough', 'Tomato sauce', 'Mozzarella', 'Basil']
  },
  {
    name: 'Pepperoni Pizza',
    nameAm: 'ፔፐሮኒ ፒዛ',
    description: 'Spicy pepperoni with mozzarella',
    fullDescription: 'A crowd favorite topped with spicy pepperoni, mozzarella cheese, and our signature tomato sauce.',
    price: 520,
    category: 'pizza',
    image: 'pepperoni-pizza.jpg',
    rating: 4.7,
    spiceLevel: '🌶️🌶️',
    prepTime: '20 min',
    calories: '850 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Pizza dough', 'Tomato sauce', 'Mozzarella', 'Pepperoni']
  },
  {
    name: 'Sewrica Pizza',
    nameAm: 'ሰውሪካ ፒዛ',
    description: 'Signature pizza with premium toppings',
    fullDescription: 'Our masterpiece pizza! Topped with our signature Sewrica sauce, mozzarella, pepperoni, mushrooms, bell peppers, onions, olives, and Italian herbs.',
    price: 625,
    category: 'pizza',
    image: 'sewrica-pizza.jpg',
    rating: 4.9,
    spiceLevel: '🌶️🌶️',
    prepTime: '22 min',
    calories: '980 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: true,
    ingredients: ['Pizza dough', 'Sewrica sauce', 'Mozzarella', 'Pepperoni', 'Mushrooms', 'Bell peppers', 'Onions', 'Olives', 'Italian herbs']
  },
  {
    name: 'Vegetable Pizza',
    nameAm: 'አትክልት ፒዛ',
    description: 'Fresh vegetable pizza with mozzarella',
    fullDescription: 'A colorful medley of fresh vegetables including bell peppers, mushrooms, onions, olives, tomatoes, and spinach, all on a bed of mozzarella.',
    price: 430,
    category: 'pizza',
    image: 'veg-pizza.jpg',
    rating: 4.4,
    spiceLevel: '🌶️',
    prepTime: '18 min',
    calories: '620 kcal',
    isVegetarian: true,
    isSpicy: false,
    isPopular: false,
    isSignature: false,
    ingredients: ['Pizza dough', 'Tomato sauce', 'Mozzarella', 'Bell peppers', 'Mushrooms', 'Onions', 'Olives', 'Tomatoes', 'Spinach']
  },

  // TRADITIONAL ETHIOPIAN (5 items)
  {
    name: 'Beyaynet',
    nameAm: 'በያይነት',
    description: 'Combination of various vegetable stews on injera',
    fullDescription: 'A traditional Ethiopian vegetarian platter featuring lentil stew (misir wot), split pea stew (kik alicha), cabbage and carrots (tikil gomen), and salad, served on injera.',
    price: 250,
    category: 'traditional',
    image: 'beyaynet.jpg',
    rating: 4.8,
    spiceLevel: '🌶️🌶️',
    prepTime: '15 min',
    calories: '450 kcal',
    isVegetarian: true,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Injera', 'Misir wot (lentils)', 'Kik alicha (split peas)', 'Tikil gomen (cabbage)', 'Salad']
  },
  {
    name: 'Doro Wat',
    nameAm: 'ዶሮ ወጥ',
    description: 'Spicy chicken stew with hard-boiled eggs',
    fullDescription: 'A classic Ethiopian chicken stew simmered with berbere spice, served with a hard-boiled egg and injera.',
    price: 350,
    category: 'traditional',
    image: 'doro-wat.jpg',
    rating: 4.9,
    spiceLevel: '🌶️🌶️🌶️',
    prepTime: '25 min',
    calories: '520 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: true,
    ingredients: ['Chicken', 'Berbere spice', 'Onions', 'Garlic', 'Ginger', 'Hard-boiled egg', 'Injera']
  },
  {
    name: 'Kitfo',
    nameAm: 'ክትፎ',
    description: 'Minced raw beef seasoned with mitmita',
    fullDescription: 'Traditional Ethiopian dish of minced raw beef mixed with mitmita and niter kibbeh, served with cottage cheese and injera.',
    price: 420,
    category: 'traditional',
    image: 'kitfo.jpg',
    rating: 4.7,
    spiceLevel: '🌶️🌶️🌶️',
    prepTime: '15 min',
    calories: '580 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Minced beef', 'Mitmita', 'Niter kibbeh', 'Cottage cheese', 'Injera']
  },
  {
    name: 'Tibs',
    nameAm: 'ጥብስ',
    description: 'Sautéed meat with onions and peppers',
    fullDescription: 'Sautéed beef or lamb with onions, peppers, and rosemary, served with injera.',
    price: 380,
    category: 'traditional',
    image: 'tibs.jpg',
    rating: 4.6,
    spiceLevel: '🌶️🌶️',
    prepTime: '20 min',
    calories: '490 kcal',
    isVegetarian: false,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Beef or lamb', 'Onions', 'Peppers', 'Rosemary', 'Injera']
  },
  {
    name: 'Shiro Wat',
    nameAm: 'ሽሮ ወጥ',
    description: 'Chickpea stew with berbere spice',
    fullDescription: 'A thick and savory Ethiopian stew made from ground chickpeas, slow-cooked with onions, garlic, and berbere spice.',
    price: 160,
    category: 'traditional',
    image: 'shiro-wat.jpg',
    rating: 4.6,
    spiceLevel: '🌶️🌶️',
    prepTime: '15 min',
    calories: '280 kcal',
    isVegetarian: true,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Chickpea powder', 'Onions', 'Garlic', 'Berbere spice', 'Injera']
  },

  // WRAPS (1 item)
  {
    name: 'Special Wrap',
    nameAm: 'ልዩ ራፕ',
    description: 'Wrap filled with meat, fries, and cheese',
    fullDescription: 'A generous flour tortilla filled with grilled chicken or beef, crispy french fries, scrambled egg, melted cheese, fresh lettuce, and our special sauce.',
    price: 330,
    category: 'wraps',
    image: 'special-wrap.jpg',
    rating: 4.5,
    spiceLevel: '🌶️',
    prepTime: '12 min',
    calories: '580 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Flour tortilla', 'Grilled chicken or beef', 'French fries', 'Scrambled egg', 'Cheddar cheese', 'Lettuce', 'Special sauce']
  },

  // FETIRA (3 items)
  {
    name: 'Chechebsa with Egg',
    nameAm: 'በለጠ ከእንቁላል ጋር',
    description: 'Traditional fried flatbread with egg and honey',
    fullDescription: 'Traditional Ethiopian fried flatbread (kita) mixed with clarified butter and spices, topped with a fried egg and served with honey.',
    price: 280,
    category: 'fetira',
    image: 'chechebsa-egg.jpg',
    rating: 4.7,
    spiceLevel: '🌶️',
    prepTime: '10 min',
    calories: '420 kcal',
    isVegetarian: false,
    isSpicy: false,
    isPopular: true,
    isSignature: false,
    ingredients: ['Kita (flatbread)', 'Niter kibbeh', 'Egg', 'Honey']
  },
  {
    name: 'Chechebsa',
    nameAm: 'በለጠ',
    description: 'Traditional fried flatbread with honey',
    fullDescription: 'Traditional Ethiopian breakfast dish made from shredded flatbread sautéed with niter kibbeh and berbere spice, served with honey.',
    price: 220,
    category: 'fetira',
    image: 'chechebsa.jpg',
    rating: 4.6,
    spiceLevel: '🌶️',
    prepTime: '8 min',
    calories: '350 kcal',
    isVegetarian: true,
    isSpicy: true,
    isPopular: true,
    isSignature: false,
    ingredients: ['Kita (flatbread)', 'Niter kibbeh', 'Berbere spice', 'Honey']
  },
  {
    name: 'Fetira',
    nameAm: 'ፈጢራ',
    description: 'Ethiopian layered flatbread',
    fullDescription: 'A delicious Ethiopian layered flatbread, served with honey, butter, or your choice of toppings.',
    price: 220,
    category: 'fetira',
    image: 'fetira.jpg',
    rating: 4.5,
    spiceLevel: '🌶️',
    prepTime: '8 min',
    calories: '300 kcal',
    isVegetarian: true,
    isSpicy: false,
    isPopular: false,
    isSignature: false,
    ingredients: ['Flour', 'Eggs', 'Milk', 'Butter', 'Honey']
  }
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing menu items
    await MenuItem.deleteMany({});
    console.log('🗑️ Cleared existing menu items');

    // Insert new menu items
    const result = await MenuItem.insertMany(menuItems);
    console.log(`✅ Added ${result.length} menu items`);

    // Show categories added
    const categories = [...new Set(result.map(item => item.category))];
    console.log('📊 Categories:', categories);
    
    // Show count per category
    console.log('\n📈 Items per category:');
    categories.forEach(cat => {
      const count = result.filter(item => item.category === cat).length;
      console.log(`   ${cat}: ${count} items`);
    });

    console.log('\n🎉 Database seeded successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();