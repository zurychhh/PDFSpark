import { Cloudinary } from 'cloudinary-core';
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

// Create a Cloudinary instance with the cloud name
const cloudinaryCore = new Cloudinary({ cloud_name: 'pdfspark' });

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
      // We'll use a signed upload approach via our backend
      const formData = new FormData();
      formData.append('file', file);
      
      if (options.folder) {
        formData.append('folder', options.folder);
      }
      
      if (options.tags && options.tags.length > 0) {
        formData.append('tags', options.tags.join(','));
      }
      
      if (options.transformation) {
        formData.append('transformation', options.transformation);
      }
      
      const response = await apiClient.post<CloudinaryUploadResponse>(
        '/cloudinary/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      return this.transformResponseToAsset(response.data);
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload file to Cloudinary');
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
    const transformation = {
      quality: options.quality || 'auto',
      fetch_format: options.format || 'auto',
      crop: options.crop || 'limit',
      width: options.width,
      height: options.height,
    };
    
    return cloudinaryCore.url(publicId, { transformation });
  }
  
  /**
   * Delete an asset from Cloudinary
   * @param publicId The public ID of the asset
   * @returns Promise indicating success
   */
  async deleteAsset(publicId: string): Promise<boolean> {
    try {
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