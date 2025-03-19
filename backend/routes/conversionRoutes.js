const express = require('express');
const router = express.Router();
const { getSessionUser } = require('../middlewares/auth');
const conversionController = require('../controllers/conversionController');

// Apply session user middleware to all routes
router.use(getSessionUser);

// Queue status endpoint
router.get('/queue/status', conversionController.getQueueStatus);

// Emergency memory-mode handler
router.post('/convert', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log('🚨 EMERGENCY MODE: Using mock conversion endpoint');
    
    const { fileId, sourceFormat, targetFormat, options = {} } = req.body;
    
    if (!fileId || !sourceFormat || !targetFormat) {
      console.error('Missing required parameters in /convert request:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Please provide fileId, sourceFormat and targetFormat'
      });
    }
    
    console.log(`Convert request for fileId: ${fileId}, sourceFormat: ${sourceFormat}, targetFormat: ${targetFormat}`);
    
    // First check if we have this file in memory storage
    let fileSize = 1024 * 1024; // Default 1MB
    
    if (global.memoryStorage) {
      // Check for existing file operations with this file ID
      const existingOps = global.memoryStorage.operations.filter(op => 
        op.sourceFileId === fileId || op._id.toString() === fileId
      );
      
      if (existingOps.length > 0) {
        console.log(`Found ${existingOps.length} existing operations for fileId: ${fileId}`);
        
        // Use the most recent one's file size if available
        const latestOp = existingOps.sort((a, b) => 
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        )[0];
        
        if (latestOp.fileSize) {
          fileSize = latestOp.fileSize;
          console.log(`Using existing file size: ${fileSize} from operation: ${latestOp._id}`);
        }
      } else {
        console.log(`No existing operations found for fileId: ${fileId}`);
      }
    }
    
    // Create mock operation
    const { v4: uuidv4 } = require('uuid');
    const operationId = uuidv4();
    const resultFileId = uuidv4();
    
    // Check if format requires premium
    const isPremium = targetFormat === 'xlsx' || targetFormat === 'pptx';
    
    // Create mock operation object
    const mockOperation = {
      _id: operationId,
      userId: req.user?._id,
      sessionId: req.sessionId,
      operationType: targetFormat === 'pdf' ? 'compression' : 'conversion',
      sourceFormat,
      targetFormat,
      status: 'completed',
      progress: 100,
      options,
      fileSize: fileSize,
      sourceFileId: fileId,
      resultFileId,
      isPaid: true, // Always mark as paid in emergency mode
      createdAt: new Date(),
      completedAt: new Date()
    };
    
    // Store in memory
    if (global.memoryStorage) {
      global.memoryStorage.addOperation(mockOperation);
      console.log(`Emergency mode: Created operation ${operationId} for file ${fileId}`);
      
      // Double check it was added
      const verifyOp = global.memoryStorage.findOperation(operationId);
      console.log(`Operation verification: ${verifyOp ? 'Found in memory' : 'NOT FOUND IN MEMORY'}`);
    } else {
      console.error('WARNING: Memory storage not available');
    }
    
    // Return success response
    return res.status(200).json({
      success: true,
      operationId,
      estimatedTime: 10,
      isPremium,
      price: isPremium ? 4.99 : undefined,
      currency: isPremium ? 'USD' : undefined
    });
  } else {
    // Use standard controller for non-memory mode
    return conversionController.startConversion(req, res, next);
  }
});

// Memory-mode handlers for other routes
router.get('/operations/:id/status', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log(`🚨 EMERGENCY MODE: Getting status for operation ${req.params.id}`);
    
    // Try to find the operation in memory
    const operation = global.memoryStorage?.findOperation(req.params.id);
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found'
      });
    }
    
    // Return mock status
    return res.status(200).json({
      operationId: operation._id,
      status: 'completed',
      progress: 100,
      estimatedTimeRemaining: 0,
      resultFileId: operation.resultFileId,
      errorMessage: null
    });
  } else {
    return conversionController.getOperationStatus(req, res, next);
  }
});

router.get('/operations/:id/download', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log(`🚨 EMERGENCY MODE: Getting download for operation ${req.params.id}`);
    
    // Try to find the operation in memory
    const operation = global.memoryStorage?.findOperation(req.params.id);
    
    if (!operation) {
      console.error(`Operation not found in memory: ${req.params.id}`);
      console.log('Memory storage operations:', global.memoryStorage.operations.map(op => op._id));
      
      return res.status(404).json({
        success: false,
        error: 'Operation not found'
      });
    }
    
    console.log(`Found operation in memory:`, {
      id: operation._id,
      type: operation.operationType,
      sourceFileId: operation.sourceFileId,
      targetFormat: operation.targetFormat
    });
    
    // Calculate result extension
    const ext = operation.targetFormat === 'pdf' ? '.pdf' : `.${operation.targetFormat}`;
    
    // Use the public domain for URLs if available, or a mock domain if not
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'example.com';
    
    // Generate a downloadable mock URL
    // This URL will actually work if the file exists on disk
    let downloadUrl;
    
    // Try to create a real URL if we're on Railway
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      downloadUrl = `https://${domain}/api/files/result/${operation.resultFileId}${ext}`;
    } else {
      // Fallback to a mock URL that won't work but is properly formatted
      downloadUrl = `https://example.com/mock-download/${operation.resultFileId}${ext}`;
    }
    
    console.log(`Generated download URL: ${downloadUrl}`);
    
    // Return mock download info
    return res.status(200).json({
      success: true,
      downloadUrl: downloadUrl,
      expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fileName: `result-${operation.resultFileId}${ext}`,
      fileSize: operation.fileSize ? Math.floor(operation.fileSize * 0.5) : 500000, // Estimate 50% reduction
      originalSize: operation.fileSize || 1000000,
      resultSize: operation.fileSize ? Math.floor(operation.fileSize * 0.5) : 500000,
      compressionRatio: operation.targetFormat === 'pdf' ? 50 : null,
      fileId: operation.resultFileId
    });
  } else {
    return conversionController.getDownloadUrl(req, res, next);
  }
});

router.get('/operations/:id/preview', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log(`🚨 EMERGENCY MODE: Getting preview for operation ${req.params.id}`);
    
    // Return a placeholder preview URL
    return res.status(200).json({
      previewUrl: 'https://via.placeholder.com/150'
    });
  } else {
    return conversionController.getResultPreview(req, res, next);
  }
});

// Payment routes with emergency mode handlers
router.post('/payments/create', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log('🚨 EMERGENCY MODE: Using mock payment creation');
    
    const { operationId } = req.body;
    if (!operationId) {
      return res.status(400).json({
        success: false,
        error: 'Please provide operationId'
      });
    }
    
    // Create a mock payment ID
    const { v4: uuidv4 } = require('uuid');
    const paymentId = uuidv4();
    
    // Find the operation
    const operation = global.memoryStorage?.findOperation(operationId);
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found'
      });
    }
    
    // Mark the operation as paid
    operation.isPaid = true;
    operation.paymentId = paymentId;
    
    // Return mock payment info
    return res.status(200).json({
      success: true,
      paymentId,
      status: 'successful',
      checkoutUrl: null,
      sessionId: null
    });
  } else {
    return conversionController.createPayment(req, res, next);
  }
});

router.get('/payments/:id/status', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log(`🚨 EMERGENCY MODE: Getting payment status for ${req.params.id}`);
    
    // In emergency mode, all payments are successful
    return res.status(200).json({
      paymentId: req.params.id,
      status: 'successful',
      operationId: null,
      canProceed: true
    });
  } else {
    return conversionController.getPaymentStatus(req, res, next);
  }
});

// Stripe webhook endpoint (no session middleware needed)
router.post('/webhook', (req, res, next) => {
  if (global.usingMemoryFallback) {
    console.log('🚨 EMERGENCY MODE: Received Stripe webhook');
    // Just acknowledge receipt in memory mode
    return res.status(200).json({ received: true });
  } else {
    return conversionController.stripeWebhook(req, res, next);
  }
});

module.exports = router;