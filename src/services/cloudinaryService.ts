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
const CLOUD_NAME = 'pdfspark';

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
      // Since we're not actually uploading to Cloudinary in this implementation,
      // we'll create a mock response with a dummy preview URL
      
      // Simulate a network delay to mimic an actual upload
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Create a fake response object
      const mockResponse: CloudinaryAsset = {
        id: `mock-${Date.now()}`,
        url: typeof URL !== 'undefined' ? URL.createObjectURL(file) : '#',
        secureUrl: typeof URL !== 'undefined' ? URL.createObjectURL(file) : '#',
        format: file.type.split('/')[1] || 'png',
        width: 800,
        height: 600,
        bytes: file.size,
        createdAt: new Date().toISOString(),
        tags: options.tags || [],
      };
      
      return mockResponse;
    } catch (error) {
      console.error('Mock upload error:', error);
      throw new Error('Failed to upload file');
    }
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
    // Build a manual URL instead of using the cloudinary-core SDK
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
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock success response
      return true;
    } catch (error) {
      console.error('Mock delete error:', error);
      throw new Error('Failed to delete asset');
    }
  }
  
  /**
   * Transform Cloudinary API response to a standardized asset object
   * This method is retained for compatibility but not used in the mock implementation
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