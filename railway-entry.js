#!/usr/bin/env node

console.log("Starting PDFSpark API from railway-entry.js");
console.log("Current directory:", process.cwd());
console.log("Files in directory:", require('fs').readdirSync('.').join(', '));

// Check for Cloudinary configuration
console.log("Checking Cloudinary configuration...");
if (process.env.CLOUDINARY_CLOUD_NAME && 
    process.env.CLOUDINARY_API_KEY && 
    process.env.CLOUDINARY_API_SECRET) {
  console.log("Cloudinary configuration found:");
  console.log("- Cloud name:", process.env.CLOUDINARY_CLOUD_NAME);
  console.log("- API key:", process.env.CLOUDINARY_API_KEY ? "[SET]" : "[NOT SET]");
  console.log("- API secret:", process.env.CLOUDINARY_API_SECRET ? "[SET]" : "[NOT SET]");
} else {
  console.log("Cloudinary configuration not found or incomplete");
  console.log("- Cloud name:", process.env.CLOUDINARY_CLOUD_NAME || "[NOT SET]");
  console.log("- API key:", process.env.CLOUDINARY_API_KEY ? "[SET]" : "[NOT SET]");
  console.log("- API secret:", process.env.CLOUDINARY_API_SECRET ? "[SET]" : "[NOT SET]");
}

// Create temp directories
const fs = require('fs');
const tempDirs = ['/tmp', '/tmp/uploads', '/tmp/results'];

for (const dir of tempDirs) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } catch (error) {
      console.error(`Error creating directory ${dir}:`, error.message);
    }
  } else {
    console.log(`Directory exists: ${dir}`);
  }
}

// Log environment variables (excluding secrets)
console.log("Environment variables:");
const envVars = Object.keys(process.env)
  .filter(key => !key.includes('SECRET') && !key.includes('KEY') && !key.includes('PASSWORD'))
  .reduce((obj, key) => {
    obj[key] = process.env[key];
    return obj;
  }, {});
console.log(JSON.stringify(envVars, null, 2));

try {
  // Load main application
  console.log("Loading index.js...");
  require('./index.js');
  console.log("Successfully loaded index.js");
} catch (error) {
  console.error("Error loading index.js:", error);
  console.error(error.stack);
  process.exit(1);
}