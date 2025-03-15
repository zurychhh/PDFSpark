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
const MOCK_API = import.meta.env.DEV && import.meta.env.VITE_MOCK_API === 'true';

// We're now in production mode (MOCK_API is set to false)

/**
 * Mock implementations for development/testing
 */
const mockUploadFile = async (file: File): Promise<UploadResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    fileId: `mock-file-${Date.now()}`,
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
  
  return {
    success: true,
    downloadUrl: `#mock-download-${operationId}`,
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
 */
export const uploadFile = async (file: File): Promise<UploadResponse> => {
  // Use mock implementation in development if enabled
  if (MOCK_API) {
    return mockUploadFile(file);
  }

  const formData = new FormData();
  formData.append('file', file);
  
  // When sending FormData, axios automatically sets the correct Content-Type
  const response = await apiClient.post<UploadResponse>('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      // Progress tracking can be implemented here
      // Example: const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
      // onProgressUpdate?.(percentCompleted);
    },
  });
  
  return response.data;
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