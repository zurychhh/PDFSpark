/**
 * Utility functions for Cloudinary operations
 * Provides tools for URL testing, generation, and content proxying
 * for the Cloudinary fallback mechanism.
 * 
 * Also includes a robust Cloudinary upload system with retry mechanisms
 * for Railway-safe deployment.
 */
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
require('dotenv').config();

/**
 * Tests if a Cloudinary URL is accessible
 * @param {string} url - The Cloudinary URL to test
 * @param {Object} options - Options for the test
 * @returns {Promise<Object>} - Test result with success status and any error details
 */
const testCloudinaryUrlAccess = async (url, options = {}) => {
  if (!url) {
    return { 
      success: false, 
      error: 'No URL provided',
      status: null 
    };
  }
  
  try {
    // Use HEAD request for efficiency - we only care about status code, not content
    const result = await axios.head(url, { 
      timeout: options.timeout || 2000,
      validateStatus: false // Don't throw for any status code
    });
    
    // Only consider 2xx status codes as success
    return { 
      success: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers
    };
  } catch (error) {
    return { 
      success: false, 
      status: error.response?.status,
      error: error.message,
      isNetworkError: !error.response
    };
  }
};

/**
 * Generate a signed URL for a Cloudinary resource to ensure authorized access
 * @param {string} publicId - The Cloudinary public ID
 * @param {string} format - The file format (extension)
 * @param {Object} options - Options for signing
 * @returns {string} - Signed URL
 */
const generateSignedCloudinaryUrl = (publicId, format, options = {}) => {
  if (!publicId) {
    throw new Error('Public ID is required for generating signed URL');
  }
  
  // Default options
  const defaultOptions = {
    secure: true,
    resource_type: 'auto',
    type: 'upload',
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  };
  
  // Merge with user-provided options
  const signOptions = { ...defaultOptions, ...options };
  
  try {
    // Generate signed URL with attachment flag for download
    const signedUrl = cloudinary.utils.private_download_url(
      publicId,
      format,
      signOptions
    );
    
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed Cloudinary URL:', error);
    throw error;
  }
};

/**
 * Modifies a Cloudinary URL to include download parameters
 * @param {string} url - The original Cloudinary URL
 * @returns {string} - URL with download parameters
 */
const addDownloadParameters = (url) => {
  if (!url) return url;
  
  // Add fl_attachment param if not already present
  if (!url.includes('fl_attachment')) {
    return url.includes('?') 
      ? `${url}&fl_attachment=true` 
      : `${url}?fl_attachment=true`;
  }
  
  return url;
};

/**
 * Extract Cloudinary public ID from a URL
 * @param {string} url - The Cloudinary URL
 * @returns {Object} - Public ID and other info
 */
const extractCloudinaryInfo = (url) => {
  if (!url || !url.includes('cloudinary.com')) {
    return null;
  }
  
  try {
    // Parse the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // Find the upload part index
    const uploadIndex = pathParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    
    // The format is the file extension
    const lastPart = pathParts[pathParts.length - 1];
    const formatMatch = lastPart.match(/\.([a-zA-Z0-9]+)$/);
    const format = formatMatch ? formatMatch[1] : '';
    
    // Public ID is everything after 'upload' and before the last part (with format)
    let publicId;
    if (uploadIndex < pathParts.length - 2) {
      // Multiple parts after 'upload', combine them
      publicId = pathParts.slice(uploadIndex + 1, pathParts.length - 1).join('/');
      publicId += '/' + lastPart.replace(/\.[^/.]+$/, ''); // Add filename without extension
    } else {
      // Just one part after 'upload'
      publicId = lastPart.replace(/\.[^/.]+$/, '');
    }
    
    return {
      publicId,
      format,
      resourceType: pathParts[uploadIndex - 1] || 'image',
      cloudName: urlObj.hostname.split('.')[0]
    };
  } catch (error) {
    console.error('Error extracting Cloudinary info from URL:', error);
    return null;
  }
};

/**
 * Proxies content from a Cloudinary URL through the server
 * Useful when direct access to Cloudinary URLs is blocked
 * @param {string} url - The Cloudinary URL to proxy
 * @param {Object} options - Options for the proxy request
 * @returns {Promise<Object>} - Proxy result with content buffer and metadata
 */
const proxyCloudinaryContent = async (url, options = {}) => {
  if (!url) {
    throw new Error('URL is required for proxying content');
  }
  
  try {
    // Get the content with the specified options
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: options.timeout || 10000,
      validateStatus: false, // Don't throw for any status code
      maxRedirects: options.maxRedirects || 5,
      ...options
    });
    
    // Only consider 2xx status codes as success
    if (response.status < 200 || response.status >= 300) {
      return {
        success: false,
        status: response.status,
        message: `Failed to proxy content: HTTP ${response.status}`
      };
    }
    
    // Return the content and metadata
    return {
      success: true,
      status: response.status,
      data: response.data,
      contentType: response.headers['content-type'],
      contentLength: response.data.length,
      headers: response.headers
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      isNetworkError: !error.response,
      status: error.response?.status
    };
  }
};

/**
 * Try all possible Cloudinary URL variants to access content
 * Goes through multiple fallback approaches and returns the first successful one
 * @param {string} baseUrl - The base Cloudinary URL
 * @param {Object} cloudinaryInfo - Optional info extracted from the URL
 * @returns {Promise<Object>} - Result of the content access attempt
 */
const tryAllUrlVariants = async (baseUrl, cloudinaryInfo = null) => {
  if (!baseUrl) {
    return {
      success: false,
      error: 'No base URL provided'
    };
  }
  
  // If no cloudinaryInfo was provided, try to extract it
  if (!cloudinaryInfo && baseUrl.includes('cloudinary.com')) {
    cloudinaryInfo = extractCloudinaryInfo(baseUrl);
  }
  
  // Create an array of URL variants to try
  const urlVariants = [baseUrl];
  
  // Add URL with download parameter
  urlVariants.push(addDownloadParameters(baseUrl));
  
  // Try URL without query parameters if any
  if (baseUrl.includes('?')) {
    urlVariants.push(baseUrl.split('?')[0]);
  }
  
  // If we have cloudinary info, try direct URL construction
  if (cloudinaryInfo) {
    const directUrl = `https://res.cloudinary.com/${cloudinaryInfo.cloudName}/${cloudinaryInfo.resourceType}/upload/${cloudinaryInfo.publicId}.${cloudinaryInfo.format}`;
    urlVariants.push(directUrl);
    
    // Also try a signed direct URL
    try {
      const signedDirectUrl = generateSignedCloudinaryUrl(
        cloudinaryInfo.publicId,
        cloudinaryInfo.format,
        { resource_type: cloudinaryInfo.resourceType }
      );
      urlVariants.push(signedDirectUrl);
    } catch (err) {
      console.error(`Error generating signed direct URL: ${err.message}`);
    }
  }
  
  // Remove duplicates
  const uniqueVariants = [...new Set(urlVariants)];
  
  // Try each variant until one works
  for (const variant of uniqueVariants) {
    console.log(`Trying Cloudinary URL variant: ${variant}`);
    
    // First check if URL is directly accessible
    const accessResult = await testCloudinaryUrlAccess(variant);
    
    if (accessResult.success) {
      return {
        success: true,
        url: variant,
        useRedirect: true,
        message: 'URL is directly accessible, can use redirect'
      };
    } else {
      console.log(`Direct access failed for ${variant}: ${accessResult.status}`);
      
      // If not directly accessible, try proxying
      const proxyResult = await proxyCloudinaryContent(variant);
      
      if (proxyResult.success) {
        return {
          success: true,
          url: variant,
          useRedirect: false,
          proxyData: proxyResult.data,
          contentType: proxyResult.contentType,
          contentLength: proxyResult.contentLength,
          message: 'Content successfully proxied'
        };
      }
    }
  }
  
  // If we get here, all variants failed
  return {
    success: false,
    error: 'All URL variants failed',
    triedVariants: uniqueVariants.length
  };
};

/**
 * Configure Cloudinary from environment variables
 * Makes sure Cloudinary is properly configured
 * @returns {boolean} - Whether configuration was successful
 */
const configureCloudinary = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Missing Cloudinary configuration variables');
    return false;
  }
  
  // Configure Cloudinary
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
  
  return true;
};

/**
 * Checks if Cloudinary is properly configured
 * @returns {Boolean} True if configured, false otherwise
 */
const isCloudinaryConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

/**
 * Reliable Cloudinary upload with retry mechanism
 * @param {String} filePath Path to file to upload
 * @param {Object} options Upload options
 * @returns {Promise<Object>} Cloudinary upload result
 */
const reliableCloudinaryUpload = async (filePath, options = {}) => {
  // Generate a unique ID for tracking this upload
  const uploadId = options.uploadId || uuidv4();
  const correlationId = options.correlationId || uploadId;
  
  // Create a logger for this upload
  const uploadLogger = logger.child({
    uploadId,
    correlationId,
    filename: path.basename(filePath || 'unknown')
  });
  
  // Check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    uploadLogger.warn('Cloudinary not configured, skipping cloud upload');
    return generateLocalFileInfo(filePath, options);
  }
  
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    uploadLogger.error(`File doesn't exist at path: ${filePath}`);
    return generateLocalFileInfo(filePath, {
      ...options,
      error: `File doesn't exist at path: ${filePath}`
    });
  }
  
  // Default options with better defaults for Railway
  const maxAttempts = options.maxAttempts || 5;
  const baseTimeout = options.baseTimeout || 30000; // 30 seconds
  
  // Enhanced upload options
  const uploadOptions = {
    folder: options.folder || (process.env.RAILWAY_SERVICE_NAME ? 'pdfspark_railway' : 'pdfspark'),
    resource_type: 'auto',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    ...options
  };
  
  // Add Railway-specific tags
  if (process.env.RAILWAY_SERVICE_NAME && (!options.tags || !options.tags.includes('railway'))) {
    uploadOptions.tags = [...(uploadOptions.tags || []), 'railway'];
  }
  
  // Add environment context
  uploadOptions.context = {
    ...(uploadOptions.context || {}),
    environment: process.env.NODE_ENV || 'development',
    railway: process.env.RAILWAY_SERVICE_NAME ? 'true' : 'false',
    correlationId,
    uploadId
  };
  
  uploadLogger.info('Starting Cloudinary upload with retry mechanism', {
    maxAttempts,
    baseTimeout,
    options: uploadOptions
  });
  
  // Try upload with retries and exponential backoff
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      uploadLogger.info(`Cloudinary upload attempt ${attempt}/${maxAttempts}`, {
        filePath,
        attempt
      });
      
      // Increase timeout with each retry
      const timeoutMs = baseTimeout * Math.pow(1.5, attempt - 1);
      uploadOptions.timeout = timeoutMs;
      
      // Upload file to Cloudinary
      const result = await cloudinary.uploader.upload(filePath, uploadOptions);
      
      uploadLogger.info('Cloudinary upload successful', {
        publicId: result.public_id,
        attempt,
        duration: result.duration || 'unknown'
      });
      
      // Add download parameter for easier access
      if (result.secure_url && !result.secure_url.includes('fl_attachment')) {
        result.secure_url = result.secure_url.includes('?') 
          ? `${result.secure_url}&fl_attachment=true` 
          : `${result.secure_url}?fl_attachment=true`;
      }
      
      // Enhance result with metadata
      result._uploadSuccess = true;
      result._uploadTimestamp = new Date().toISOString();
      result._railwayDeployment = !!process.env.RAILWAY_SERVICE_NAME;
      result._uploadId = uploadId;
      result._correlationId = correlationId;
      result._attempt = attempt;
      
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      
      uploadLogger.error(`Cloudinary upload failed (attempt ${attempt}/${maxAttempts})`, {
        error: error.message,
        code: error.code || 'UNKNOWN',
        isLastAttempt
      });
      
      // If this is the last attempt, throw or return local file info
      if (isLastAttempt) {
        if (options.fallbackToLocal) {
          uploadLogger.warn('Falling back to local file storage after all retry attempts failed');
          return generateLocalFileInfo(filePath, {
            ...options,
            error: error.message
          });
        } else {
          throw new Error(`Failed to upload to Cloudinary after ${maxAttempts} attempts: ${error.message}`);
        }
      }
      
      // Otherwise wait before retrying (exponential backoff)
      const delayMs = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, ...
      uploadLogger.info(`Waiting ${delayMs}ms before next retry attempt`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // We should never reach here due to the isLastAttempt check above
  return generateLocalFileInfo(filePath, options);
};

/**
 * Generate a local file info object that mimics Cloudinary response format
 * @param {String} filePath Path to the file
 * @param {Object} options Options including any error information
 * @returns {Object} File info object
 */
function generateLocalFileInfo(filePath, options = {}) {
  const filename = filePath ? path.basename(filePath) : 'unknown-file';
  const fileExists = filePath && fs.existsSync(filePath);
  
  return {
    public_id: filename,
    url: `/api/files/original/${filename}`,
    secure_url: `/api/files/original/${filename}`,
    format: path.extname(filename).replace('.', '') || 'unknown',
    resource_type: 'raw',
    bytes: fileExists ? fs.statSync(filePath).size : 0,
    created_at: new Date().toISOString(),
    original_filename: options.originalFilename || filename,
    _fromLocalStorage: true,
    _cloudinaryError: options.error,
    _railwayDeployment: !!process.env.RAILWAY_SERVICE_NAME,
    _errorTimestamp: options.error ? new Date().toISOString() : undefined,
    _uploadId: options.uploadId,
    _correlationId: options.correlationId
  };
}

/**
 * Class to manage Cloudinary upload queue
 */
class CloudinaryUploadQueue {
  constructor(options = {}) {
    this.queue = new Map();
    this.maxConcurrentUploads = options.concurrency || 3;
    this.activeUploads = 0;
    this.processInterval = null;
    this.started = false;
    this.uploadOptions = options.uploadOptions || {};
    
    // Start the queue processor
    this.start();
  }
  
  /**
   * Add a file to the upload queue
   * @param {String} filePath Path to file to upload
   * @param {Object} options Upload options
   * @returns {Promise<Object>} Promise that resolves with upload ID
   */
  queueUpload(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Generate unique ID for this upload
        const uploadId = options.uploadId || uuidv4();
        
        // Create queue item
        const queueItem = {
          uploadId,
          filePath,
          options: {
            ...this.uploadOptions,
            ...options,
            uploadId
          },
          status: 'queued',
          createdAt: new Date(),
          attempts: 0,
          maxAttempts: options.maxAttempts || 5,
          resolve,
          reject
        };
        
        // Add to queue
        this.queue.set(uploadId, queueItem);
        
        logger.info('File added to Cloudinary upload queue', {
          uploadId,
          filePath: path.basename(filePath),
          queueSize: this.queue.size
        });
        
        return uploadId;
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Start the queue processor
   */
  start() {
    if (this.started) return;
    
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 500);
    
    this.started = true;
    logger.info('Cloudinary upload queue processor started');
  }
  
  /**
   * Stop the queue processor
   */
  stop() {
    if (!this.started) return;
    
    clearInterval(this.processInterval);
    this.processInterval = null;
    this.started = false;
    
    logger.info('Cloudinary upload queue processor stopped');
  }
  
  /**
   * Process the queue
   */
  processQueue() {
    // Skip if we're at max concurrency
    if (this.activeUploads >= this.maxConcurrentUploads) {
      return;
    }
    
    // Find the oldest queued item
    let oldestId = null;
    let oldestTime = null;
    
    for (const [id, item] of this.queue.entries()) {
      if (item.status !== 'queued') continue;
      
      // Check if this item is ready for retry (if it has a nextAttemptAfter)
      if (item.nextAttemptAfter && item.nextAttemptAfter > new Date()) {
        continue;
      }
      
      if (oldestTime === null || item.createdAt < oldestTime) {
        oldestId = id;
        oldestTime = item.createdAt;
      }
    }
    
    // If no queued items, do nothing
    if (oldestId === null) return;
    
    // Get the item
    const item = this.queue.get(oldestId);
    
    // Update status
    item.status = 'processing';
    this.activeUploads++;
    
    // Process the upload
    this.processUpload(item);
  }
  
  /**
   * Process an upload
   * @param {Object} item Queue item to process
   */
  async processUpload(item) {
    try {
      logger.info('Processing Cloudinary upload from queue', {
        uploadId: item.uploadId,
        filePath: path.basename(item.filePath || 'unknown'),
        attempt: item.attempts + 1
      });
      
      // Increment attempt counter
      item.attempts++;
      
      // Upload to Cloudinary with retry mechanism
      const result = await reliableCloudinaryUpload(
        item.filePath,
        {
          ...item.options,
          // Don't use reliableCloudinaryUpload's retry mechanism
          maxAttempts: 1
        }
      );
      
      // Update status
      item.status = 'completed';
      item.result = result;
      
      // Resolve the promise
      item.resolve(result);
      
      // Remove from queue
      this.queue.delete(item.uploadId);
      
      logger.info('Cloudinary upload from queue completed', {
        uploadId: item.uploadId,
        publicId: result.public_id
      });
    } catch (error) {
      logger.error('Cloudinary upload from queue failed', {
        uploadId: item.uploadId,
        error: error.message
      });
      
      // Check if we should retry
      if (item.attempts < item.maxAttempts) {
        // Set status back to queued for retry
        item.status = 'queued';
        
        // Calculate delay before next attempt
        const delayMs = 1000 * Math.pow(2, item.attempts);
        item.nextAttemptAfter = new Date(Date.now() + delayMs);
        
        logger.info('Requeuing Cloudinary upload for retry', {
          uploadId: item.uploadId,
          attempt: item.attempts,
          maxAttempts: item.maxAttempts,
          delayMs,
          nextAttemptAfter: item.nextAttemptAfter
        });
      } else {
        // Max retries reached, mark as failed
        item.status = 'failed';
        item.error = error;
        
        // If configured to fall back to local storage
        if (item.options.fallbackToLocal) {
          logger.warn('All Cloudinary upload attempts failed, falling back to local storage', {
            uploadId: item.uploadId
          });
          
          // Generate local file info
          const localFileInfo = generateLocalFileInfo(item.filePath, {
            ...item.options,
            error: error.message
          });
          
          // Resolve with local file info
          item.resolve(localFileInfo);
        } else {
          // Reject the promise
          item.reject(error);
        }
        
        // Remove from queue
        this.queue.delete(item.uploadId);
      }
    } finally {
      // Decrement active uploads counter
      this.activeUploads--;
    }
  }
  
  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      queueSize: this.queue.size,
      activeUploads: this.activeUploads,
      maxConcurrentUploads: this.maxConcurrentUploads,
      started: this.started
    };
  }
}

// Create a singleton instance
const cloudinaryUploadQueue = new CloudinaryUploadQueue();

module.exports = {
  testCloudinaryUrlAccess,
  generateSignedCloudinaryUrl,
  addDownloadParameters,
  extractCloudinaryInfo,
  proxyCloudinaryContent,
  tryAllUrlVariants,
  configureCloudinary,
  isCloudinaryConfigured,
  reliableCloudinaryUpload,
  cloudinaryUploadQueue,
  generateLocalFileInfo
};