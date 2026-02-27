const multer = require('multer');
const { storage } = require('../config/cloudinary'); // Import Cloudinary storage
const path = require('path');
const fs = require('fs');

// Note: We're keeping the uploads directory check for backward compatibility
// but new uploads will go to Cloudinary
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created uploads folder (for backward compatibility)');
}

// File filter (same as before)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp)'));
  }
};

// Create multer instance with Cloudinary storage
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Enhanced error handling middleware for single image upload
const uploadSingleImage = (fieldName = 'image') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    
    singleUpload(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred during upload
        console.error('❌ Multer upload error:', err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 5MB.'
          });
        }
        
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected field name. Expected: ' + fieldName
          });
        }
        
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      } else if (err) {
        // An unknown error occurred (like fileFilter rejection)
        console.error('❌ Unknown upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'Error uploading file'
        });
      }
      
      // Log successful upload
      if (req.file) {
        console.log('✅ File uploaded successfully:', {
          filename: req.file.filename,
          path: req.file.path,
          size: req.file.size,
          mimetype: req.file.mimetype
        });
      }
      
      // Everything went fine
      next();
    });
  };
};

// Enhanced error handling middleware for multiple image uploads (if needed)
const uploadMultipleImages = (fieldName = 'images', maxCount = 5) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    
    multipleUpload(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        console.error('❌ Multer upload error:', err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'One or more files are too large. Maximum size per file is 5MB.'
          });
        }
        
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `Too many files. Maximum allowed is ${maxCount}.`
          });
        }
        
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      } else if (err) {
        console.error('❌ Unknown upload error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'Error uploading files'
        });
      }
      
      // Log successful uploads
      if (req.files && req.files.length > 0) {
        console.log(`✅ ${req.files.length} files uploaded successfully`);
      }
      
      next();
    });
  };
};

// Export both the base upload and the enhanced middleware
module.exports = {
  upload, // Base multer instance (if needed)
  uploadSingleImage, // Enhanced middleware with error handling
  uploadMultipleImages // For multiple image uploads (if needed)
};