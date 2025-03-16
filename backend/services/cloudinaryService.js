require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Configure Cloudinary with credentials from environment variables
console.log('Configuring Cloudinary with:');
console.log(`- Cloud name: ${process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET'}`);
console.log(`- API key: ${process.env.CLOUDINARY_API_KEY ? 'SET (value hidden)' : 'NOT SET'}`);
console.log(`- API secret: ${process.env.CLOUDINARY_API_SECRET ? 'SET (value hidden)' : 'NOT SET'}`);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dciln75i0',
  api_key: process.env.CLOUDINARY_API_KEY || '646273781249237',
  api_secret: process.env.CLOUDINARY_API_SECRET || '1JCGYGxjRYtQla8--jcu-pRhGB0',
  secure: true
});

// Create storage engine for Multer that stores files in Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pdfspark',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
    transformation: [{ quality: 'auto' }],
    resource_type: 'auto' // Allow different file types
  }
});

// Configure multer upload with the Cloudinary storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check allowed file types
    const filetypes = /jpeg|jpg|png|gif|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Error: File upload only supports the following filetypes - ${filetypes}`));
  }
});

/**
 * Upload a file to Cloudinary
 * @param {Object} fileData - The file data object
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Cloudinary response
 */
const uploadFile = async (fileData, options = {}) => {
  try {
    console.log('Starting Cloudinary upload with file:', {
      path: fileData.path,
      exists: fileData.path ? require('fs').existsSync(fileData.path) : false,
      size: fileData.path ? require('fs').statSync(fileData.path).size : 'unknown'
    });
    
    const uploadOptions = {
      folder: options.folder || 'pdfspark',
      resource_type: 'auto',
      ...options
    };

    if (options.tags && Array.isArray(options.tags)) {
      uploadOptions.tags = options.tags;
    }
    
    console.log('Cloudinary upload options:', JSON.stringify(uploadOptions));

    const result = await cloudinary.uploader.upload(fileData.path, uploadOptions);
    console.log('Cloudinary upload successful, result:', {
      public_id: result.public_id,
      url: result.url ? 'generated' : 'missing',
      secure_url: result.secure_url ? 'generated' : 'missing',
      format: result.format,
      resource_type: result.resource_type
    });
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<Object>} - Cloudinary response
 */
const deleteFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete file from Cloudinary');
  }
};

/**
 * Generate a signed upload URL for client-side uploads
 * @param {Object} options - The options for the upload
 * @returns {Object} - Signed upload credentials
 */
const generateSignature = (options = {}) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const params = {
      timestamp,
      folder: options.folder || 'pdfspark',
    };
    
    if (options.tags && Array.isArray(options.tags)) {
      params.tags = options.tags.join(',');
    }

    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
    
    return {
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: params.folder,
      tags: options.tags
    };
  } catch (error) {
    console.error('Cloudinary signature generation error:', error);
    throw new Error('Failed to generate upload signature');
  }
};

module.exports = {
  cloudinary,
  upload,
  uploadFile,
  deleteFile,
  generateSignature
};