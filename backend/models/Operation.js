const mongoose = require('mongoose');

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
    required: true
  },
  targetFormat: {
    type: String,
    required: true
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
  // Added for Cloudinary integration
  cloudinaryData: {
    publicId: String,
    url: String,
    secureUrl: String,
    format: String,
    resourceType: String
  },
  fileData: {
    originalName: String,
    size: Number,
    mimeType: String,
    cloudinaryId: String
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

operationSchema.methods.updateProgress = async function(progress) {
  this.progress = progress;
  return this.save();
};

operationSchema.methods.complete = async function(resultFileId, resultDownloadUrl, resultExpiryTime) {
  this.status = 'completed';
  this.progress = 100;
  this.completedAt = new Date();
  this.resultFileId = resultFileId;
  this.resultDownloadUrl = resultDownloadUrl;
  this.resultExpiryTime = resultExpiryTime;
  this.processingTimeMs = new Date() - this.createdAt;
  
  return this.save();
};

operationSchema.methods.fail = async function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.completedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Operation', operationSchema);