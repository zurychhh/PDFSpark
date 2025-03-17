import apiClient from './api';

export type ConversionFormat = 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'txt';

export interface UploadResponse {
  success: boolean;
  fileId: string;
  fileName: string;
  fileSize: number;
  uploadDate: string;
  expiryDate: string;
  previewUrl?: string;
}

export interface ConversionResponse {
  success: boolean;
  operationId: string;
  estimatedTime: number;
  isPremium: boolean;
  price?: number;
  currency?: string;
}

export interface ConversionStatusResponse {
  operationId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  estimatedTimeRemaining: number;
  resultFileId?: string;
  errorMessage?: string;
}

export interface ConversionResultResponse {
  success: boolean;
  downloadUrl: string;
  expiryTime: string;
  fileName: string;
  fileSize: number;
  originalSize?: number;
  resultSize?: number;
  compressionRatio?: number;
}

// Flag to enable mock mode for development/testing
const MOCK_API = typeof import.meta !== 'undefined' && import.meta.env.VITE_MOCK_API === 'true';

// Check and log API mode for debugging
console.log(`API Mode: ${MOCK_API ? 'MOCK' : 'REAL'}, ENV: ${typeof import.meta !== 'undefined' ? import.meta.env.MODE : 'production'}`);

// We're in production mode if MOCK_API is false

/**
 * Mock implementations for development/testing
 */
const mockUploadFile = async (file: File): Promise<UploadResponse> => {
  // Simulate realistic network delay based on file size
  const delay = Math.min(2000, file.size / 10000); // Minimum 2s, adjusted by file size
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Get a unique id for the file
  const mockFileId = `mock-file-${Date.now()}`;
  
  return {
    success: true,
    fileId: mockFileId,
    fileName: file.name,
    fileSize: file.size,
    uploadDate: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    previewUrl: 'https://via.placeholder.com/150',
  };
};

const mockConvertPDF = async (
  fileId: string,
  targetFormat: ConversionFormat
): Promise<ConversionResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // This is a placeholder for fileId validation when in production mode
  // In production, we'd validate the fileId against stored files
  console.debug(`Converting file with ID: ${fileId}`); // Use fileId to avoid unused variable warning
  
  // Simulate that some formats are premium
  const isPremium = ['xlsx', 'pptx'].includes(targetFormat);
  
  // Include the target format in the operationId for reference in mockGetConversionResult
  return {
    success: true,
    operationId: `mock-op-${Date.now()}-format-${targetFormat}`,
    estimatedTime: 20,
    isPremium,
    price: isPremium ? 1.99 : undefined,
    currency: isPremium ? 'USD' : undefined,
  };
};

const mockGetConversionStatus = async (
  operationId: string,
  attempt = 0
): Promise<ConversionStatusResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Calculate progress based on attempt number (simulate progressing conversion)
  const progress = Math.min(100, attempt * 20);
  
  return {
    operationId,
    status: progress >= 100 ? 'completed' : 'processing',
    progress,
    estimatedTimeRemaining: Math.max(0, 20 - attempt * 4),
    resultFileId: progress >= 100 ? `mock-result-${Date.now()}` : undefined,
  };
};

const mockGetConversionResult = async (
  operationId: string
): Promise<ConversionResultResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 700));
  
  // Extract format from operationId if available (in real implementation, we'd store this information)
  const formatMatch = operationId.match(/format-(docx|xlsx|pptx|jpg|txt)/);
  const format = formatMatch ? formatMatch[1] : 'docx'; // Default to docx if not found
  
  // Generate format-specific details
  let fileName, fileSize;
  switch (format) {
    case 'jpg':
      fileName = 'converted-document.jpg';
      fileSize = 1024 * 1024 * 1; // 1MB for image
      break;
    case 'xlsx':
      fileName = 'converted-document.xlsx';
      fileSize = 1024 * 1024 * 0.5; // 0.5MB for spreadsheet
      break;
    case 'pptx':
      fileName = 'converted-document.pptx';
      fileSize = 1024 * 1024 * 3; // 3MB for presentation
      break;
    case 'txt':
      fileName = 'converted-document.txt';
      fileSize = 1024 * 100; // 100KB for text
      break;
    default: // docx
      fileName = 'converted-document.docx';
      fileSize = 1024 * 1024 * 2; // 2MB for document
  }
  
  // W trybie mockowym tworzymy faktyczny plik z treścią do pobrania
  // Generujemy przykładowy blob z tekstem, który będzie różny dla każdego formatu
  let fileContent = '';
  let fileType = '';
  
  switch (format) {
    case 'docx':
      // Create a more realistic Word document representation
      // In a real app, we would use an actual DOCX file created by the backend
      fileContent = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>This is a properly converted document from PDF to DOCX format. The content has been extracted and formatted to match the original document as closely as possible.</w:t></w:r></w:p></w:body></w:document>';
      fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      break;
    case 'xlsx':
      fileContent = '<html><body><table><tr><td>Przykładowy</td><td>arkusz</td></tr><tr><td>Excel</td><td>PDFSpark</td></tr></table></body></html>';
      fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    case 'pptx':
      fileContent = '<html><body><h1>Przykładowa prezentacja PowerPoint</h1><p>Wygenerowana przez PDFSpark</p></body></html>';
      fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      break;
    case 'txt':
      fileContent = 'To jest przykładowy plik tekstowy wygenerowany przez PDFSpark.\nZawiera przykładową treść.';
      fileType = 'text/plain';
      break;
    case 'jpg':
      // Dla obrazów tworzymy pusty canvas i konwertujemy go do base64
      fileContent = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAAyAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5LrOvNauBJlP0p9zqLGUj0NV1l8w5Nfa1sRGUuVHy+FwkoR5mSQagxl3ZwfWrMd2zYYd/SqkMRlP0q1HCyjacA96xhCbZ1VJwirs0tL1NjIPmP416HpGrr5ed1eY6eQknzcL6mnXfiB7aTaPnz3FYYzBzaujqwGMhF2Z7L/a8cdvuZhik0/xBG2SrZrxpPGF47Ys4ww7ljir1r4kvHGJHC46KprzamCqcvvHp08wpN+6e0RXKyITnvS5HpXA6P4qlVBsbdnrWlB4uXGC2M+tcE6FSL1R3QrQkrpo3fKHpS+VT9E1BdQhLc/KM8+lWNozXPKUou0jZK6uhgU0eUKqWl/sDI7elWvN4qcyikVdkZXArkbpdkzD3ro5ZckisLVofMkJFe3mNFTSlE8TLa7jNxZQooor5Y+tEyRZxUghKnNJRWkYRZM5yRYguVhGGHFQXlz5/QnFFFbNRirIxTcndsqSAsaZRRWDZ0JWT+lBbNFFSUf/Z';
      fileType = 'image/jpeg';
      break;
    default:
      fileContent = 'Przykładowy plik PDFSpark';
      fileType = 'application/octet-stream';
  }
  
  // Tworzymy URL do pobrania jako data URL
  const downloadUrl = format === 'jpg' 
    ? fileContent 
    : 'data:' + fileType + ';base64,' + btoa(unescape(encodeURIComponent(fileContent)));
  
  return {
    success: true,
    downloadUrl: downloadUrl,
    expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    fileName,
    fileSize,
    originalSize: 1024 * 1024 * 5, // 5MB
    resultSize: fileSize,
    compressionRatio: Math.round((1 - (fileSize / (1024 * 1024 * 5))) * 100), // Calculate based on fileSize
  };
};

/**
 * Upload a file to the server
 * Uses multiple upload strategies with fallbacks for maximum reliability
 * 
 * @param file File to upload
 * @param onProgressUpdate Optional callback to report upload progress (0-100)
 */
export const uploadFile = async (
  file: File, 
  onProgressUpdate?: (progress: number) => void
): Promise<UploadResponse> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    // Simulate progress updates for mock implementation
    if (onProgressUpdate) {
      const simulateProgress = () => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          onProgressUpdate(progress);
          if (progress >= 100) {
            clearInterval(interval);
          }
        }, 300);
      };
      simulateProgress();
    }
    return mockUploadFile(file);
  }

  // Log detailed debugging info
  console.log('===== FILE UPLOAD STARTED =====');
  console.log('API base URL:', apiClient.defaults.baseURL);
  console.log('File details:', {
    name: file.name,
    type: file.type,
    size: `${(file.size / 1024).toFixed(2)} KB`,
    lastModified: new Date(file.lastModified).toISOString()
  });

  // Validate file before proceeding
  if (!file || file.size === 0) {
    console.error('File validation failed: File is empty or invalid');
    throw new Error('Cannot upload an empty file. Please select a valid PDF document.');
  }

  // Extra validation for PDF files
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    try {
      // Read first bytes to verify it's actually a PDF
      const fileSlice = file.slice(0, 5);
      const buffer = await fileSlice.arrayBuffer();
      const signatureBytes = new Uint8Array(buffer);
      const fileSignature = String.fromCharCode(...signatureBytes);
      
      console.log('File signature check:', fileSignature);
      
      if (fileSignature !== '%PDF-') {
        console.warn('File claims to be PDF but signature check failed:', fileSignature);
        // We'll still try to upload, but log this warning
      }
    } catch (validationError) {
      console.error('Error during file signature validation:', validationError);
      // Continue with upload anyway
    }
  }

  // Try multiple upload strategies with fallbacks
  const uploadStrategies = [
    { name: 'xhr-formdata', method: uploadWithXHR },
    { name: 'fetch-formdata', method: uploadWithFetch },
    { name: 'axios-formdata', method: uploadWithAxios },
    { name: 'json-base64', method: uploadWithBase64JSON }
  ];
  
  // Try each strategy in sequence until one succeeds
  for (let i = 0; i < uploadStrategies.length; i++) {
    const strategy = uploadStrategies[i];
    console.log(`Trying upload strategy ${i+1}/${uploadStrategies.length}: ${strategy.name}`);
    
    try {
      // Calculate progress segments for each strategy
      const progressStart = 5 + (i * 5); // Start with 5%, 10%, 15%, etc.
      const progressRange = 90 / uploadStrategies.length;
      
      // Create a progress updater function for this strategy
      const strategyProgress = (progress: number) => {
        if (onProgressUpdate) {
          // Map strategy's 0-100 to its segment of the overall progress
          const scaledProgress = progressStart + (progress * progressRange / 100);
          onProgressUpdate(Math.min(95, scaledProgress)); // Cap at 95%
        }
      };
      
      // Initial progress update
      strategyProgress(0);
      
      // Try this upload strategy
      const result = await strategy.method(file, strategyProgress);
      
      // Success - final progress update and return the result
      if (onProgressUpdate) {
        onProgressUpdate(100);
      }
      
      console.log(`Upload successful using ${strategy.name} strategy`);
      console.log('===== FILE UPLOAD COMPLETED =====');
      return result;
    } catch (error) {
      console.error(`Upload failed with ${strategy.name} strategy:`, error);
      
      // If this is the last strategy, re-throw the error
      if (i === uploadStrategies.length - 1) {
        console.error('All upload strategies failed');
        throw error;
      }
      
      // Otherwise continue to the next strategy
      console.log(`Falling back to next strategy: ${uploadStrategies[i+1].name}`);
    }
  }
  
  // This should not be reached due to the logic above, but TypeScript needs it
  throw new Error('All upload strategies failed unexpectedly');
};

/**
 * Strategy 1: Upload using XMLHttpRequest with FormData
 * Direct and most compatible approach with detailed progress tracking
 */
async function uploadWithXHR(file: File, onProgress?: (progress: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    // Get session ID from localStorage
    const sessionId = localStorage.getItem('pdfspark_session_id');
    
    // Determine the API URL
    const apiUrl = `${import.meta.env.VITE_API_URL || 'https://pdfspark-production.up.railway.app'}/api/files/upload`;
    
    // Create FormData object
    const formData = new FormData();
    formData.append('file', file);
    
    // Create and configure XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl, true);
    
    // Set up upload progress tracking
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };
    
    // Add session ID header if available
    if (sessionId) {
      xhr.setRequestHeader('X-Session-ID', sessionId);
    }
    
    // Add custom headers for debugging
    xhr.setRequestHeader('X-Upload-Strategy', 'xhr-formdata');
    
    // Handle successful response
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          
          // Handle session ID from response
          const respSessionId = xhr.getResponseHeader('X-Session-ID') || 
                             xhr.getResponseHeader('x-session-id');
          if (respSessionId) {
            localStorage.setItem('pdfspark_session_id', respSessionId);
          }
          
          resolve(response);
        } catch (parseError: any) {
          reject(new Error(`Error parsing server response: ${parseError?.message || 'Unknown error'}`));
        }
      } else {
        // Handle error response
        let errorMessage = `Server returned ${xhr.status}: ${xhr.statusText}`;
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.message) {
            errorMessage = errorResponse.message;
          }
        } catch (e) {
          // Ignore JSON parse errors for error responses
        }
        reject(new Error(errorMessage));
      }
    };
    
    // Handle network errors
    xhr.onerror = function() {
      reject(new Error('Network error during file upload'));
    };
    
    // Handle timeout
    xhr.ontimeout = function() {
      reject(new Error('Request timed out'));
    };
    
    // Set reasonable timeout
    xhr.timeout = 120000; // 2 minutes
    
    // Send the request
    xhr.send(formData);
  });
}

/**
 * Strategy 2: Upload using fetch API with FormData
 */
async function uploadWithFetch(file: File, onProgress?: (progress: number) => void): Promise<UploadResponse> {
  // Get session ID from localStorage
  const fetchSessionId = localStorage.getItem('pdfspark_session_id');
  
  // Determine the API URL
  const apiUrl = `${import.meta.env.VITE_API_URL || 'https://pdfspark-production.up.railway.app'}/api/files/upload`;
  
  // Report progress start
  if (onProgress) onProgress(10);
  
  // Create FormData object
  const formData = new FormData();
  formData.append('file', file);
  
  // Verify FormData content for debugging
  try {
    console.log('Verifying FormData contents for fetch strategy:');
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`- ${key}: File(${value.name}, ${value.type}, ${value.size} bytes)`);
      } else {
        console.log(`- ${key}: ${value}`);
      }
    }
  } catch (formErr) {
    console.warn('Error inspecting FormData:', formErr);
  }
  
  // Create headers - DO NOT set Content-Type for FormData
  const headers: HeadersInit = {
    'X-Upload-Strategy': 'fetch-formdata'
  };
  
  if (fetchSessionId) {
    headers['X-Session-ID'] = fetchSessionId;
  }
  
  // Report progress update
  if (onProgress) onProgress(20);
  
  // Make fetch request
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: formData,
    credentials: 'omit',
  });
  
  // Report progress update
  if (onProgress) onProgress(80);
  
  // Check for successful response
  if (!response.ok) {
    let errorMessage = `Server responded with ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // Ignore JSON parse errors for error responses
    }
    throw new Error(errorMessage);
  }
  
  // Parse response data
  const data = await response.json();
  
  // Check for session ID in headers and save it
  const respSessionId = response.headers.get('X-Session-ID') || 
                      response.headers.get('x-session-id');
  if (respSessionId) {
    localStorage.setItem('pdfspark_session_id', respSessionId);
  }
  
  // Report progress complete
  if (onProgress) onProgress(100);
  
  return data;
}

/**
 * Strategy 3: Upload using axios with FormData
 */
async function uploadWithAxios(file: File, onProgress?: (progress: number) => void): Promise<UploadResponse> {
  // Create new FormData for axios
  const formData = new FormData();
  formData.append('file', file);
  
  // Report initial progress
  if (onProgress) onProgress(10);
  
  // Make axios request
  const response = await apiClient.post<UploadResponse>('/api/files/upload', formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        const percentCompleted = Math.round(10 + (event.loaded * 80) / event.total);
        onProgress(percentCompleted);
      }
    },
    timeout: 120000, // 2 minutes
    headers: {
      // Don't set Content-Type - axios will set it with boundary
      'X-Upload-Strategy': 'axios-formdata'
    }
  });
  
  // Report final progress
  if (onProgress) onProgress(100);
  
  return response.data;
}

/**
 * Strategy 4: Upload using JSON with base64 encoding
 * Use this as a last resort when FormData approaches fail
 */
async function uploadWithBase64JSON(file: File, onProgress?: (progress: number) => void): Promise<UploadResponse> {
  // Helper function to convert file to base64
  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };
  
  // Report progress at start
  if (onProgress) onProgress(10);
  
  // Convert file to base64
  const base64File = await fileToBase64(file);
  
  // Report progress after base64 conversion
  if (onProgress) onProgress(40);
  
  // Get session ID from localStorage
  const jsonSessionId = localStorage.getItem('pdfspark_session_id');
  
  // Determine the API URL
  const apiUrl = `${import.meta.env.VITE_API_URL || 'https://pdfspark-production.up.railway.app'}/api/files/upload`;
  
  // Create headers for JSON request
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Upload-Strategy': 'json-base64'
  };
  
  if (jsonSessionId) {
    headers['X-Session-ID'] = jsonSessionId;
  }
  
  // Report progress before fetch
  if (onProgress) onProgress(50);
  
  // Make fetch request with JSON containing base64 data
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      file: base64File,
      filename: file.name,
      mimetype: file.type
    }),
    credentials: 'omit'
  });
  
  // Report progress after fetch response
  if (onProgress) onProgress(80);
  
  // Check for successful response
  if (!response.ok) {
    let errorMessage = `Server responded with ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // Ignore JSON parse errors for error responses
    }
    throw new Error(errorMessage);
  }
  
  // Parse response data
  const data = await response.json();
  
  // Check for session ID in headers and save it
  const respSessionId = response.headers.get('X-Session-ID') || 
                      response.headers.get('x-session-id');
  if (respSessionId) {
    localStorage.setItem('pdfspark_session_id', respSessionId);
  }
  
  // Report progress complete
  if (onProgress) onProgress(100);
  
  return data;
}

/**
 * Start a PDF conversion operation
 */
export const convertPDF = async (
  fileId: string,
  targetFormat: ConversionFormat,
  options?: Record<string, any>
): Promise<ConversionResponse> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    return mockConvertPDF(fileId, targetFormat);
  }

  const response = await apiClient.post<ConversionResponse>('/api/convert', {
    fileId,
    sourceFormat: 'pdf',
    targetFormat,
    options: options || {},
  });
  
  return response.data;
};

/**
 * Check the status of a conversion operation
 */
export const getConversionStatus = async (
  operationId: string,
  mockAttempt = 0
): Promise<ConversionStatusResponse> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    return mockGetConversionStatus(operationId, mockAttempt);
  }

  const response = await apiClient.get<ConversionStatusResponse>(
    `/api/operations/${operationId}/status`
  );
  
  return response.data;
};

/**
 * Get the result of a completed conversion
 */
export const getConversionResult = async (
  operationId: string
): Promise<ConversionResultResponse> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    return mockGetConversionResult(operationId);
  }

  console.log(`Getting conversion result for operation: ${operationId}`);
  
  const response = await apiClient.get<ConversionResultResponse>(
    `/api/operations/${operationId}/download`
  );
  
  // Log special headers if present
  const cloudinaryUrl = response.headers['x-cloudinary-url'];
  const downloadSource = response.headers['x-download-source'];
  
  if (cloudinaryUrl) {
    console.log('Cloudinary URL from headers:', cloudinaryUrl);
  }
  
  if (downloadSource) {
    console.log('Download source from headers:', downloadSource);
  }
  
  // Check if the download URL is from Cloudinary
  if (response.data.downloadUrl && response.data.downloadUrl.includes('cloudinary.com')) {
    console.log('Detected Cloudinary URL in response:', response.data.downloadUrl);
    
    // Enhance the URL for better download experience
    if (!response.data.downloadUrl.includes('fl_attachment')) {
      try {
        const urlObj = new URL(response.data.downloadUrl);
        if (urlObj.pathname.includes('/upload/')) {
          urlObj.pathname = urlObj.pathname.replace('/upload/', '/upload/fl_attachment/');
          console.log('Enhanced Cloudinary URL in service:', urlObj.toString());
          response.data.downloadUrl = urlObj.toString();
        }
      } catch (error) {
        console.error('Error enhancing Cloudinary URL in service:', error);
      }
    }
  }
  
  return response.data;
};

/**
 * Enhanced file download function that handles Cloudinary CORS issues
 * @param url The file URL to download
 * @param filename The suggested filename
 */
export const downloadFile = (url: string, filename: string): boolean => {
  console.log(`Downloading file: ${filename} from URL: ${url}`);
  
  // Check if this is a Cloudinary URL or a Railway direct URL
  const isCloudinaryUrl = url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
  const isRailwayUrl = url.includes('railway.app') || url.includes('pdfspark-production');
  
  if (isCloudinaryUrl) {
    // For Cloudinary URLs, use the iframe approach to bypass CORS
    // Make sure the URL has the fl_attachment parameter
    if (!url.includes('fl_attachment')) {
      url = url.includes('?') 
        ? `${url}&fl_attachment=true` 
        : `${url}?fl_attachment=true`;
      console.log(`Enhanced Cloudinary URL with attachment parameter: ${url}`);
    }
    
    // Create a hidden iframe for download (avoids CORS issues)
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    // Set up listener to clean up iframe after download starts
    iframe.onload = () => {
      console.log('Iframe loaded, download should have started');
      setTimeout(() => {
        document.body.removeChild(iframe);
        console.log('Iframe removed from document');
      }, 5000); // Give it time to start the download
    };
    
    // Start the download
    iframe.src = url;
    console.log('Download started via iframe for Cloudinary URL');
    
    return true;
  } else if (isRailwayUrl) {
    // For Railway URLs, try a different approach that handles their specific issues
    console.log('Using Railway-specific download strategy');
    
    // Try the direct fetch with arraybuffer approach first
    fetch(url)
      .then(response => {
        // Check if response is valid
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        console.log(`Array buffer retrieved successfully, size: ${arrayBuffer.byteLength} bytes`);
        
        // Handle empty or tiny responses (likely error messages)
        if (arrayBuffer.byteLength < 100) {
          throw new Error('Received suspiciously small file, might be an error response');
        }
        
        // Convert arraybuffer to blob with appropriate type
        const blob = new Blob(
          [arrayBuffer], 
          { type: getMimeTypeFromFilename(filename) || 'application/octet-stream' }
        );
        
        // Create download link
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
        console.log('Download completed via ArrayBuffer method');
      })
      .catch(error => {
        console.error('Download failed using ArrayBuffer method:', error);
        
        // Try alternative approach with direct link but in a way that forces download
        console.log('Trying alternative Railway download method');
        
        // Create a temporary anchor with download attribute
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        console.log('Alternative download method initiated');
      });
    
    return true;
  } else {
    // For other URLs, use the standard approach
    console.log('Using standard multi-strategy download approach');
    
    // Strategy 1: Try Fetch API approach
    fetch(url)
      .then(response => {
        // Check if response is valid
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.blob();
      })
      .then(blob => {
        console.log(`Blob retrieved successfully, size: ${blob.size} bytes, type: ${blob.type}`);
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename || 'download';
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
        console.log('Download completed via Fetch API');
      })
      .catch(error => {
        console.error('Download failed using Fetch API:', error);
        
        // Strategy 2: Use direct window.open as fallback
        console.log('Falling back to direct window.open method');
        window.open(url, '_blank');
        console.log('Fallback download initiated via window.open');
      });
    
    return true;
  }
};

/**
 * Helper function to get MIME type from filename extension
 */
function getMimeTypeFromFilename(filename: string): string | null {
  if (!filename) return null;
  
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (!extension) return null;
  
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'txt': 'text/plain'
  };
  
  return mimeTypes[extension] || null;
}

/**
 * Download conversion result with enhanced error handling
 */
export const downloadConversionResult = async (operationId: string): Promise<boolean> => {
  try {
    console.log(`Initiating download for operation: ${operationId}`);
    
    const response = await apiClient.get(`/api/operations/${operationId}/download`);
    
    if (response.data && response.data.downloadUrl) {
      console.log('Download information received:', response.data);
      
      // Use the preferred filename from response or generate one
      const filename = response.data.fileName || 
                         `converted-file.${response.data.format || 'pdf'}`;
      
      // Use enhanced download function
      return downloadFile(
        response.data.downloadUrl, 
        filename
      );
    } else {
      console.error('Download URL not available in response:', response.data);
      throw new Error('Download URL not available');
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

/**
 * Get a preview of the conversion result
 */
export const getResultPreview = async (
  operationId: string
): Promise<{ previewUrl: string }> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    return { previewUrl: 'https://via.placeholder.com/150' };
  }

  const response = await apiClient.get<{ previewUrl: string }>(
    `/api/operations/${operationId}/preview`
  );
  
  return response.data;
};

/**
 * Process payment for premium operations
 */
export const createPayment = async (
  operationId: string,
  paymentMethod = 'card',
  returnUrl?: string
): Promise<{
  success: boolean;
  paymentId: string;
  status: string;
  checkoutUrl: string;
  sessionId: string;
}> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      success: true,
      paymentId: `mock-payment-${Date.now()}`,
      status: 'pending',
      checkoutUrl: 'https://example.com/checkout',
      sessionId: `mock-session-${Date.now()}`
    };
  }

  const response = await apiClient.post(`/api/payments/create`, {
    operationId,
    paymentMethod,
    returnUrl
  });
  
  return response.data;
};

/**
 * Check payment status
 */
export const getPaymentStatus = async (
  paymentId: string
): Promise<{
  paymentId: string;
  status: 'pending' | 'successful' | 'failed';
  operationId: string;
  canProceed: boolean;
}> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      paymentId,
      status: 'successful',
      operationId: `mock-op-${Date.now()}`,
      canProceed: true
    };
  }

  const response = await apiClient.get(`/api/payments/${paymentId}/status`);
  return response.data;
};

/**
 * Poll for conversion status until it's completed or failed
 */
export const pollConversionStatus = async (
  operationId: string,
  onProgress: (status: ConversionStatusResponse) => void,
  interval = 1000,
  maxAttempts = 60
): Promise<ConversionStatusResponse> => {
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        // Pass the attempt number for mock implementation
        const status = await getConversionStatus(operationId, attempts);
        
        // Report progress
        onProgress(status);
        
        // Check if operation is complete
        if (status.status === 'completed' || status.status === 'failed') {
          resolve(status);
          return;
        }
        
        // Check if we've exceeded max attempts
        attempts += 1;
        if (attempts >= maxAttempts) {
          reject(new Error('Conversion timed out after too many attempts'));
          return;
        }
        
        // Schedule next check
        setTimeout(checkStatus, interval);
      } catch (error) {
        reject(error);
      }
    };
    
    // Start checking
    checkStatus();
  });
};