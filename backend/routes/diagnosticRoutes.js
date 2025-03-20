const express = require('express');
const router = express.Router();
const diagnosticController = require('../controllers/diagnosticController');
const multer = require('multer');

// Middleware to protect routes with admin API key
const requireAdminKey = (req, res, next) => {
  // Check for admin API key
  const apiKey = req.headers['x-api-key'] || req.query.key;
  const adminApiKey = process.env.ADMIN_API_KEY;
  
  if (adminApiKey && apiKey !== adminApiKey) {
    return res.status(403).json({
      status: 'error',
      message: 'Unauthorized access - invalid API key'
    });
  }
  
  next();
};

// Configure multer for test uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for tests
});

// Basic connectivity check
router.get('/ping', diagnosticController.ping);

// File system check
router.get('/file-system', diagnosticController.checkFileSystem);

// Memory check
router.get('/memory', diagnosticController.checkMemory);

// Advanced memory diagnostics (protected with admin API key)
router.get('/memory/advanced', requireAdminKey, diagnosticController.advancedMemoryDiagnostics);

// Memory history tracking (protected with admin API key)
router.get('/memory/history', requireAdminKey, diagnosticController.memoryHistory);

// Cloudinary configuration check
router.get('/cloudinary', diagnosticController.checkCloudinary);

// Database check
router.get('/database', diagnosticController.checkDatabase);

// Test upload endpoint
router.post('/upload', upload.single('file'), diagnosticController.testUpload);

// All diagnostics (protected with admin API key)
router.get('/all', requireAdminKey, diagnosticController.getAllDiagnostics);

// Test CORS configuration
router.get('/cors', diagnosticController.corsTest);

// Diagnose PDF conversion issues (protected with admin API key)
router.get('/pdf-conversion', requireAdminKey, diagnosticController.diagnosePdfConversion);

module.exports = router;