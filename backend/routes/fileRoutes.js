const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getSessionUser } = require('../middlewares/auth');
const fileController = require('../controllers/fileController');

// Set longer timeout for large files
const UPLOAD_TIMEOUT = 300000; // 5 minutes

// Create disk storage for reliable file upload
const diskStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
      } catch (err) {
        return cb(new Error(`Failed to create upload directory: ${err.message}`));
      }
    }
    
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    // Generate a unique filename with original extension
    const { v4: uuidv4 } = require('uuid');
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname) || '.pdf';
    const filename = `${uniqueId}${extension}`;
    
    cb(null, filename);
  }
});

// Create memory storage as backup option
const memoryStorage = multer.memoryStorage();

// Create better file filter
const fileFilter = (req, file, cb) => {
  console.log('Multer fileFilter received file:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    encoding: file.encoding
  });
  
  // For now, accept all files (validation happens later)
  return cb(null, true);
};

// Configure multer with disk storage for more reliable uploads
const diskUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 1, // Only 1 file per request
  },
  fileFilter: fileFilter
});

// Configure backup memory-based multer
const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
    files: 1 // Only 1 file per request
  },
  fileFilter: fileFilter
});

// Apply session user middleware to all routes
router.use(getSessionUser);

// Helper to read file into buffer for consistent handling
const readFileToBuffer = (filePath) => {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    console.error(`Error reading file from disk: ${error.message}`);
    throw error;
  }
};

// Middleware to set request timeout
const setRequestTimeout = (req, res, next) => {
  req.setTimeout(UPLOAD_TIMEOUT, () => {
    console.error('Request timeout during file upload');
    res.status(408).json({
      success: false,
      message: 'Request timeout while uploading file'
    });
  });
  next();
};

// Handle both multipart/form-data and JSON content types for file uploads
// Completely rewritten with improved reliability
router.post('/upload',
  setRequestTimeout, // Set longer timeout
  (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    console.log('=== FILE UPLOAD REQUEST STARTED ===');
    console.log('Content-Type:', contentType);
    console.log('Content-Length:', req.headers['content-length']);
    console.log('User-Agent:', req.headers['user-agent']);
    console.log('Session ID:', req.sessionId);
    console.log('Origin:', req.headers.origin || req.headers.referer || 'Unknown');
    
    // APPROACH 1: Handle JSON payload with base64 data
    if (contentType.includes('application/json')) {
      console.log('JSON Upload: Processing application/json request');
      
      // Check if we have a file property in the body
      if (!req.body || !req.body.file) {
        console.error('JSON Upload: Missing file property in request body');
        return res.status(400).json({
          success: false,
          message: 'Missing file property in JSON request body'
        });
      }
      
      const fileData = req.body.file;
      
      // Handle base64 encoded files
      if (typeof fileData === 'string') {
        try {
          console.log('JSON Upload: Processing base64 file data');
          
          // Get the base64 part if it's a data URL
          let base64Data;
          if (fileData.includes(';base64,')) {
            base64Data = fileData.split(';base64,').pop();
          } else {
            base64Data = fileData;
          }
          
          // Create buffer from base64
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Check if we have a valid buffer
          if (!buffer || buffer.length === 0) {
            console.error('JSON Upload: Invalid or empty base64 data');
            return res.status(400).json({
              success: false,
              message: 'Invalid or empty base64 data'
            });
          }
          
          console.log(`JSON Upload: Successfully decoded base64 data (${buffer.length} bytes)`);
          
          // Create pseudo file object for unified handling
          req.file = {
            fieldname: 'file',
            originalname: req.body.filename || 'document.pdf',
            encoding: 'base64',
            mimetype: req.body.mimetype || 'application/pdf',
            size: buffer.length,
            buffer: buffer,
            upload_method: 'json_base64'
          };
          
          return next();
        } catch (err) {
          console.error('JSON Upload: Error processing base64 data:', err);
          return res.status(400).json({
            success: false,
            message: `Error processing base64 data: ${err.message}`
          });
        }
      } else {
        console.error('JSON Upload: File property is not a string:', typeof fileData);
        return res.status(400).json({
          success: false,
          message: 'Invalid file format in JSON. Expected base64 string.'
        });
      }
    }
    
    // APPROACH 2: Handle multipart/form-data with disk storage
    else if (contentType.includes('multipart/form-data')) {
      console.log('Multipart Upload: Processing multipart/form-data request');
      
      // First try disk storage (more reliable)
      try {
        console.log('Multipart Upload: Trying disk storage upload...');
        
        diskUpload.single('file')(req, res, (err) => {
          if (err) {
            console.error('Multipart Upload: Disk storage error:', err);
            
            // If disk storage failed, try memory storage as fallback
            console.log('Multipart Upload: Trying memory storage fallback...');
            
            memoryUpload.single('file')(req, res, (memErr) => {
              if (memErr) {
                console.error('Multipart Upload: Memory storage also failed:', memErr);
                
                let errorMsg = 'File upload failed';
                let statusCode = 400;
                
                // Format specific error messages
                if (memErr instanceof multer.MulterError) {
                  if (memErr.code === 'LIMIT_FILE_SIZE') {
                    errorMsg = 'File size exceeds the 100MB limit';
                  } else if (memErr.code === 'LIMIT_UNEXPECTED_FILE') {
                    errorMsg = `Unexpected field "${memErr.field}". Use "file" field for the file.`;
                  } else {
                    errorMsg = `Upload error: ${memErr.message}`;
                  }
                } else {
                  statusCode = 500;
                  errorMsg = `Internal error during upload: ${memErr.message}`;
                }
                
                return res.status(statusCode).json({
                  success: false,
                  message: errorMsg,
                  error_code: memErr instanceof multer.MulterError ? memErr.code : 'UNKNOWN'
                });
              }
              
              // If memory upload succeeded where disk failed
              if (!req.file) {
                console.error('Multipart Upload: Memory upload succeeded but no file');
                return res.status(400).json({
                  success: false,
                  message: 'No file received in upload'
                });
              }
              
              console.log('Multipart Upload: Memory upload succeeded:', {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
              });
              
              // Add upload method for tracking
              req.file.upload_method = 'memory_fallback';
              
              // Continue to the file controller
              next();
            });
          } else {
            // Disk upload succeeded
            if (!req.file) {
              console.error('Multipart Upload: Disk upload succeeded but no file');
              return res.status(400).json({
                success: false,
                message: 'No file received in upload'
              });
            }
            
            console.log('Multipart Upload: Disk upload succeeded:', {
              fieldname: req.file.fieldname,
              originalname: req.file.originalname,
              destination: req.file.destination,
              filename: req.file.filename,
              path: req.file.path,
              size: req.file.size
            });
            
            // For consistent handling in the controller, read the file into buffer
            try {
              // Read file into buffer for consistent handling
              req.file.buffer = readFileToBuffer(req.file.path);
              console.log(`Multipart Upload: Read ${req.file.buffer.length} bytes from disk`);
              
              // Add upload method for tracking
              req.file.upload_method = 'disk_storage';
              
              // Continue to the file controller
              next();
            } catch (readErr) {
              console.error('Multipart Upload: Error reading uploaded file from disk:', readErr);
              
              return res.status(500).json({
                success: false,
                message: 'Error reading uploaded file from disk'
              });
            }
          }
        });
      } catch (diskErr) {
        console.error('Multipart Upload: Critical disk upload error:', diskErr);
        return res.status(500).json({
          success: false,
          message: 'Critical error during file upload setup'
        });
      }
    }
    
    // APPROACH 3: Handle other content types
    else {
      console.error('Unsupported Content-Type for file upload:', contentType);
      return res.status(415).json({
        success: false,
        message: 'Unsupported Content-Type. Use multipart/form-data or application/json.'
      });
    }
  },
  fileController.uploadFile
);

// Routes for retrieving files
router.get('/preview/:filename', fileController.getFilePreview);
router.get('/result/:filename', fileController.getResultFile);
router.get('/original/:filename', fileController.getOriginalFile);

module.exports = router;