#!/usr/bin/env node

/**
 * Railway specific startup script
 * This script ensures proper port binding and provides
 * additional diagnostics for Railway deployment
 */

console.log('=======================================');
console.log('Railway Entry Script - Starting Server');
console.log('=======================================');

// Log environment
console.log(`Node Version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`PORT: ${process.env.PORT}`);
console.log(`MongoDB URI exists: ${!!process.env.MONGODB_URI}`);
console.log(`Railway Public Domain: ${process.env.RAILWAY_PUBLIC_DOMAIN}`);

// Start actual application
console.log('Starting server via index.js...');
require('./backend/index.js');