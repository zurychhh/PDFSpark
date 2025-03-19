/**
 * Comprehensive file upload diagnostics
 * Use this module to debug file upload issues
 * 
 * This module provides tools for diagnosing file upload issues in the PDFSpark application.
 * It includes functions for checking browser compatibility, API connectivity, CORS configuration,
 * and file validation, along with fallback mechanisms for handling problematic environments.
 * 
 * IMPORTANT: This module is designed to be compatible with both newer and older browsers,
 * and provides fallback mechanisms for handling problematic environments.
 * 
 * Version: 1.1.0 - Updated for compatibility with strict TypeScript checking and Railway/Vercel deployment
 */

/**
 * Diagnostic result interface
 */
interface DiagnosticResult {
  /** Whether the diagnostic test was successful */
  success: boolean;
  /** Human-readable message about the diagnostic result */
  message: string;
  /** Optional additional details (varies by test) */
  details?: any;
}

/**
 * Browser compatibility check result
 */
interface BrowserCompatibilityCheck {
  /** Browser info */
  userAgent: string;
  /** Browser name */
  browserName: string;
  /** Browser version */
  browserVersion: string;
  /** Operating system */
  os: string;
  /** Whether the browser is considered compatible with PDFSpark */
  isCompatible: boolean;
  /** Specific feature support details */
  features: {
    formData: boolean;
    fileReader: boolean;
    fetch: boolean;
    xhr: boolean;
    mediaDevices: boolean;
    canvas: boolean;
    webGL: boolean;
  };
}

/**
 * Gets browser information and compatibility details
 */
function getBrowserInfo(): BrowserCompatibilityCheck {
  const ua = navigator.userAgent;
  
  // Extract browser name and version
  let browserName = "Unknown";
  let browserVersion = "Unknown";
  let os = "Unknown";
  
  // OS detection
  if (ua.indexOf("Windows") !== -1) os = "Windows";
  else if (ua.indexOf("Mac") !== -1) os = "macOS";
  else if (ua.indexOf("Linux") !== -1) os = "Linux";
  else if (ua.indexOf("Android") !== -1) os = "Android";
  else if (ua.indexOf("iOS") !== -1 || ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) os = "iOS";
  
  // Browser detection
  if (ua.indexOf("Chrome") !== -1) {
    browserName = "Chrome";
    browserVersion = ua.match(/Chrome\/(\d+\.\d+)/)![1];
  } else if (ua.indexOf("Firefox") !== -1) {
    browserName = "Firefox";
    browserVersion = ua.match(/Firefox\/(\d+\.\d+)/)![1];
  } else if (ua.indexOf("Safari") !== -1) {
    browserName = "Safari";
    browserVersion = ua.match(/Version\/(\d+\.\d+)/)![1];
  } else if (ua.indexOf("Edge") !== -1) {
    browserName = "Edge";
    browserVersion = ua.match(/Edge\/(\d+\.\d+)/)![1];
  } else if (ua.indexOf("MSIE") !== -1 || ua.indexOf("Trident/") !== -1) {
    browserName = "Internet Explorer";
    browserVersion = ua.match(/MSIE (\d+\.\d+)/) ? 
                    ua.match(/MSIE (\d+\.\d+)/)![1] : 
                    "11.0";
  }
  
  // Feature detection
  const supportsFormData = typeof FormData !== "undefined";
  const supportsFileReader = typeof FileReader !== "undefined";
  const supportsFetch = typeof fetch !== "undefined";
  const supportsXHR = typeof XMLHttpRequest !== "undefined";
  const supportsMediaDevices = !!(navigator.mediaDevices);
  
  // Check for canvas support
  let supportsCanvas = false;
  try {
    const canvas = document.createElement('canvas');
    supportsCanvas = !!(canvas.getContext && canvas.getContext('2d'));
  } catch (e) {
    // Canvas not supported
  }
  
  // Check for WebGL support
  let supportsWebGL = false;
  try {
    const canvas = document.createElement('canvas');
    supportsWebGL = !!(window.WebGLRenderingContext && 
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    // WebGL not supported
  }
  
  // Determine overall compatibility
  // For PDFSpark, we need FormData, FileReader, and either Fetch or XHR
  const isCompatible = supportsFormData && supportsFileReader && (supportsFetch || supportsXHR);
  
  return {
    userAgent: ua,
    browserName,
    browserVersion,
    os,
    isCompatible,
    features: {
      formData: supportsFormData,
      fileReader: supportsFileReader,
      fetch: supportsFetch,
      xhr: supportsXHR,
      mediaDevices: supportsMediaDevices,
      canvas: supportsCanvas,
      webGL: supportsWebGL
    }
  };
}

/**
 * Runs a complete set of diagnostics on the file upload system
 */
export const runUploadDiagnostics = async (file?: File): Promise<DiagnosticResult[]> => {
  const results: DiagnosticResult[] = [];
  
  // 1. Check environment configuration
  const envResult = checkEnvironmentConfig();
  results.push(envResult);
  
  // 2. Check API connectivity
  try {
    const apiResult = await checkApiConnectivity();
    results.push(apiResult);
  } catch (error: any) {
    results.push({
      success: false,
      message: 'API connectivity test failed',
      details: { error: error.message }
    });
  }
  
  // 3. Check CORS configuration
  try {
    const corsResult = await checkCorsConfig();
    results.push(corsResult);
  } catch (error: any) {
    results.push({
      success: false,
      message: 'CORS test failed',
      details: { error: error.message }
    });
  }
  
  // 4. Test file validation
  if (file) {
    const validationResult = validateTestFile(file);
    results.push(validationResult);
    
    // 5. Test upload with XHR (if file provided and previous tests passed)
    if (validationResult.success) {
      try {
        const xhrResult = await testXhrUpload(file);
        results.push(xhrResult);
      } catch (error: any) {
        results.push({
          success: false,
          message: 'XHR upload test failed',
          details: { error: error.message }
        });
      }
    }
  }
  
  return results;
};

/**
 * Check the environment configuration for upload-related settings
 */
const checkEnvironmentConfig = (): DiagnosticResult => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  
  // Get session ID from localStorage
  const sessionId = localStorage.getItem('pdfspark_session_id');
  
  // Get values from window.env if environment variables not available
  const windowEnv = (window as any).env || {};
  
  // Check for Feature-Policy/Permissions-Policy support in a type-safe way
  const checkFeaturePolicy = (): string => {
    try {
      // Check if the feature policy API exists on document
      // Need to use type assertion since TypeScript doesn't recognize this API
      const featPolicy = (document as any).featurePolicy;
      
      if (featPolicy && typeof featPolicy.allowedFeatures === 'function') {
        return `Supported: ${featPolicy.allowedFeatures().join(', ')}`;
      } else {
        return 'Not supported in this browser';
      }
    } catch (e) {
      return 'Error checking feature policy';
    }
  };

  // Get detailed browser information
  const browserInfo = getBrowserInfo();

  const config = {
    // Environment variables
    VITE_API_URL: apiUrl || windowEnv.VITE_API_URL || 'Not defined',
    VITE_API_BASE_URL: apiBaseUrl || windowEnv.VITE_API_BASE_URL || 'Not defined',
    VITE_MOCK_API: import.meta.env.VITE_MOCK_API || windowEnv.VITE_MOCK_API || 'Not defined',
    VITE_MAX_FILE_SIZE_FREE: import.meta.env.VITE_MAX_FILE_SIZE_FREE || windowEnv.VITE_MAX_FILE_SIZE_FREE || 'Not defined',
    VITE_MAX_FILE_SIZE_PREMIUM: import.meta.env.VITE_MAX_FILE_SIZE_PREMIUM || windowEnv.VITE_MAX_FILE_SIZE_PREMIUM || 'Not defined',
    
    // Session information
    sessionId: sessionId || 'Not set',
    
    // Browser information
    browser: browserInfo.browserName + ' ' + browserInfo.browserVersion,
    os: browserInfo.os,
    isCompatible: browserInfo.isCompatible,
    features: browserInfo.features,
    featurePolicy: checkFeaturePolicy()
  };
  
  // Check if essential config is available
  const hasApiUrl = apiUrl !== undefined && apiUrl !== '';
  
  return {
    success: hasApiUrl && browserInfo.isCompatible,
    message: !hasApiUrl 
      ? 'Missing API URL in environment configuration' 
      : !browserInfo.isCompatible 
        ? 'Browser may not be fully compatible with PDFSpark' 
        : 'Environment configuration is valid',
    details: config
  };
};

/**
 * Check basic API connectivity
 */
const checkApiConnectivity = async (): Promise<DiagnosticResult> => {
  // Try multiple possible API URLs based on common development ports
  const possibleApiUrls = [
    import.meta.env.VITE_API_URL || 'http://localhost:5001',
    'http://localhost:5001',
    'http://localhost:5000', 
    'http://localhost:3000',
    'http://localhost:8080',
    window.location.origin // Try the same origin as the frontend
  ];
  
  // Log all URLs we're going to try
  console.log('Trying API connectivity with URLs:', possibleApiUrls);
  
  // Try each URL in sequence until one works
  for (let i = 0; i < possibleApiUrls.length; i++) {
    const apiUrl = possibleApiUrls[i];
    const pingUrl = `${apiUrl}/api/diagnostic/ping`;
    console.log(`Testing API connectivity with URL: ${pingUrl} (attempt ${i+1}/${possibleApiUrls.length})`);
    
    try {
      // Try with XHR first
      const result = await testApiUrl(apiUrl, pingUrl);
      if (result.success) {
        console.log(`Found working API URL: ${apiUrl}`);
        
        // Save the working URL to localStorage for future use
        localStorage.setItem('pdfspark_working_api_url', apiUrl);
        
        return result;
      }
      console.log(`API URL ${apiUrl} failed:`, result.details?.error || 'Unknown error');
    } catch (error) {
      console.error(`Error testing API URL ${apiUrl}:`, error);
    }
  }
  
  // If we get here, all URLs failed
  return {
    success: false,
    message: 'API connectivity test failed for all possible URLs',
    details: {
      testedUrls: possibleApiUrls
    }
  };
};

/**
 * Helper to test a single API URL
 */
const testApiUrl = (apiUrl: string, pingUrl: string): Promise<DiagnosticResult> => {
  return new Promise<DiagnosticResult>((resolve) => {
    // Try with XMLHttpRequest for maximum browser compatibility
    const xhr = new XMLHttpRequest();
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const responseData = JSON.parse(xhr.responseText);
            
            // Get headers manually
            const headers: Record<string, string> = {};
            const rawHeaders = xhr.getAllResponseHeaders().split('\r\n');
            rawHeaders.forEach(header => {
              if (header) {
                const parts = header.split(': ');
                if (parts.length === 2) {
                  headers[parts[0]] = parts[1];
                }
              }
            });
            
            resolve({
              success: true,
              message: 'API connectivity test successful',
              details: {
                apiUrl: pingUrl,
                response: responseData,
                headers,
                statusCode: xhr.status,
                method: 'XMLHttpRequest'
              }
            });
          } catch (parseError) {
            resolve({
              success: false,
              message: 'API response parsing failed',
              details: {
                status: xhr.status,
                responseText: xhr.responseText.substring(0, 100) + '...',
                error: (parseError as Error).message,
                url: pingUrl,
                method: 'XMLHttpRequest'
              }
            });
          }
        } else {
          resolve({
            success: false,
            message: `API responded with status ${xhr.status}`,
            details: {
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText?.substring(0, 100),
              url: pingUrl,
              method: 'XMLHttpRequest'
            }
          });
        }
      }
    };
    
    xhr.onerror = function() {
      resolve({
        success: false,
        message: 'API connectivity test failed (network error)',
        details: {
          error: 'Network error occurred',
          url: pingUrl,
          method: 'XMLHttpRequest'
        }
      });
    };
    
    xhr.ontimeout = function() {
      resolve({
        success: false,
        message: 'API connectivity test timed out',
        details: {
          error: 'Request timed out',
          url: pingUrl,
          method: 'XMLHttpRequest',
          timeout: xhr.timeout
        }
      });
    };
    
    // Set timeout and open connection
    xhr.timeout = 5000; // 5 seconds
    xhr.open('GET', pingUrl, true);
    
    // Set headers
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Diagnostic', 'true');
    
    // Send request
    xhr.send();
  });
};

/**
 * Check CORS configuration
 */
const checkCorsConfig = async (): Promise<DiagnosticResult> => {
  // Get the working API URL if available
  const apiUrl = localStorage.getItem('pdfspark_working_api_url') || 
                import.meta.env.VITE_API_URL || 
                'http://localhost:5001';
  
  const corsTestUrl = `${apiUrl}/api/diagnostic/cors-test`;
  
  try {
    // Send OPTIONS request to check CORS
    const response = await fetch(corsTestUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': window.location.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,X-Session-ID'
      }
    });
    
    // Check CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
      'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
    };
    
    const corsConfigured = corsHeaders['Access-Control-Allow-Origin'] !== null;
    
    return {
      success: corsConfigured,
      message: corsConfigured ? 'CORS appears to be properly configured' : 'CORS headers missing',
      details: {
        corsHeaders,
        status: response.status,
        statusText: response.statusText
      }
    };
  } catch (error: any) {
    // If fetch fails completely, might be a CORS issue
    return {
      success: false,
      message: 'CORS test failed - likely CORS is not configured correctly',
      details: {
        error: error.message,
        url: corsTestUrl
      }
    };
  }
};

/**
 * Validate test file for upload 
 */
const validateTestFile = (file: File): DiagnosticResult => {
  // Check if file is valid
  if (!file) {
    return {
      success: false,
      message: 'No file provided for validation',
    };
  }
  
  // Check file size
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return {
      success: false,
      message: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds limit (5MB)`,
      details: {
        fileName: file.name,
        fileSize: file.size,
        maxSize
      }
    };
  }
  
  // Check file type for PDFs
  if (file.type === 'application/pdf') {
    return {
      success: true,
      message: 'File validation successful',
      details: {
        fileName: file.name,
        fileType: file.type,
        fileSize: `${(file.size / 1024).toFixed(2)} KB`,
        lastModified: new Date(file.lastModified).toISOString()
      }
    };
  } else {
    return {
      success: false,
      message: `Invalid file type: ${file.type}. Expected application/pdf.`,
      details: {
        fileName: file.name,
        fileType: file.type,
        expectedType: 'application/pdf'
      }
    };
  }
};

/**
 * Test file upload using multiple strategies with fallback
 */
const testXhrUpload = (file: File): Promise<DiagnosticResult> => {
  return new Promise((resolve) => {
    // Get working API URL
    const apiUrl = localStorage.getItem('pdfspark_working_api_url') || 
                  import.meta.env.VITE_API_URL ||
                  'http://localhost:5001';
    
    // Get session ID from localStorage
    const sessionId = localStorage.getItem('pdfspark_session_id');
    
    // Determine the API URL
    const uploadUrl = `${apiUrl}/api/diagnostic/upload`;
    
    // Create FormData object
    const formData = new FormData();
    formData.append('file', file);
    
    // Create and configure XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    
    // Log initial attempt
    console.log('Starting diagnostic file upload test to:', uploadUrl);
    
    // Add session ID header if available
    if (sessionId) {
      xhr.setRequestHeader('X-Session-ID', sessionId);
    }
    
    // Add custom headers for diagnostics
    xhr.setRequestHeader('X-Upload-Strategy', 'diagnostic-test');
    xhr.setRequestHeader('X-Diagnostic', 'true');
    
    // Set up progress monitoring
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        console.log(`Upload progress: ${percent}%`);
      }
    };
    
    // Handle response
    xhr.onload = function() {
      let testResponse;
      let responseData;
      
      try {
        responseData = JSON.parse(xhr.responseText);
        console.log('Upload response:', responseData);
      } catch (e) {
        console.error('Error parsing response:', e);
        responseData = {
          parseError: 'Could not parse response as JSON',
          rawResponse: xhr.responseText?.substring(0, 500)
        };
      }
      
      if (xhr.status >= 200 && xhr.status < 300) {
        testResponse = {
          success: true,
          message: 'File upload test successful',
          details: {
            status: xhr.status,
            response: responseData,
            headers: {
              'Content-Type': xhr.getResponseHeader('Content-Type'),
              'X-Session-ID': xhr.getResponseHeader('X-Session-ID'),
              'X-Upload-Method': xhr.getResponseHeader('X-Upload-Method')
            },
            apiUrl: uploadUrl,
            sessionId,
            fileInfo: {
              name: file.name,
              size: file.size,
              type: file.type
            }
          }
        };
      } else {
        testResponse = {
          success: false,
          message: `File upload test failed with status ${xhr.status}`,
          details: {
            status: xhr.status,
            statusText: xhr.statusText,
            response: responseData,
            apiUrl: uploadUrl,
            sessionId,
            fileInfo: {
              name: file.name,
              size: file.size,
              type: file.type
            }
          }
        };
      }
      
      resolve(testResponse);
    };
    
    // Handle error
    xhr.onerror = function() {
      console.error('Network error during diagnostic upload test');
      
      // Try alternative upload method: fetch API with FormData
      console.log('Trying alternative upload with fetch API...');
      
      fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Upload-Strategy': 'diagnostic-test-fallback',
          'X-Diagnostic': 'true',
          ...(sessionId ? {'X-Session-ID': sessionId} : {})
        }
      })
      .then(response => {
        if (response.ok) {
          return response.json().then(data => {
            resolve({
              success: true,
              message: 'File upload test successful (using fetch fallback)',
              details: {
                status: response.status,
                response: data,
                method: 'fetch fallback',
                apiUrl: uploadUrl,
                sessionId,
                fileInfo: {
                  name: file.name,
                  size: file.size,
                  type: file.type
                }
              }
            });
          });
        } else {
          return response.text().then(text => {
            throw new Error(`Server returned ${response.status}: ${text}`);
          });
        }
      })
      .catch(fetchError => {
        console.error('Fetch fallback also failed:', fetchError);
        
        // Last resort: base64 encoding with JSON
        try {
          console.log('Trying final fallback with base64 encoding...');
          
          // Create a reader for the file
          const reader = new FileReader();
          reader.onload = function() {
            const base64data = reader.result as string;
            
            // Use only the base64 part without the data URL prefix
            const base64Content = base64data.split(',')[1];
            
            // Create JSON payload
            const jsonPayload = JSON.stringify({
              filename: file.name,
              mimetype: file.type,
              size: file.size,
              content: base64Content,
              diagnostic: true
            });
            
            // Send with XMLHttpRequest
            const jsonXhr = new XMLHttpRequest();
            jsonXhr.open('POST', uploadUrl, true);
            jsonXhr.setRequestHeader('Content-Type', 'application/json');
            jsonXhr.setRequestHeader('X-Upload-Strategy', 'diagnostic-json-base64');
            jsonXhr.setRequestHeader('X-Diagnostic', 'true');
            
            if (sessionId) {
              jsonXhr.setRequestHeader('X-Session-ID', sessionId);
            }
            
            jsonXhr.onload = function() {
              if (jsonXhr.status >= 200 && jsonXhr.status < 300) {
                try {
                  const jsonResponse = JSON.parse(jsonXhr.responseText);
                  resolve({
                    success: true,
                    message: 'File upload test successful (using base64 JSON fallback)',
                    details: {
                      status: jsonXhr.status,
                      response: jsonResponse,
                      method: 'base64 JSON fallback',
                      apiUrl: uploadUrl,
                      sessionId
                    }
                  });
                } catch (e) {
                  resolve({
                    success: false,
                    message: 'Final upload attempt succeeded but response parsing failed',
                    details: {
                      error: (e as Error).message,
                      apiUrl: uploadUrl,
                      method: 'base64 JSON fallback'
                    }
                  });
                }
              } else {
                resolve({
                  success: false,
                  message: 'All upload strategies failed',
                  details: {
                    status: jsonXhr.status,
                    statusText: jsonXhr.statusText,
                    apiUrl: uploadUrl,
                    sessionId,
                    methods: ['xhr', 'fetch', 'base64 JSON']
                  }
                });
              }
            };
            
            jsonXhr.onerror = function() {
              resolve({
                success: false,
                message: 'All upload strategies failed',
                details: {
                  apiUrl: uploadUrl,
                  sessionId,
                  methods: ['xhr', 'fetch', 'base64 JSON'],
                  error: 'Network error on all attempts'
                }
              });
            };
            
            jsonXhr.send(jsonPayload);
          };
          
          reader.onerror = function() {
            resolve({
              success: false,
              message: 'All upload strategies failed',
              details: {
                apiUrl: uploadUrl,
                sessionId,
                methods: ['xhr', 'fetch'],
                error: 'Could not read file for base64 encoding'
              }
            });
          };
          
          // Start reading the file as data URL
          reader.readAsDataURL(file);
          
        } catch (base64Error) {
          resolve({
            success: false,
            message: 'All upload strategies failed',
            details: {
              apiUrl: uploadUrl,
              sessionId,
              methods: ['xhr', 'fetch'],
              error: `Base64 fallback error: ${(base64Error as Error).message}`
            }
          });
        }
      });
    };
    
    // Handle timeout
    xhr.ontimeout = function() {
      resolve({
        success: false,
        message: 'File upload timed out',
        details: {
          apiUrl: uploadUrl,
          sessionId,
          timeout: xhr.timeout
        }
      });
    };
    
    // Set timeout (10 seconds for quick diagnostics)
    xhr.timeout = 10000;
    
    // Send the request
    try {
      xhr.send(formData);
    } catch (error: any) {
      resolve({
        success: false,
        message: 'Error sending upload request',
        details: {
          error: error.message,
          apiUrl: uploadUrl,
          sessionId
        }
      });
    }
  });
};

/**
 * Create a tiny test PDF for diagnostics
 * @returns A File object containing a minimalist valid PDF
 */
export const createTestPdf = (): File => {
  // Minimalist PDF content that's valid
  const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
  
  // Convert string to Blob
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  
  // Create a File object from the blob
  return new File([blob], 'diagnostic-test.pdf', { type: 'application/pdf' });
};