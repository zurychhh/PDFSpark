const express = require('express');
const router = express.Router();
const cloudinaryService = require('../services/cloudinaryService');

/**
 * @route POST /api/cloudinary/upload
 * @desc Upload a file to Cloudinary
 * @access Public
 */
router.post('/upload', cloudinaryService.upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    // The file upload is handled by multer-storage-cloudinary
    // and the file info is available in req.file
    
    // Extract relevant information from Cloudinary response
    const { 
      public_id, 
      secure_url, 
      url, 
      format, 
      width, 
      height, 
      bytes, 
      created_at,
      tags,
      etag,
      resource_type
    } = req.file;

    // Return formatted response
    return res.status(200).json({
      success: true,
      public_id,
      secure_url,
      url,
      format,
      width,
      height,
      bytes,
      created_at,
      tags,
      etag,
      resource_type
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error uploading file' 
    });
  }
});

/**
 * @route POST /api/cloudinary/signature
 * @desc Generate a signature for client-side uploads
 * @access Public
 */
router.post('/signature', async (req, res) => {
  try {
    const { folder, tags } = req.body;
    
    const signatureData = cloudinaryService.generateSignature({
      folder,
      tags: Array.isArray(tags) ? tags : undefined
    });

    return res.status(200).json({
      success: true,
      ...signatureData
    });
  } catch (error) {
    console.error('Signature generation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error generating signature' 
    });
  }
});

/**
 * @route POST /api/cloudinary/delete
 * @desc Delete a file from Cloudinary
 * @access Public
 */
router.post('/delete', async (req, res) => {
  try {
    const { publicId } = req.body;
    
    if (!publicId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Public ID is required' 
      });
    }

    const result = await cloudinaryService.deleteFile(publicId);
    
    if (result.result === 'ok') {
      return res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Failed to delete file',
        result
      });
    }
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error deleting file' 
    });
  }
});

module.exports = router;