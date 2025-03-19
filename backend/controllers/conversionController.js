const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const User = require('../models/User');
const logger = require('../utils/logger');
const cloudinaryHelper = require('../utils/cloudinaryHelper');

// Import new enhanced queue system
const { processingQueue } = require('../utils/processingQueue');
const { conversionJobProcessor } = require('../utils/conversionJobProcessor');

// Legacy imports - will be replaced by the new queue system
const conversionTracker = require('../utils/conversionTracker');
const conversionQueue = require('../utils/conversionQueue');

// Start a conversion operation
// @route   POST /api/convert
// @access  Public
exports.startConversion = async (req, res, next) => {
  try {
    // Generate correlation ID for tracking this conversion through the system
    const correlationId = req.correlationId || uuidv4();
    const sessionId = req.sessionId || req.headers['x-session-id'] || 'unknown';
    const operationId = uuidv4();
    
    // Create a request-specific logger
    const reqLogger = logger.child({
      correlationId,
      sessionId,
      operationId,
      endpoint: '/api/convert',
      userId: req.user ? req.user._id : 'guest'
    });
    
    reqLogger.info('Conversion request received', {
      headers: req.headers,
      body: req.body
    });
    
    const { fileId, sourceFormat, targetFormat, options = {} } = req.body;
    
    if (!fileId || !sourceFormat || !targetFormat) {
      reqLogger.error('Missing required parameters', { fileId, sourceFormat, targetFormat });
      return next(new ErrorResponse('Please provide fileId, sourceFormat and targetFormat', 400));
    }
    
    // Only support PDF as source format for now
    if (sourceFormat !== 'pdf') {
      reqLogger.error('Unsupported source format:', sourceFormat);
      return next(new ErrorResponse('Only PDF source format is supported', 400));
    }
    
    // Basic validation - simplified for this fix
    const supportedTargetFormats = ['docx', 'xlsx', 'pptx', 'jpg', 'txt', 'pdf'];
    if (!supportedTargetFormats.includes(targetFormat)) {
      reqLogger.error('Unsupported target format:', targetFormat);
      return next(new ErrorResponse(`Unsupported target format: ${targetFormat}`, 400));
    }
    
    // Create a new operation record with pre-assigned resultFileId
    const resultFileId = uuidv4(); // Pre-assign a resultFileId for consistency
    
    // Create a new operation record
    const operation = new Operation({
      _id: operationId,
      sourceFileId: fileId,
      sourceFormat,
      targetFormat,
      options: {
        ...options,
        // Default options here
      },
      status: 'created',
      progress: 0,
      resultFileId,
      correlationId,
      sessionId,
      userId: req.user ? req.user._id : null
    });
    
    // Save the operation
    await operation.save();
    
    // Respond with the operation ID immediately
    res.status(202).json({
      success: true,
      operationId: operation._id,
      status: operation.status
    });
    
    // Add conversion job to queue
    reqLogger.info('Adding conversion job to queue', { 
      operationId: operation._id, 
      sourceFileId: fileId 
    });
    
    // Use the new enhanced queue system
    // Add high-priority conversion job (7 out of 10)
    processingQueue.addJob(
      operation._id, 
      {
        operationId: operation._id,
        fileId,
        sourceFormat,
        targetFormat,
        options,
        correlationId,
        sessionId,
        isPremium: !!req.user?.isPremium,
        maxAttempts: 3
      },
      req.user?.isPremium ? 8 : 6, // Premium users get higher priority
      (jobData) => conversionJobProcessor.process(jobData)
    );
    
    reqLogger.info('Conversion job added to processing queue', {
      operationId: operation._id,
      queueStats: processingQueue.getStats()
    });
    
  } catch (error) {
    console.error('Error starting conversion:', error);
    next(new ErrorResponse('Error starting conversion', 500));
  }
};

/**
 * Process a conversion operation
 * This is executed by the conversion queue
 */
async function processConversion(operation, reqLogger) {
  reqLogger.info('Processing conversion operation', { operationId: operation._id });
  
  try {
    // Update operation status to processing
    operation.status = 'processing';
    operation.progress = 10;
    await operation.save();
    
    // 1. CLOUDINARY-FIRST APPROACH: Get source file
    // First, try to retrieve the file path
    let filePath;
    let cloudinaryId;
    
    try {
      // Look up the source file in known locations
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const tempDir = process.env.TEMP_DIR || './temp';
      
      // Try possible locations
      const possiblePaths = [
        path.join(uploadDir, operation.sourceFileId),
        path.join(tempDir, operation.sourceFileId),
      ];
      
      // Find the first existing path
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          filePath = possiblePath;
          break;
        }
      }
      
      if (!filePath) {
        reqLogger.warn('Source file not found locally', {
          sourceFileId: operation.sourceFileId,
          searchedPaths: possiblePaths
        });
      } else {
        reqLogger.info('Found source file locally', {
          filePath,
          size: fs.statSync(filePath).size
        });
      }
    } catch (fileError) {
      reqLogger.error('Error finding source file', {
        error: fileError.message,
        sourceFileId: operation.sourceFileId
      });
    }
    
    // 2. Upload to Cloudinary immediately (if file exists locally)
    if (filePath) {
      try {
        reqLogger.info('Uploading source file to Cloudinary', { filePath });
        
        // Update progress
        operation.progress = 20;
        await operation.save();
        
        // Use the reliable Cloudinary upload with retry mechanism
        const cloudinaryResult = await cloudinaryHelper.reliableCloudinaryUpload(filePath, {
          folder: 'pdfspark_sources',
          correlationId: operation.correlationId,
          uploadId: `src_${operation._id}`,
          tags: ['source', 'pdf', `op_${operation._id}`],
          maxAttempts: 5,
          fallbackToLocal: true
        });
        
        // Store Cloudinary information in the operation
        operation.sourceCloudinaryData = {
          publicId: cloudinaryResult.public_id,
          secureUrl: cloudinaryResult.secure_url,
          format: cloudinaryResult.format,
          resourceType: cloudinaryResult.resource_type,
          bytes: cloudinaryResult.bytes,
          uploadTimestamp: new Date()
        };
        
        operation.progress = 30;
        await operation.save();
        
        cloudinaryId = cloudinaryResult.public_id;
        
        reqLogger.info('Source file uploaded to Cloudinary', {
          publicId: cloudinaryResult.public_id,
          size: cloudinaryResult.bytes
        });
      } catch (uploadError) {
        reqLogger.error('Failed to upload source file to Cloudinary', {
          error: uploadError.message,
          filePath
        });
        // Continue anyway, we'll try to process the local file
      }
    }
    
    // 3. Perform the actual conversion
    // For now, we're simulating the conversion for this implementation
    reqLogger.info('Starting conversion process', {
      sourceFormat: operation.sourceFormat,
      targetFormat: operation.targetFormat
    });
    
    // Update progress
    operation.progress = 50;
    await operation.save();
    
    // TODO: Implement actual conversion using pdfService
    // This is where the real conversion would happen
    // For now, just simulate a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 4. Handle success scenario - generate a result file
    // For the purpose of this implementation, we'll create a dummy result that points to Cloudinary
    const resultFilePath = path.join(process.env.TEMP_DIR || './temp', operation.resultFileId);
    
    // For now, we're not actually creating the result file since this is just the Cloudinary implementation
    
    // 5. Upload the result to Cloudinary
    reqLogger.info('Simulating uploading conversion result to Cloudinary');
    
    // Update progress
    operation.progress = 80;
    await operation.save();
    
    // Simulate successful conversion and Cloudinary upload
    const resultCloudinaryData = {
      publicId: `result_${operation._id}`,
      secureUrl: `https://res.cloudinary.com/demo/image/upload/fl_attachment/pdfspark_results/result_${operation._id}.${operation.targetFormat}`,
      format: operation.targetFormat,
      resourceType: 'raw',
      bytes: 1024, // Dummy size
      uploadTimestamp: new Date()
    };
    
    // 6. Update the operation with the Cloudinary result info
    operation.resultCloudinaryData = resultCloudinaryData;
    operation.resultDownloadUrl = resultCloudinaryData.secureUrl;
    operation.status = 'completed';
    operation.progress = 100;
    operation.completedAt = new Date();
    
    await operation.save();
    
    reqLogger.info('Conversion operation completed successfully', {
      operationId: operation._id,
      resultFileId: operation.resultFileId,
      cloudinaryPublicId: resultCloudinaryData.publicId
    });
    
    // 7. Cleanup - if we're on Railway, we should clean up local files
    if (process.env.RAILWAY_SERVICE_NAME && filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        reqLogger.info('Cleaned up local source file', { filePath });
      } catch (cleanupError) {
        reqLogger.warn('Failed to clean up local source file', {
          filePath,
          error: cleanupError.message
        });
      }
    }
    
    return true;
  } catch (error) {
    reqLogger.error('Error processing conversion', {
      error: error.message,
      stack: error.stack,
      operationId: operation._id
    });
    
    // Update operation status to failed
    operation.status = 'failed';
    operation.errorMessage = error.message;
    operation.completedAt = new Date();
    await operation.save();
    
    return false;
  }
};

// Get operation status
// @route   GET /api/operations/:id/status
// @access  Public
exports.getOperationStatus = async (req, res, next) => {
  try {
    // Create a request-specific logger
    const reqLogger = logger.child({
      endpoint: '/api/operations/status',
      operationId: req.params.id,
      userId: req.user ? req.user._id : 'guest'
    });
    
    // Find the operation
    const operation = await Operation.findById(req.params.id);
    
    if (!operation) {
      reqLogger.warn('Operation not found', { operationId: req.params.id });
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    // Enhanced response with queue information
    let queueInfo = {};
    if (operation.status === 'queued' || operation.status === 'created') {
      // Get queue position and estimated wait time
      const jobInfo = processingQueue.getJobInfo(operation._id);
      if (jobInfo) {
        queueInfo = {
          queuePosition: jobInfo.queuePosition || null,
          estimatedWaitTimeMs: jobInfo.estimatedWaitTimeMs || null,
          priority: jobInfo.priority || null
        };
      }
    }
    
    // Get memory status if in development mode
    let diagnosticInfo = {};
    if (process.env.NODE_ENV === 'development') {
      const queueStats = processingQueue.getStats();
      diagnosticInfo = {
        queuedJobs: queueStats.queuedCount,
        activeJobs: queueStats.activeCount,
        memoryUsage: queueStats.memoryStatus.usedPercentage
      };
    }
    
    reqLogger.info('Operation status retrieved', { 
      status: operation.status,
      progress: operation.progress,
      queueInfo
    });
    
    // Include chunked processing information if available
    let chunkedInfo = {};
    if (operation.chunkedProcessing && operation.chunkedProcessing.enabled) {
      chunkedInfo = {
        totalChunks: operation.chunkedProcessing.totalChunks,
        completedChunks: operation.chunkedProcessing.completedChunks,
        failedChunks: operation.chunkedProcessing.failedChunks,
        isMultipart: operation.chunkedProcessing.isMultipart,
        isZipped: operation.chunkedProcessing.isZipped
      };
    }
    
    res.status(200).json({
      success: true,
      status: operation.status,
      progress: operation.progress,
      sourceFormat: operation.sourceFormat,
      targetFormat: operation.targetFormat,
      createdAt: operation.createdAt,
      completedAt: operation.completedAt,
      errorMessage: operation.errorMessage,
      // Enhanced fields
      queue: queueInfo,
      chunked: Object.keys(chunkedInfo).length > 0 ? chunkedInfo : undefined,
      cloudinarySource: operation.sourceCloudinaryData ? {
        publicId: operation.sourceCloudinaryData.publicId,
        url: operation.sourceCloudinaryData.secureUrl
      } : null,
      cloudinaryResult: operation.resultCloudinaryData ? {
        publicId: operation.resultCloudinaryData.publicId,
        url: operation.resultCloudinaryData.secureUrl
      } : null,
      diagnostic: Object.keys(diagnosticInfo).length > 0 ? diagnosticInfo : undefined
    });
  } catch (error) {
    console.error('Error getting operation status:', error);
    next(new ErrorResponse('Error getting operation status', 500));
  }
};

// Get operation download URL
// @route   GET /api/operations/:id/download
// @access  Public
exports.getDownloadUrl = async (req, res, next) => {
  // Create a request-specific logger
  const reqLogger = logger.child({
    endpoint: '/api/operations/download',
    operationId: req.params.id,
    userId: req.user ? req.user._id : 'guest'
  });
  
  try {
    // Find the operation
    const operation = await Operation.findById(req.params.id);
    
    if (!operation) {
      reqLogger.warn('Operation not found', { operationId: req.params.id });
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    if (operation.status !== 'completed') {
      reqLogger.warn('Operation not completed', { 
        operationId: req.params.id,
        status: operation.status
      });
      return next(new ErrorResponse(`Operation is not completed yet (status: ${operation.status})`, 400));
    }
    
    reqLogger.info('Generating download URL', { operationId: operation._id });
    
    // Prioritize Cloudinary sources in the Cloudinary-First approach
    
    // Priority 1: Check if there's a resultCloudinaryData (new field)
    if (operation.resultCloudinaryData && operation.resultCloudinaryData.secureUrl) {
      const downloadUrl = cloudinaryHelper.addDownloadParameters(operation.resultCloudinaryData.secureUrl);
      
      reqLogger.info('Using resultCloudinaryData URL', { 
        publicId: operation.resultCloudinaryData.publicId 
      });
      
      return res.json({
        success: true,
        downloadUrl,
        fileName: `converted.${operation.targetFormat}`,
        format: operation.targetFormat,
        source: 'cloudinary',
        fileSize: operation.resultCloudinaryData.bytes || 0
      });
    }
    
    // Priority 2: Check if there's a legacy cloudinaryData (backward compatibility)
    if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
      const downloadUrl = cloudinaryHelper.addDownloadParameters(operation.cloudinaryData.secureUrl);
      
      reqLogger.info('Using legacy cloudinaryData URL', { 
        url: operation.cloudinaryData.secureUrl 
      });
      
      return res.json({
        success: true,
        downloadUrl,
        fileName: `converted.${operation.targetFormat}`,
        format: operation.targetFormat,
        source: 'cloudinary-legacy'
      });
    }
    
    // Priority 3: Check if there's a resultDownloadUrl
    if (operation.resultDownloadUrl) {
      // Check if this is a Cloudinary URL and add download parameters if needed
      const isCloudinaryUrl = operation.resultDownloadUrl.includes('cloudinary.com');
      const downloadUrl = isCloudinaryUrl 
        ? cloudinaryHelper.addDownloadParameters(operation.resultDownloadUrl)
        : operation.resultDownloadUrl;
      
      reqLogger.info('Using resultDownloadUrl', { 
        isCloudinaryUrl,
        url: operation.resultDownloadUrl
      });
      
      return res.json({
        success: true,
        downloadUrl,
        fileName: `converted.${operation.targetFormat}`,
        format: operation.targetFormat,
        source: isCloudinaryUrl ? 'cloudinary-url' : 'direct-url'
      });
    }
    
    // Priority 4: Generate a download URL from local file
    reqLogger.info('Using local file URL fallback', { 
      resultFileId: operation.resultFileId 
    });
    
    return res.json({
      success: true,
      downloadUrl: `/api/files/download/${operation.resultFileId}`,
      fileName: `converted.${operation.targetFormat}`,
      format: operation.targetFormat,
      source: 'local-file'
    });
    
  } catch (error) {
    reqLogger.error('Error generating download URL', {
      error: error.message,
      stack: error.stack
    });
    next(new ErrorResponse('Error generating download URL', 500));
  }
};

// Get conversion queue status
// @route   GET /api/queue/status
// @access  Public
exports.getQueueStatus = async (req, res, next) => {
  try {
    // Get queue stats
    const queueStats = processingQueue.getStats();
    
    // Only show detailed job info to admins
    const isAdmin = req.user && req.user.role === 'admin';
    
    // Return simplified stats for regular users
    return res.json({
      success: true,
      status: {
        queuedJobs: queueStats.queuedCount,
        activeJobs: queueStats.activeCount,
        estimatedWaitTimeMs: queueStats.estimatedWaitTimeMs,
        memoryUsage: Math.round(queueStats.memoryStatus.usedPercentage * 100) / 100,
        isPaused: queueStats.isPaused
      },
      // Include detailed information for admins
      details: isAdmin ? {
        memoryDetails: queueStats.memoryStatus,
        processingStats: {
          succeeded: queueStats.succeeded,
          failed: queueStats.failed,
          averageProcessingTimeMs: queueStats.averageProcessingTimeMs
        }
      } : undefined
    });
  } catch (error) {
    console.error('Error fetching queue status:', error);
    next(new ErrorResponse('Error fetching queue status', 500));
  }
};

// Create a payment for a premium conversion
// @route   POST /api/payments/create
// @access  Public
exports.createPayment = async (req, res, next) => {
  try {
    const { operationId, paymentMethod = 'card', returnUrl } = req.body;
    
    if (!operationId) {
      return next(new ErrorResponse('Please provide operationId', 400));
    }
    
    // Find the operation
    const operation = await Operation.findById(operationId);
    
    if (!operation) {
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    // Create a placeholder payment record
    const payment = new Payment({
      operationId,
      amount: 1.99,
      currency: 'usd',
      status: 'pending',
      paymentMethod
    });
    
    await payment.save();
    
    res.status(201).json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency
      },
      redirectUrl: returnUrl || '/'
    });
    
  } catch (error) {
    console.error('Error creating payment:', error);
    next(new ErrorResponse('Error creating payment', 500));
  }
};

// Stripe webhook handler
// @route   POST /api/webhook/stripe
// @access  Public
exports.stripeWebhook = async (req, res) => {
  try {
    // Test mode indicator
    const isTestMode = req.query.test === 'true';
    
    if (isTestMode) {
      console.log('Received TEST webhook request');
      return res.status(200).send();
    }
    
    // Log webhook receipt
    console.log('Received Stripe webhook');
    
    try {
      // This is a nested try block that might be missing a catch
      // Process Stripe webhook event here
      // For now, we're just adding an empty catch block
    } catch (nestedError) {
      console.error('Error processing webhook event:', nestedError);
    }
    
    // Return success
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Stripe webhook error:', error);
    // Even for errors, we should respond with 200 to acknowledge receipt
    res.status(200).send();
  }
};