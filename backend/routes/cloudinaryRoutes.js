const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinaryService = require('../services/cloudinaryService');

// Set up multer for file upload handling
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const tempDir = path.join(__dirname, '../temp');
      // Make sure the directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExt = path.extname(file.originalname);
      cb(null, 'upload-' + uniqueSuffix + fileExt);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept common image and document formats
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs and Word documents are allowed.'), false);
    }
  }
});

/**
 * @route POST /api/cloudinary/upload
 * @desc Upload a file to Cloudinary
 * @access Private
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Get upload options from request body
    const options = {
      folder: req.body.folder || 'pdfspark',
      resource_type: 'auto',
    };

    // Add tags if provided
    if (req.body.tags) {
      options.tags = req.body.tags.split(',');
    }

    // Add transformation if provided
    if (req.body.transformation) {
      options.transformation = req.body.transformation;
    }

    // Upload file to Cloudinary
    const result = await cloudinaryService.uploadFile(req.file.path, options);

    // Clean up the temporary file
    fs.unlinkSync(req.file.path);

    res.json(result);
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/cloudinary/delete
 * @desc Delete a file from Cloudinary
 * @access Private
 */
router.post('/delete', async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ success: false, message: 'Public ID is required' });
    }

    const result = await cloudinaryService.deleteFile(publicId);

    if (result.result === 'ok') {
      res.json({ success: true, message: 'File deleted successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Failed to delete file', result });
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route GET /api/cloudinary/sign
 * @desc Get a signed URL for a Cloudinary resource
 * @access Private
 */
router.get('/sign', (req, res) => {
  try {
    const { publicId, options } = req.query;

    if (!publicId) {
      return res.status(400).json({ success: false, message: 'Public ID is required' });
    }

    // Parse options if provided
    let parsedOptions = {};
    if (options) {
      try {
        parsedOptions = JSON.parse(options);
      } catch (e) {
        console.error('Invalid options JSON:', e);
      }
    }

    const signedUrl = cloudinaryService.getSignedUrl(publicId, parsedOptions);

    res.json({ success: true, signedUrl });
  } catch (error) {
    console.error('Error getting signed URL:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;