const express = require('express');
const router = express.Router();
const diagnosticController = require('../controllers/diagnosticController');
const multer = require('multer');

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

// Cloudinary configuration check
router.get('/cloudinary', diagnosticController.checkCloudinary);

// Database check
router.get('/database', diagnosticController.checkDatabase);

// Test upload endpoint
router.post('/upload', upload.single('file'), diagnosticController.testUpload);

// All diagnostics
router.get('/all', diagnosticController.getAllDiagnostics);

module.exports = router;