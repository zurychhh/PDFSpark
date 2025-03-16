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

// File upload route
router.post('/upload', upload.single('file'), fileController.uploadFile);

// Get file preview
router.get('/preview/:filename', fileController.getFilePreview);

// Get result file
router.get('/result/:filename', fileController.getResultFile);

// Get original file
router.get('/original/:filename', fileController.getOriginalFile);

module.exports = router;