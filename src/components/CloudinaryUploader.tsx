import React, { useState, useCallback, useEffect } from 'react';
import cloudinaryService from '../services/cloudinaryService';
import './CloudinaryUploader.css';

interface CloudinaryUploaderProps {
  onUploadComplete?: (asset: any) => void;
  folder?: string;
  tags?: string[];
  maxFileSizeMB?: number;
  allowedFileTypes?: string[];
  directUpload?: boolean;
}

const CloudinaryUploader: React.FC<CloudinaryUploaderProps> = ({
  onUploadComplete,
  folder = 'pdfspark',
  tags = [],
  maxFileSizeMB = 5,
  allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  directUpload = false // Whether to use direct client-side uploads with signatures
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedAsset, setUploadedAsset] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadSignature, setUploadSignature] = useState<any>(null);

  // For direct upload, pre-fetch the signature
  useEffect(() => {
    if (directUpload) {
      const getSignature = async () => {
        try {
          const signature = await cloudinaryService.getSignatureForUpload({
            folder,
            tags
          });
          setUploadSignature(signature);
        } catch (err) {
          console.error('Failed to get upload signature:', err);
          setError('Failed to prepare upload. Please try again later.');
        }
      };
      
      getSignature();
    }
  }, [directUpload, folder, tags]);

  // Handle direct client-side upload to Cloudinary
  const handleDirectUpload = useCallback(async (file: File) => {
    if (!uploadSignature) {
      setError('Upload configuration not ready. Please try again.');
      return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', uploadSignature.apiKey);
    formData.append('timestamp', uploadSignature.timestamp.toString());
    formData.append('signature', uploadSignature.signature);
    formData.append('folder', uploadSignature.folder);
    
    if (uploadSignature.tags) {
      formData.append('tags', uploadSignature.tags.join(','));
    }
    
    // Create an XMLHttpRequest to track progress
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      };
      
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } else {
          reject(new Error('Upload failed'));
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Upload failed'));
      };
      
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${uploadSignature.cloudName}/auto/upload`);
      xhr.send(formData);
    });
  }, [uploadSignature]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!allowedFileTypes.includes(file.type)) {
      setError(`Invalid file type. Allowed types: ${allowedFileTypes.join(', ')}`);
      return;
    }

    // Validate file size
    if (file.size > maxFileSizeMB * 1024 * 1024) {
      setError(`File size exceeds the ${maxFileSizeMB}MB limit.`);
      return;
    }

    setIsUploading(true);
    setError(null);
    setProgress(directUpload ? 0 : 10);

    try {
      let asset;
      
      if (directUpload) {
        // Direct upload to Cloudinary (client-side)
        const result = await handleDirectUpload(file);
        
        if (!result) {
          throw new Error('Direct upload failed');
        }
        
        // Transform to our standard asset format
        asset = {
          id: result.public_id,
          url: result.url,
          secureUrl: result.secure_url,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          createdAt: result.created_at,
          tags: result.tags || [],
        };
      } else {
        // Server-side upload via our backend API
        // Set up a progress simulation (since we don't have actual progress events for server uploads)
        const progressInterval = setInterval(() => {
          setProgress(prev => {
            const newProgress = prev + 10;
            return newProgress >= 90 ? 90 : newProgress;
          });
        }, 500);

        // Upload the file to Cloudinary via our backend
        asset = await cloudinaryService.uploadFile(file, {
          folder,
          tags
        });

        // Clear the progress interval and set to complete
        clearInterval(progressInterval);
        setProgress(100);
      }
      
      // Set the uploaded asset
      setUploadedAsset(asset);
      
      // Call the onUploadComplete callback if provided
      if (onUploadComplete) {
        onUploadComplete(asset);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [folder, tags, maxFileSizeMB, allowedFileTypes, onUploadComplete, directUpload, handleDirectUpload]);

  return (
    <div className="cloudinary-uploader">
      <div className="uploader-container">
        {!isUploading && !uploadedAsset && (
          <div className="upload-form">
            <label className="upload-button">
              Select File to Upload
              <input 
                type="file" 
                accept={allowedFileTypes.join(',')} 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
            </label>
            <p className="upload-info">
              Max file size: {maxFileSizeMB}MB
            </p>
            {error && <p className="upload-error">{error}</p>}
          </div>
        )}

        {isUploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p>Uploading... {progress}%</p>
          </div>
        )}

        {uploadedAsset && (
          <div className="upload-result">
            <div className="image-preview">
              {uploadedAsset.format === 'pdf' ? (
                <div className="pdf-preview">
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="#3a86ff" strokeWidth="2"/>
                    <path d="M14 2V8H20" stroke="#3a86ff" strokeWidth="2"/>
                    <path d="M9 15H15" stroke="#3a86ff" strokeWidth="2"/>
                    <path d="M9 11H15" stroke="#3a86ff" strokeWidth="2"/>
                    <path d="M9 19H12" stroke="#3a86ff" strokeWidth="2"/>
                  </svg>
                  <p>PDF Document</p>
                </div>
              ) : (
                <img 
                  src={uploadedAsset.secureUrl || uploadedAsset.url}
                  alt="Uploaded file preview"
                  width="200"
                />
              )}
            </div>
            <div className="upload-info">
              <p>Type: {uploadedAsset.format.toUpperCase()}</p>
              <p>Size: {(uploadedAsset.bytes / (1024 * 1024)).toFixed(2)} MB</p>
              {uploadedAsset.width && uploadedAsset.height && (
                <p>Dimensions: {uploadedAsset.width}x{uploadedAsset.height}</p>
              )}
              {uploadedAsset.id && !uploadedAsset.id.startsWith('mock-') && (
                <p>ID: {uploadedAsset.id}</p>
              )}
            </div>
            <button 
              className="reset-button"
              onClick={() => {
                setUploadedAsset(null);
                setError(null);
              }}
            >
              Upload Another File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudinaryUploader;