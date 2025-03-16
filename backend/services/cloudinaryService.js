const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'pdfspark',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Create a Cloudinary storage engine for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pdfspark',
    allowed_formats: ['jpg', 'png', 'pdf', 'gif', 'webp', 'svg'],
    resource_type: 'auto',
  },
});

/**
 * Upload a file to Cloudinary
 * @param {string} filePath - Local file path
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Cloudinary upload result
 */
const uploadFile = async (filePath, options = {}) => {
  try {
    const defaultOptions = {
      folder: 'pdfspark',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    };

    const uploadOptions = { ...defaultOptions, ...options };
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Public ID of the file
 * @returns {Promise<Object>} - Cloudinary delete result
 */
const deleteFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete file from Cloudinary: ${error.message}`);
  }
};

/**
 * Generate a signed URL for a Cloudinary resource
 * @param {string} publicId - Public ID of the resource
 * @param {Object} options - URL generation options
 * @returns {string} - Signed URL
 */
const getSignedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    secure: true,
    resource_type: 'image',
    format: 'auto',
    quality: 'auto',
  };

  const urlOptions = { ...defaultOptions, ...options };
  return cloudinary.url(publicId, urlOptions);
};

module.exports = {
  cloudinary,
  storage,
  uploadFile,
  deleteFile,
  getSignedUrl,
};