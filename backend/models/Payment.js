const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sessionId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  operationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Operation'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'paypal', 'subscription', 'credits'],
    required: true
  },
  stripePaymentIntentId: String,
  stripeSessionId: String,
  status: {
    type: String,
    enum: ['pending', 'successful', 'failed', 'refunded'],
    default: 'pending'
  },
  itemType: {
    type: String,
    enum: ['operation', 'subscription', 'credits'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add index for faster queries
if (paymentSchema.index) {
  paymentSchema.index({ userId: 1, createdAt: -1 });
  paymentSchema.index({ sessionId: 1, createdAt: -1 });
  paymentSchema.index({ operationId: 1 });
  paymentSchema.index({ status: 1 });
}

module.exports = mongoose.model('Payment', paymentSchema);