/**
 * Utility functions for Cloudinary operations
 * Provides tools for URL testing, generation, and content proxying
 * for the Cloudinary fallback mechanism
 */
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
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

module.exports = {
  testCloudinaryUrlAccess,
  generateSignedCloudinaryUrl,
  addDownloadParameters,
  extractCloudinaryInfo,
  proxyCloudinaryContent,
  tryAllUrlVariants,
  configureCloudinary
};