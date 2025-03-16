const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getSessionUser } = require('../middlewares/auth');
const fileController = require('../controllers/fileController');

// Bardzo prosta konfiguracja multera - tylko pamięć, bez żadnego filtrowania
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

// Apply session user middleware to all routes
router.use(getSessionUser);

// Handle both multipart/form-data and JSON content types for file uploads
router.post('/upload', 
  (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    console.log('File upload request with Content-Type:', contentType);
    
    // If JSON payload is received, extract base64 file data
    if (contentType.includes('application/json')) {
      console.log('Received JSON payload instead of form-data');
      try {
        // Check if we have a file property in the JSON
        if (req.body && req.body.file) {
          console.log('Found file property in JSON payload');
          
          // If it's already a buffer or File object, use it directly
          if (req.body.file instanceof Buffer) {
            req.file = {
              buffer: req.body.file,
              originalname: req.body.filename || 'document.pdf',
              mimetype: req.body.mimetype || 'application/pdf',
              size: req.body.file.length
            };
            return next();
          }
          
          // If it's base64 encoded
          if (typeof req.body.file === 'string' && req.body.file.includes('base64')) {
            console.log('Processing base64 encoded file data');
            const base64Data = req.body.file.split(';base64,').pop();
            const buffer = Buffer.from(base64Data, 'base64');
            
            req.file = {
              buffer: buffer,
              originalname: req.body.filename || 'document.pdf',
              mimetype: req.body.mimetype || 'application/pdf',
              size: buffer.length
            };
            return next();
          }
          
          console.log('Could not process file data in JSON');
        }
      } catch (error) {
        console.error('Error processing JSON payload:', error);
      }
    }
    
    // For multipart/form-data, use multer as before
    upload.single('file')(req, res, next);
  }, 
  fileController.uploadFile
);

// Get file preview
router.get('/preview/:filename', fileController.getFilePreview);

// Get result file
router.get('/result/:filename', fileController.getResultFile);

// Get original file
router.get('/original/:filename', fileController.getOriginalFile);

module.exports = router;