const https = require('https');
const fs = require('fs');
const path = require('path');

const images = [
  // Burgers
  { name: 'beef-burger.jpg', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400' },
  { name: 'cheese-burger.jpg', url: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=400' },
  { name: 'chicken-burger.jpg', url: 'https://images.unsplash.com/photo-1606755962773-d324e9a3e4d8?w=400' },
  { name: 'sewrica-burger.jpg', url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400' },
  
  // Sandwiches
  { name: 'chicken-sandwich.jpg', url: 'https://images.unsplash.com/photo-1606755962773-d324e9a3e4d8?w=400' },
  { name: 'club-sandwich.jpg', url: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=400' },
  
  // Pizza
  { name: 'margherita-pizza.jpg', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400' },
  { name: 'pepperoni-pizza.jpg', url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400' },
  { name: 'sewrica-pizza.jpg', url: 'https://images.unsplash.com/photo-1593504049359-74330189a345?w=400' },
  { name: 'veg-pizza.jpg', url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400' },
  
  // Traditional Ethiopian
  { name: 'beyaynet.jpg', url: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400' },
  { name: 'doro-wat.jpg', url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400' },
  { name: 'kitfo.jpg', url: 'https://images.unsplash.com/photo-1603899122634-f086ca5f5ddd?w=400' },
  { name: 'tibs.jpg', url: 'https://images.unsplash.com/photo-1603899122634-f086ca5f5ddd?w=400' },
  { name: 'shiro-wat.jpg', url: 'https://images.unsplash.com/photo-1543353071-8735f4c8f5c3?w=400' },
  
  // Wraps
  { name: 'special-wrap.jpg', url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400' },
  
  // Fetira
  { name: 'chechebsa-egg.jpg', url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400' },
  { name: 'chechebsa.jpg', url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400' },
  { name: 'fetira.jpg', url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400' }
];

const downloadImage = (url, filename) => {
  return new Promise((resolve, reject) => {
    const uploadsDir = path.join(__dirname, '../uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filepath = path.join(uploadsDir, filename);
    
    // Check if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`⏭️  Already exists: ${filename}`);
      resolve();
      return;
    }
    
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${filename}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      console.error(`❌ Failed to download ${filename}:`, err.message);
      reject(err);
    });
  });
};

async function downloadAllImages() {
  console.log('📥 Downloading images to uploads folder...');
  console.log('This may take a moment...\n');
  
  // Focus on the missing images first
  const missingImages = [
    'chicken-burger.jpg',
    'chicken-sandwich.jpg',
    'shiro-wat.jpg'
  ];
  
  console.log('🎯 Priority: Downloading missing images for:');
  missingImages.forEach(img => console.log(`   - ${img}`));
  console.log('');
  
  let success = 0;
  let failed = 0;
  
  for (const image of images) {
    try {
      await downloadImage(image.url, image.name);
      success++;
    } catch (error) {
      failed++;
    }
  }
  
  console.log('\n📊 Download Summary:');
  console.log(`✅ Successfully downloaded: ${success} images`);
  console.log(`❌ Failed to download: ${failed} images`);
  console.log(`📁 Images saved to: C:\\kkkkk\\Sewrica\\sewrica-cafe-backend\\uploads\\`);
  
  // Verify specific files
  console.log('\n🔍 Verifying specific files:');
  const uploadsDir = path.join(__dirname, '../uploads');
  
  const checkFile = (filename) => {
    const filepath = path.join(uploadsDir, filename);
    const exists = fs.existsSync(filepath);
    console.log(`   ${filename}: ${exists ? '✅ Found' : '❌ Missing'}`);
    return exists;
  };
  
  checkFile('chicken-burger.jpg');
  checkFile('chicken-sandwich.jpg');
  checkFile('shiro-wat.jpg');
}

downloadAllImages();