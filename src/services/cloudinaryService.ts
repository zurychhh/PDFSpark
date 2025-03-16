import apiClient from './api';

// Type definitions
export interface CloudinaryUploadResponse {
  public_id: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  tags: string[];
  bytes: number;
  type: string;
  etag: string;
  url: string;
  secure_url: string;
  original_filename: string;
}

export interface CloudinaryAsset {
  id: string;
  url: string;
  secureUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  tags: string[];
}

// Cloudinary cloud configuration
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'pdfspark';
const USE_MOCK = import.meta.env.VITE_MOCK_CLOUDINARY === 'true';

/**
 * Cloudinary Service for managing media assets
 */
class CloudinaryService {
  /**
   * Upload a file to Cloudinary
   * @param file The file to upload
   * @param options Additional upload options
   * @returns Promise with upload response
   */
  async uploadFile(
    file: File,
    options: { folder?: string; tags?: string[]; transformation?: string } = {}
  ): Promise<CloudinaryAsset> {
    try {
      // Use mock implementation if configured
      if (USE_MOCK) {
        return this.mockUploadFile(file, options);
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      
      if (options.folder) {
        formData.append('folder', options.folder);
      }
      
      if (options.tags && options.tags.length > 0) {
        formData.append('tags', options.tags.join(','));
      }
      
      // Make API call to our backend which will handle the upload to Cloudinary
      const response = await apiClient.post<CloudinaryUploadResponse>(
        '/cloudinary/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      // Transform and return response
      return this.transformResponseToAsset(response.data);
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload file to Cloudinary');
    }
  }
  
  /**
   * Mock implementation for file upload (used in environments without Cloudinary)
   */
  private async mockUploadFile(
    file: File, 
    options: { folder?: string; tags?: string[] } = {}
  ): Promise<CloudinaryAsset> {
    // Simulate a network delay to mimic an actual upload
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // For browser environments, use URL.createObjectURL
    let fileUrl = '#';
    let fileSecureUrl = '#';
    
    if (typeof URL !== 'undefined' && typeof window !== 'undefined') {
      try {
        const objectUrl = URL.createObjectURL(file);
        fileUrl = objectUrl;
        fileSecureUrl = objectUrl;
      } catch (e) {
        console.warn('Failed to create object URL:', e);
      }
    }
    
    // Create a fake response object
    const mockResponse: CloudinaryAsset = {
      id: `mock-${Date.now()}`,
      url: fileUrl,
      secureUrl: fileSecureUrl,
      format: file.type.split('/')[1] || 'png',
      width: 800,
      height: 600,
      bytes: file.size,
      createdAt: new Date().toISOString(),
      tags: options.tags || [],
    };
    
    return mockResponse;
  }
  
  /**
   * Get an optimized image URL with transformations
   * @param publicId The public ID of the image
   * @param options Transformation options
   * @returns Optimized image URL
   */
  getImageUrl(publicId: string, options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: number;
    format?: string;
  } = {}): string {
    // Handle mock URLs
    if (publicId.startsWith('mock-') || publicId.startsWith('blob:')) {
      return publicId;
    }
    
    // Build a Cloudinary URL with transformations
    let transformations = [];
    
    if (options.width) transformations.push(`w_${options.width}`);
    if (options.height) transformations.push(`h_${options.height}`);
    if (options.crop) transformations.push(`c_${options.crop || 'limit'}`);
    if (options.quality) transformations.push(`q_${options.quality || 'auto'}`);
    if (options.format) transformations.push(`f_${options.format || 'auto'}`);
    
    const transformationString = transformations.length > 0 
      ? transformations.join(',') + '/' 
      : '';
    
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformationString}${publicId}`;
  }
  
  /**
   * Delete an asset from Cloudinary
   * @param publicId The public ID of the asset
   * @returns Promise indicating success
   */
  async deleteAsset(publicId: string): Promise<boolean> {
    try {
      // Use mock implementation if configured or if we're deleting a mock asset
      if (USE_MOCK || publicId.startsWith('mock-')) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
      }
      
      // Make API call to delete the asset
      const response = await apiClient.post('/cloudinary/delete', {
        publicId,
      });
      
      return response.data.success;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error('Failed to delete asset from Cloudinary');
    }
  }
  
  /**
   * Get a signed URL for client-side uploads (more efficient than server uploads)
   * @param options Options for the upload
   * @returns Signature data for client-side upload
   */
  async getSignatureForUpload(options: { 
    folder?: string; 
    tags?: string[] 
  } = {}): Promise<{
    signature: string;
    timestamp: number;
    cloudName: string;
    apiKey: string;
    folder: string;
    tags?: string[];
  }> {
    try {
      const response = await apiClient.post('/cloudinary/signature', {
        folder: options.folder,
        tags: options.tags
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to get signature:', error);
      throw new Error('Failed to get upload signature');
    }
  }
  
  /**
   * Transform Cloudinary API response to a standardized asset object
   * @param response The Cloudinary upload response
   * @returns Standardized asset object
   */
  private transformResponseToAsset(response: CloudinaryUploadResponse): CloudinaryAsset {
    return {
      id: response.public_id,
      url: response.url,
      secureUrl: response.secure_url,
      format: response.format,
      width: response.width,
      height: response.height,
      bytes: response.bytes,
      createdAt: response.created_at,
      tags: response.tags || [],
    };
  }
}

export default new CloudinaryService();