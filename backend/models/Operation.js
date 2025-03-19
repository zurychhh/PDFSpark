const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { transactionManager } = require('../utils/transactionManager');

const operationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sessionId: {
    type: String,
    required: true
  },
  operationType: {
    type: String,
    required: true,
    enum: ['conversion', 'compression', 'ocr', 'protection', 'merge', 'split', 'file_upload']
  },
  sourceFormat: {
    type: String,
    required: function() {
      // Only required for certain operation types
      return ['conversion', 'compression', 'ocr'].includes(this.operationType);
    }
  },
  targetFormat: {
    type: String,
    required: function() {
      // Only required for certain operation types
      return ['conversion'].includes(this.operationType);
    }
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  options: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  fileSize: Number,
  sourceFileId: String,
  resultFileId: String,
  resultDownloadUrl: String,
  resultExpiryTime: Date,
  isPaid: {
    type: Boolean,
    default: false
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  errorMessage: String,
  // For analytics
  processingTimeMs: Number,
  // Additional stats for compression operations
  compressionStats: {
    originalSize: Number,
    resultSize: Number,
    compressionRatio: Number,
    compressionLevel: String
  },
  // Source file Cloudinary data
  sourceCloudinaryData: {
    publicId: String,
    secureUrl: String,
    format: String,
    resourceType: String,
    bytes: Number,
    uploadTimestamp: Date
  },
  // Result file Cloudinary data
  resultCloudinaryData: {
    publicId: String,
    secureUrl: String,
    format: String,
    resourceType: String,
    bytes: Number,
    uploadTimestamp: Date
  },
  // Tracking and correlation 
  correlationId: {
    type: String,
    default: () => require('uuid').v4()
  },
  // Additional file metadata
  fileData: {
    originalName: String,
    size: Number,
    mimeType: String,
    filePath: String // Added explicit filePath property to track file location
  },
  // Chunked processing metadata
  chunkedProcessing: {
    enabled: {
      type: Boolean,
      default: false
    },
    totalChunks: Number,
    completedChunks: {
      type: Number,
      default: 0
    },
    failedChunks: {
      type: Number,
      default: 0
    },
    chunkSize: Number,
    pageCount: Number,
    isMultipart: {
      type: Boolean,
      default: false
    },
    isZipped: {
      type: Boolean,
      default: false
    },
    chunkResults: [{
      index: Number,
      cloudinaryPublicId: String,
      cloudinaryUrl: String,
      pageRange: {
        start: Number,
        end: Number
      }
    }]
  },
  // Railway specific flags
  railwayDeployment: {
    type: Boolean,
    default: false
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add index for faster queries
if (operationSchema.index) {
  operationSchema.index({ sessionId: 1, createdAt: -1 });
  operationSchema.index({ userId: 1, createdAt: -1 });
  operationSchema.index({ status: 1 });
}

/**
 * Save the instance using the transaction manager
 * @param {Object} session MongoDB session object (optional)
 * @returns {Promise<Object>} Saved operation
 */
operationSchema.methods.saveWithTransaction = async function(session = null) {
  return await transactionManager.saveDocument(this, session);
};

operationSchema.methods.updateProgress = async function(progress, session = null) {
  this.progress = progress;
  return await this.saveWithTransaction(session);
};

operationSchema.methods.complete = async function(resultFileId, resultDownloadUrl, resultExpiryTime, cloudinaryData, session = null) {
  return await transactionManager.executeWithTransaction(async (txSession, context) => {
    this.status = 'completed';
    this.progress = 100;
    this.completedAt = new Date();
    this.resultFileId = resultFileId;
    this.resultDownloadUrl = resultDownloadUrl;
    this.resultExpiryTime = resultExpiryTime;
    this.processingTimeMs = new Date() - this.createdAt;
    
    // If Cloudinary data is provided, store it
    if (cloudinaryData) {
      this.resultCloudinaryData = {
        publicId: cloudinaryData.public_id,
        secureUrl: cloudinaryData.secure_url,
        format: cloudinaryData.format,
        resourceType: cloudinaryData.resource_type,
        bytes: cloudinaryData.bytes,
        uploadTimestamp: new Date()
      };
    }
    
    // Save with transaction session
    return await this.saveWithTransaction(txSession || session);
  }, {
    requestId: this.correlationId,
    operation: 'complete_operation'
  });
};

/**
 * Update source file's Cloudinary data
 * @param {Object} cloudinaryData - Cloudinary upload result
 * @param {Object} session MongoDB session object (optional)
 */
operationSchema.methods.updateSourceCloudinaryData = async function(cloudinaryData, session = null) {
  this.sourceCloudinaryData = {
    publicId: cloudinaryData.public_id,
    secureUrl: cloudinaryData.secure_url,
    format: cloudinaryData.format,
    resourceType: cloudinaryData.resource_type,
    bytes: cloudinaryData.bytes,
    uploadTimestamp: new Date()
  };
  
  return await this.saveWithTransaction(session);
};

operationSchema.methods.fail = async function(errorMessage, session = null) {
  return await transactionManager.executeWithTransaction(async (txSession, context) => {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    this.completedAt = new Date();
    
    // Save with transaction session
    return await this.saveWithTransaction(txSession || session);
  }, {
    requestId: this.correlationId,
    operation: 'fail_operation'
  });
};

// Create a memory-fallback compatible model
const Operation = mongoose.model('Operation', operationSchema);

// Add memory fallback capabilities to the model
if (typeof Operation.findById === 'function') {
  const originalFindById = Operation.findById;
  
  // Override findById to check memory storage when in fallback mode
  Operation.findById = function(...args) {
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      const id = args[0];
      console.log(`Operation.findById called with id: ${id} in memory fallback mode`);
      
      // Check memory storage for the operation
      const memoryOp = global.memoryStorage.findOperation(id);
      
      if (memoryOp) {
        console.log(`Found operation ${id} in memory storage`);
        
        // Create a mock query that returns the memory operation
        return {
          exec: () => Promise.resolve(new Operation(memoryOp)),
          populate: () => ({
            exec: () => Promise.resolve(new Operation(memoryOp))
          })
        };
      } else {
        console.log(`Operation ${id} not found in memory storage`);
        // Return a query that resolves to null
        return {
          exec: () => Promise.resolve(null),
          populate: () => ({
            exec: () => Promise.resolve(null)
          })
        };
      }
    }
    
    // Use original mongoose implementation for normal mode
    return originalFindById.apply(this, args);
  };
}

// Override save method to support memory fallback
const originalSave = Operation.prototype.save;
Operation.prototype.save = function(...args) {
  // Check if we're in memory fallback mode
  if (global.usingMemoryFallback && global.memoryStorage) {
    // Ensure the document has an _id
    if (!this._id) {
      this._id = uuidv4();
    }
    
    // Add or update in memory storage
    const memoryOp = global.memoryStorage.findOperation(this._id);
    if (memoryOp) {
      // Update existing operation
      Object.assign(memoryOp, this.toObject());
    } else {
      // Add new operation
      global.memoryStorage.addOperation(this.toObject());
    }
    
    // Return a promise to maintain expected behavior
    return Promise.resolve(this);
  }
  
  // Use original mongoose implementation for normal mode
  return originalSave.apply(this, args);
};

module.exports = Operation;