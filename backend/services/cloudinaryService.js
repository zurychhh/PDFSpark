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

// Check if all required Cloudinary env vars are present
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('WARNING: Missing Cloudinary credentials. File uploads to Cloudinary will fail.');
  console.warn('Storage will fall back to local filesystem.');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
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
 * Check if Cloudinary is properly configured
 * @returns {boolean} - Whether Cloudinary is configured
 */
const isCloudinaryConfigured = () => {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && 
           process.env.CLOUDINARY_API_KEY && 
           process.env.CLOUDINARY_API_SECRET);
};

/**
 * Upload a file to Cloudinary
 * @param {Object} fileData - The file data object
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Cloudinary response or local file info object
 */
const uploadFile = async (fileData, options = {}) => {
  // If Cloudinary is not configured, return file info for local storage
  if (!isCloudinaryConfigured()) {
    console.log('Cloudinary not configured, skipping cloud upload');
    const fs = require('fs');
    const path = require('path');
    
    // Generate a local file info object that mimics Cloudinary response format
    const filename = path.basename(fileData.path);
    const fileInfo = {
      public_id: filename,
      url: `/api/files/original/${filename}`,
      secure_url: `/api/files/original/${filename}`,
      format: path.extname(filename).replace('.', ''),
      resource_type: 'raw',
      bytes: fs.statSync(fileData.path).size,
      created_at: new Date().toISOString(),
      original_filename: fileData.originalname || filename,
      _fromLocalStorage: true // Flag to indicate this wasn't from Cloudinary
    };
    
    console.log('Returning local file info instead of Cloudinary upload');
    return fileInfo;
  }
  
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
    
    // Instead of failing, fall back to local storage
    console.log('Falling back to local file storage due to Cloudinary error');
    
    const fs = require('fs');
    const path = require('path');
    
    // Generate a local file info object that mimics Cloudinary response format
    const filename = path.basename(fileData.path);
    const fileInfo = {
      public_id: filename,
      url: `/api/files/original/${filename}`,
      secure_url: `/api/files/original/${filename}`,
      format: path.extname(filename).replace('.', ''),
      resource_type: 'raw',
      bytes: fs.statSync(fileData.path).size,
      created_at: new Date().toISOString(),
      original_filename: fileData.originalname || filename,
      _fromLocalStorage: true, // Flag to indicate this wasn't from Cloudinary
      _cloudinaryError: error.message // Store original error for debugging
    };
    
    return fileInfo;
  }
};

/**
 * Delete a file from Cloudinary or local storage
 * @param {string} publicId - The public ID of the file to delete
 * @param {boolean} isLocalFile - Whether this is a local file (not in Cloudinary)
 * @returns {Promise<Object>} - Deletion result
 */
const deleteFile = async (publicId, isLocalFile = false) => {
  // If explicitly a local file or Cloudinary isn't configured, handle local file deletion
  if (isLocalFile || !isCloudinaryConfigured()) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check different possible locations for the file
      const possiblePaths = [
        path.join(process.env.UPLOAD_DIR || './uploads', publicId),
        path.join(process.env.TEMP_DIR || './temp', publicId),
        // Add any other potential directories where files might be stored
      ];
      
      let deleted = false;
      
      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted local file: ${filePath}`);
          deleted = true;
          break;
        }
      }
      
      return { result: deleted ? 'ok' : 'not_found', _fromLocalStorage: true };
    } catch (error) {
      console.error('Local file delete error:', error);
      return { result: 'error', error: error.message, _fromLocalStorage: true };
    }
  }
  
  // Otherwise try Cloudinary deletion
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted Cloudinary file with public_id: ${publicId}`);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    
    // If Cloudinary deletion fails, check if it might be a local file as fallback
    try {
      console.log('Trying local file deletion as fallback...');
      return await deleteFile(publicId, true);
    } catch (fallbackError) {
      console.error('Both Cloudinary and local deletion failed:', fallbackError);
      throw new Error('Failed to delete file from both Cloudinary and local storage');
    }
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