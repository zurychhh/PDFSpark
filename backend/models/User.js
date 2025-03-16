const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    sparse: true, // Allows null values but ensures uniqueness when provided
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return v === null || /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    select: false
  },
  name: {
    type: String,
    trim: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'canceled', 'expired'],
      default: 'active'
    },
    validUntil: {
      type: Date
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String
  },
  operationCredits: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isGuest: {
    type: Boolean,
    default: true
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  verifyEmailToken: String,
  verifyEmailExpire: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  // Only run this function if password was modified
  if (!this.isModified('password')) {
    return next();
  }

  // Hash the password with cost of 12
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user has an active subscription
userSchema.methods.hasActiveSubscription = function() {
  return (
    (this.subscription.plan === 'basic' || this.subscription.plan === 'pro') &&
    this.subscription.status === 'active' &&
    (this.subscription.validUntil === null || 
     this.subscription.validUntil > new Date())
  );
};

// Check if user is on Pro plan
userSchema.methods.isProUser = function() {
  return (
    this.subscription.plan === 'pro' &&
    this.subscription.status === 'active' &&
    (this.subscription.validUntil === null || 
     this.subscription.validUntil > new Date())
  );
};

module.exports = mongoose.model('User', userSchema);