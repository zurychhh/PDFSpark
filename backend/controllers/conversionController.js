const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const User = require('../models/User');
const logger = require('../utils/logger');
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
    
    // Create a request-specific logger
    const reqLogger = logger.child({
      correlationId,
      sessionId,
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
      console.error('Unsupported source format:', sourceFormat);
      return next(new ErrorResponse('Only PDF source format is supported', 400));
    }
    
    // Basic validation - simplified for this fix
    const supportedTargetFormats = ['docx', 'xlsx', 'pptx', 'jpg', 'txt', 'pdf'];
    if (!supportedTargetFormats.includes(targetFormat)) {
      console.error('Unsupported target format:', targetFormat);
      return next(new ErrorResponse(`Unsupported target format: ${targetFormat}`, 400));
    }
    
    // Create a new operation record with pre-assigned resultFileId
    const operation = new Operation({
      sourceFileId: fileId,
      sourceFormat,
      targetFormat,
      options: {
        ...options,
        // Default options here
      },
      status: 'created',
      progress: 0,
      resultFileId: uuidv4(), // Pre-assign a resultFileId for consistency
      correlationId,
      sessionId,
      userId: req.user ? req.user._id : null
    });
    
    // Save the operation
    await operation.save();
    
    // Respond with the operation ID
    res.status(202).json({
      success: true,
      operationId: operation._id,
      status: operation.status
    });
    
    // Simplified process - just log instead of actual conversion
    console.log(`Starting conversion for operation: ${operation._id}`);
    
  } catch (error) {
    console.error('Error starting conversion:', error);
    next(new ErrorResponse('Error starting conversion', 500));
  }
};

// Get operation status
// @route   GET /api/operations/:id/status
// @access  Public
exports.getOperationStatus = async (req, res, next) => {
  try {
    // Find the operation
    const operation = await Operation.findById(req.params.id);
    
    if (!operation) {
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    res.status(200).json({
      success: true,
      status: operation.status,
      progress: operation.progress,
      sourceFormat: operation.sourceFormat,
      targetFormat: operation.targetFormat,
      createdAt: operation.createdAt,
      completedAt: operation.completedAt,
      errorMessage: operation.errorMessage
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
  try {
    // Find the operation
    const operation = await Operation.findById(req.params.id);
    
    if (!operation) {
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    if (operation.status !== 'completed') {
      return next(new ErrorResponse('Operation is not completed yet', 400));
    }
    
    // Priority 1: Check if there's a Cloudinary URL
    if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
      return res.json({
        success: true,
        downloadUrl: operation.cloudinaryData.secureUrl,
        fileName: `converted.${operation.targetFormat}`,
        format: operation.targetFormat
      });
    }
    
    // Priority 2: Check if there's a resultDownloadUrl
    if (operation.resultDownloadUrl) {
      return res.json({
        success: true,
        downloadUrl: operation.resultDownloadUrl,
        fileName: `converted.${operation.targetFormat}`,
        format: operation.targetFormat
      });
    }
    
    // Priority 3: Generate a download URL from local file (simplified)
    return res.json({
      success: true,
      downloadUrl: `/api/files/download/${operation.resultFileId}`,
      fileName: `converted.${operation.targetFormat}`,
      format: operation.targetFormat
    });
    
  } catch (error) {
    console.error('Error generating download URL:', error);
    next(new ErrorResponse('Error generating download URL', 500));
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