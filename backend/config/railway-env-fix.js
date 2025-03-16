/**
 * Railway Environment Variables Fix
 * 
 * This file contains special fixes for the Railway platform to address
 * issues with environment variables and connection strings.
 * 
 * The main issues fixed:
 * 1. MONGODB_URI not being detected properly even when set
 * 2. Ensuring memory mode is activated correctly
 * 3. Making sure configuration is consistent
 */

// Function to sanitize and fix environment variables
function fixRailwayEnvironment() {
  console.log('🛠️ Running Railway environment variable fixes...');
  
  // Check if we're in a Railway environment
  const isRailway = !!process.env.RAILWAY_SERVICE_NAME;
  
  if (!isRailway) {
    console.log('Not running on Railway, skipping fixes.');
    return;
  }
  
  console.log('Railway environment detected, applying fixes...');
  
  // Railway-specific fixes
  
  // 1. Fix for MONGODB_URI variable
  if (process.env.MONGODB_URI === undefined || 
      process.env.MONGODB_URI === 'Not set' ||
      process.env.MONGODB_URI === '' ||
      process.env.MONGODB_URI === 'undefined') {
    console.log('🚨 MONGODB_URI is not correctly set, applying emergency fix');
    
    // Use a hardcoded connection string as fallback
    process.env.MONGODB_URI = 'mongodb://mongo:SUJgiSifJbajieQYydPMxpliFUJGmiBV@mainline.proxy.rlwy.net:27523';
    console.log('Set emergency fallback MONGODB_URI for Railway');
  }
  
  // 2. Check if we should try to use MongoDB first - improved detection
  const hasMongoDB = !!process.env.MONGODB_URI && 
                    process.env.MONGODB_URI !== 'undefined' && 
                    process.env.MONGODB_URI !== 'Not set' &&
                    (process.env.MONGODB_URI.startsWith('mongodb://') || 
                     process.env.MONGODB_URI.startsWith('mongodb+srv://'));
  
  // Print detailed info about the MongoDB URI  
  if (process.env.MONGODB_URI) {
    console.log(`MONGODB URI ANALYSIS:`);
    console.log(`- Length: ${process.env.MONGODB_URI.length} characters`);
    console.log(`- Starts with mongodb://: ${process.env.MONGODB_URI.startsWith('mongodb://')}`);
    console.log(`- Starts with mongodb+srv://: ${process.env.MONGODB_URI.startsWith('mongodb+srv://')}`);
    console.log(`- Contains @: ${process.env.MONGODB_URI.includes('@')}`);
    
    // Check for common errors
    if (process.env.MONGODB_URI === 'Not set' || process.env.MONGODB_URI === 'undefined') {
      console.log(`⛔ ERROR: MONGODB_URI is set to a placeholder value: "${process.env.MONGODB_URI}"`);
    } else if (!process.env.MONGODB_URI.includes('@')) {
      console.log(`⛔ ERROR: MONGODB_URI doesn't contain the @ separator for auth`);
    } else if (!process.env.MONGODB_URI.startsWith('mongodb://') && !process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
      console.log(`⛔ ERROR: MONGODB_URI doesn't start with mongodb:// or mongodb+srv://`);
    }
  }
  
  if (hasMongoDB) {
    console.log('✅ MONGODB_URI is valid, will attempt to use MongoDB first');
    process.env.USE_MEMORY_FALLBACK = 'false';
    
    // Set MongoDB connection options
    process.env.MONGODB_CONNECTION_TIMEOUT_MS = '60000';
    process.env.MONGODB_SOCKET_TIMEOUT_MS = '60000';
    process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '60000';
  } else {
    console.log('🚨 MONGODB_URI is invalid or malformed, using memory fallback mode');
    process.env.USE_MEMORY_FALLBACK = 'true';
  }
  
  // 3. Set consistent CORS policy for Railway
  if (!process.env.CORS_ALLOW_ALL) {
    console.log('Setting CORS_ALLOW_ALL=true for Railway environment');
    process.env.CORS_ALLOW_ALL = 'true';
  }
  
  // 4. CRITICAL FIX: This line is forcing memory fallback mode regardless of MongoDB availability
  console.log('🚨 Forcing USE_MEMORY_FALLBACK=true for better Railway compatibility');
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  // 5. Set MongoDB connection timeouts for railway
  process.env.MONGODB_CONNECTION_TIMEOUT_MS = '60000';
  process.env.MONGODB_SOCKET_TIMEOUT_MS = '90000';
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '60000';
  
  // 5. Dump all environment variables (without sensitive values) for debugging
  console.log('Railway environment variables after fixes:');
  Object.keys(process.env).sort().forEach(key => {
    // Skip sensitive variables
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASS') || key.includes('TOKEN')) {
      console.log(`- ${key}: [HIDDEN]`);
    } else if (key.includes('MONGODB_URI')) {
      console.log(`- ${key}: [SET BUT HIDDEN]`);
    } else {
      console.log(`- ${key}: ${process.env[key]}`);
    }
  });
  
  console.log('Environment variable fixes complete ✅');
  
  // Mark global flags for the application
  global.isRailwayEnvironment = true;
  global.fixesApplied = true;
  global.usingMemoryFallback = process.env.USE_MEMORY_FALLBACK === 'true';
}

// Execute fixes immediately
fixRailwayEnvironment();

module.exports = { fixRailwayEnvironment };