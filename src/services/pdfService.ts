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

  // Add debugging
  console.log('Uploading file to:', apiClient.defaults.baseURL);
  console.log('File details:', {
    name: file.name,
    type: file.type,
    size: file.size
  });

  // For debugging - create a simple test file if the real file seems problematic
  if (file.size === 0) {
    console.warn('File size is 0, this might cause issues');
  }

  // Create a simple FormData object with the file
  const formData = new FormData();
  formData.append('file', file);

  try {
    // Use direct fetch API to bypass potential axios issues
    console.log('Trying upload with fetch API');
    
    // Show progress if callback provided
    if (onProgressUpdate) {
      onProgressUpdate(10); // Start with 10% progress
    }
    
    // Get session ID from localStorage
    const sessionId = localStorage.getItem('pdfspark_session_id');
    
    // Use fetch API with the full API URL
    const apiUrl = `${import.meta.env.VITE_API_URL || 'https://pdfspark-production.up.railway.app'}/api/files/upload`;
    console.log('Uploading to full URL:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      // Change to 'same-origin' instead of 'include' to fix CORS issue
      credentials: 'omit',
      headers: {
        // Include session ID if we have it
        ...(sessionId ? { 'X-Session-ID': sessionId } : {})
      }
    });
    
    if (onProgressUpdate) {
      onProgressUpdate(90); // Almost done
    }
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (onProgressUpdate) {
      onProgressUpdate(100); // Done
    }
    
    console.log('Upload response:', data);
    return data;
  } catch (fetchError: any) {
    console.error('Fetch upload error:', fetchError);
    
    // Try with axios as fallback
    console.log('Trying upload with axios as fallback');
    try {
      const response = await apiClient.post<UploadResponse>('/files/upload', formData, {
        headers: {
          // Do not set Content-Type manually, let axios set it with the correct boundary
        },
        onUploadProgress: (event) => {
          if (onProgressUpdate && event.total) {
            const percentCompleted = Math.round((event.loaded * 100) / event.total);
            onProgressUpdate(percentCompleted);
          }
        },
        // Increase timeout for large files
        timeout: 120000, // 2 minutes
      });
      
      console.log('Axios upload response:', response.data);
      return response.data;
    } catch (axiosError: any) {
      console.error('Axios upload error:', axiosError);
      
      // If there's a network error or CORS issue
      if (!axiosError.response) {
        console.error('Network error details:', {
          message: axiosError.message,
          code: axiosError.code,
          stack: axiosError.stack
        });
        
        throw new Error(`Network error during upload: ${axiosError.message || fetchError.message}`);
      }
      
      // Throw the original error with more details
      throw new Error(`Upload failed: ${axiosError.message || fetchError.message}`);
    }
  }
};

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

  const response = await apiClient.post<ConversionResponse>('/convert', {
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
    `/operations/${operationId}/status`
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

  const response = await apiClient.get<ConversionResultResponse>(
    `/operations/${operationId}/download`
  );
  
  return response.data;
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
    `/operations/${operationId}/preview`
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

  const response = await apiClient.post(`/payments/create`, {
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

  const response = await apiClient.get(`/payments/${paymentId}/status`);
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