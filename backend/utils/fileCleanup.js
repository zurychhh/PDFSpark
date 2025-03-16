const fs = require('fs');
const path = require('path');
const os = require('os');

// Tracking metrics for file operations
const fileStats = {
  uploads: {
    totalUploads: 0,
    totalBytes: 0,
    successfulUploads: 0,
    failedUploads: 0,
    lastUploadTime: null,
    uploadsByMethod: {
      'disk_storage': 0,
      'memory_fallback': 0,
      'json_base64': 0,
      'standard': 0
    }
  },
  storage: {
    lastCleanupTime: null,
    totalBytesRecovered: 0,
    lastCleanupStats: null
  },
  downloads: {
    totalDownloads: 0,
    lastDownloadTime: null
  }
};

/**
 * Record a file upload operation for statistics
 * @param {boolean} success - Whether the upload succeeded
 * @param {number} sizeBytes - Size of the uploaded file in bytes
 * @param {string} method - Upload method used
 */
const recordUpload = (success, sizeBytes, method = 'standard') => {
  fileStats.uploads.totalUploads++;
  fileStats.uploads.lastUploadTime = new Date();
  
  if (success) {
    fileStats.uploads.successfulUploads++;
    fileStats.uploads.totalBytes += (sizeBytes || 0);
  } else {
    fileStats.uploads.failedUploads++;
  }
  
  if (method && fileStats.uploads.uploadsByMethod.hasOwnProperty(method)) {
    fileStats.uploads.uploadsByMethod[method]++;
  } else {
    fileStats.uploads.uploadsByMethod.standard++;
  }
  
  // Log status periodically
  if (fileStats.uploads.totalUploads % 10 === 0) {
    console.log(`Upload stats: ${fileStats.uploads.successfulUploads}/${fileStats.uploads.totalUploads} successful, ${formatBytes(fileStats.uploads.totalBytes)} total`);
  }
};

/**
 * Record a file download operation for statistics
 * @param {string} fileId - ID of the downloaded file
 * @param {number} sizeBytes - Size of the downloaded file in bytes
 */
const recordDownload = (fileId, sizeBytes) => {
  fileStats.downloads.totalDownloads++;
  fileStats.downloads.lastDownloadTime = new Date();
  
  // Could add more detailed tracking here if needed
};

/**
 * Format bytes into human-readable string
 */
const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Cleanup temporary files that are older than the specified age
 * @param {string} directory - Directory to clean up
 * @param {number} maxAgeHours - Maximum age in hours before file is deleted
 * @returns {Object} - Cleanup statistics
 */
const cleanupDirectory = (directory, maxAgeHours = 24) => {
  if (!fs.existsSync(directory)) {
    console.log(`Directory ${directory} does not exist, skipping cleanup`);
    return { cleaned: 0, errors: 0, skipped: 0, bytesRecovered: 0 };
  }

  const now = new Date();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const stats = { cleaned: 0, errors: 0, skipped: 0, bytesRecovered: 0 };

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
          const fileSize = fileStats.size;
          fs.unlinkSync(filePath);
          console.log(`Deleted old file: ${filePath} (age: ${Math.round(fileAge / (60 * 60 * 1000))} hours, size: ${formatBytes(fileSize)})`);
          stats.cleaned++;
          stats.bytesRecovered += fileSize;
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
    return { cleaned: 0, errors: 1, skipped: 0, bytesRecovered: 0, error: error.message };
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
  console.log(`Uploads cleanup: ${uploadStats.cleaned} files deleted (${formatBytes(uploadStats.bytesRecovered)}), ${uploadStats.skipped} skipped, ${uploadStats.errors} errors`);
  
  // Clean up temp directory - keep files for 24 hours
  const tempStats = cleanupDirectory(tempDir, 24);
  console.log(`Temp cleanup: ${tempStats.cleaned} files deleted (${formatBytes(tempStats.bytesRecovered)}), ${tempStats.skipped} skipped, ${tempStats.errors} errors`);
  
  // Update statistics
  fileStats.storage.lastCleanupTime = new Date();
  fileStats.storage.totalBytesRecovered += (uploadStats.bytesRecovered + tempStats.bytesRecovered);
  fileStats.storage.lastCleanupStats = {
    uploads: uploadStats,
    temp: tempStats
  };
  
  console.log('File cleanup completed');
  
  return {
    uploads: uploadStats,
    temp: tempStats,
    timestamp: new Date().toISOString(),
    totalBytesRecovered: formatBytes(uploadStats.bytesRecovered + tempStats.bytesRecovered)
  };
};

/**
 * Get system storage statistics
 */
const getStorageStats = () => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const tempDir = process.env.TEMP_DIR || './temp';
  
  return {
    fileStats,
    system: {
      freemem: formatBytes(os.freemem()),
      totalmem: formatBytes(os.totalmem()),
      uptime: Math.floor(os.uptime() / 3600) + ' hours',
      cpus: os.cpus().length,
      platform: os.platform(),
      hostname: os.hostname()
    },
    directories: {
      uploads: directoryStats(uploadDir),
      temp: directoryStats(tempDir)
    }
  };
};

/**
 * Get statistics about a directory
 */
const directoryStats = (directory) => {
  if (!fs.existsSync(directory)) {
    return { exists: false };
  }
  
  try {
    const files = fs.readdirSync(directory);
    let totalSize = 0;
    let fileCount = 0;
    
    files.forEach(file => {
      try {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      } catch (error) {
        // Ignore errors for individual files
      }
    });
    
    return {
      exists: true,
      fileCount,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize)
    };
  } catch (error) {
    return { exists: true, error: error.message };
  }
};

module.exports = {
  cleanupDirectory,
  runCleanup,
  recordUpload,
  recordDownload,
  getStorageStats,
  formatBytes
};