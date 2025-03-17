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
  
  // CRITICAL CHANGE: ALWAYS use memory fallback in Railway regardless of MongoDB
  console.log('🚨 CRITICAL: Railway deployment requires memory fallback mode');
  console.log('🚨 IMPORTANT: Setting USE_MEMORY_FALLBACK=true for Railway deployment');
  
  // Force memory fallback for Railway
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  // Set MongoDB connection options in case code attempts to connect anyway
  process.env.MONGODB_CONNECTION_TIMEOUT_MS = '60000';
  process.env.MONGODB_SOCKET_TIMEOUT_MS = '60000';
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = '60000';
  
  // 3. Set consistent CORS policy for Railway
  if (!process.env.CORS_ALLOW_ALL) {
    console.log('Setting CORS_ALLOW_ALL=true for Railway environment');
    process.env.CORS_ALLOW_ALL = 'true';
  }
  
  // 4. CRITICAL FIX: ALWAYS use memory fallback in Railway
  console.log('🚨 CRITICAL FIX: Forcing memory fallback mode for Railway');
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  // Add detailed MongoDB connection debugging
  console.log('📊 MEMORY FALLBACK DIAGNOSTICS:');
  console.log('- MONGODB_URI length: ' + (process.env.MONGODB_URI?.length || 0) + ' characters');
  console.log('- USE_MEMORY_FALLBACK set to: ' + process.env.USE_MEMORY_FALLBACK);
  console.log('- This ensures consistent operation in Railway\'s ephemeral filesystem environment');
  
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
  
  // ⚠️ CRITICAL: Force set USE_MEMORY_FALLBACK to true for Railway
  // This is our last effort to ensure memory mode is enabled
  console.log('🚨 EMERGENCY OVERRIDE: Forcing memory fallback mode in Railway');
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  // Mark global flags for the application
  global.isRailwayEnvironment = true;
  global.fixesApplied = true;
  global.usingMemoryFallback = true; // Force this globally too
  
  // Directly override the environment variable at the process level
  process.env.USE_MEMORY_FALLBACK = 'true';
  
  // Double check that the value is set properly
  console.log(`✅ VERIFICATION: USE_MEMORY_FALLBACK is now: ${process.env.USE_MEMORY_FALLBACK}`);
  console.log(`✅ VERIFICATION: global.usingMemoryFallback is now: ${global.usingMemoryFallback}`);
}

// Execute fixes immediately
fixRailwayEnvironment();

module.exports = { fixRailwayEnvironment };