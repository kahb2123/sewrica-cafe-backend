const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: 'ddcgxk48k',
  api_key: '211161898447229',
  api_secret: '53vtHW61jBZMC4W_TVTS3NvK3sk'
});

// Verify connection
cloudinary.api.ping()
  .then(() => console.log('✅ Cloudinary connected successfully'))
  .catch(err => console.error('❌ Cloudinary connection error:', err));

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Generate a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    
    return {
      folder: 'sewrica-cafe/menu-items',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: `menu-${uniqueSuffix}`,
      transformation: [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    };
  }
});

module.exports = { cloudinary, storage };