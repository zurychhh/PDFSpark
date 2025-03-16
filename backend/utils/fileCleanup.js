const fs = require('fs');
const path = require('path');

/**
 * Cleanup temporary files that are older than the specified age
 * @param {string} directory - Directory to clean up
 * @param {number} maxAgeHours - Maximum age in hours before file is deleted
 * @returns {Object} - Cleanup statistics
 */
const cleanupDirectory = (directory, maxAgeHours = 24) => {
  if (!fs.existsSync(directory)) {
    console.log(`Directory ${directory} does not exist, skipping cleanup`);
    return { cleaned: 0, errors: 0, skipped: 0 };
  }

  const now = new Date();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const stats = { cleaned: 0, errors: 0, skipped: 0 };

  try {
    const files = fs.readdirSync(directory);
    
    files.forEach(file => {
      try {
        const filePath = path.join(directory, file);
        const fileStats = fs.statSync(filePath);
        
        // Skip directories
        if (fileStats.isDirectory()) {
          stats.skipped++;
          return;
        }
        
        const fileAge = now - fileStats.mtime;
        
        // Delete file if it's older than maxAgeHours
        if (fileAge > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old file: ${filePath} (age: ${Math.round(fileAge / (60 * 60 * 1000))} hours)`);
          stats.cleaned++;
        } else {
          stats.skipped++;
        }
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
        stats.errors++;
      }
    });
    
    return stats;
  } catch (error) {
    console.error(`Error cleaning directory ${directory}:`, error);
    return { cleaned: 0, errors: 1, skipped: 0, error: error.message };
  }
};

/**
 * Run cleanup on all temporary directories
 */
const runCleanup = () => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const tempDir = process.env.TEMP_DIR || './temp';
  
  console.log('Starting scheduled file cleanup...');
  
  // Clean up uploads directory - keep files for 48 hours
  const uploadStats = cleanupDirectory(uploadDir, 48);
  console.log(`Uploads cleanup: ${uploadStats.cleaned} files deleted, ${uploadStats.skipped} skipped, ${uploadStats.errors} errors`);
  
  // Clean up temp directory - keep files for 24 hours
  const tempStats = cleanupDirectory(tempDir, 24);
  console.log(`Temp cleanup: ${tempStats.cleaned} files deleted, ${tempStats.skipped} skipped, ${tempStats.errors} errors`);
  
  console.log('File cleanup completed');
  
  return {
    uploads: uploadStats,
    temp: tempStats,
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  cleanupDirectory,
  runCleanup
};