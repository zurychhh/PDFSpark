import React, { useState, useCallback } from 'react';
import cloudinaryService from '../services/cloudinaryService';
import './CloudinaryUploader.css';

interface CloudinaryUploaderProps {
  onUploadComplete?: (asset: any) => void;
  folder?: string;
  tags?: string[];
  maxFileSizeMB?: number;
  allowedFileTypes?: string[];
}

const CloudinaryUploader: React.FC<CloudinaryUploaderProps> = ({
  onUploadComplete,
  folder = 'pdfspark',
  tags = [],
  maxFileSizeMB = 5,
  allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedAsset, setUploadedAsset] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

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
    setProgress(10);

    try {
      // Set up a progress simulation (since we don't have actual progress events)
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 10;
          return newProgress >= 90 ? 90 : newProgress;
        });
      }, 500);

      // Upload the file to Cloudinary
      const asset = await cloudinaryService.uploadFile(file, {
        folder,
        tags
      });

      // Clear the progress interval and set to complete
      clearInterval(progressInterval);
      setProgress(100);
      
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
  }, [folder, tags, maxFileSizeMB, allowedFileTypes, onUploadComplete]);

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
              <p>Dimensions: {uploadedAsset.width}x{uploadedAsset.height}</p>
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