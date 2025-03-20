import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import './EnhancedFileUploader.css';

// Get configuration from environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${API_URL}/api`;
const MAX_FILE_SIZE_FREE = (import.meta.env.VITE_MAX_FILE_SIZE_FREE || 5) * 1024 * 1024; // MB to bytes

interface EnhancedFileUploaderProps {
  onUploadComplete: (data: any) => void;
  isPremiumUser?: boolean;
  maxSize?: number; // In MB
  acceptedFileTypes?: string[];
  allowedFileExtensions?: string[];
}

const EnhancedFileUploader: React.FC<EnhancedFileUploaderProps> = ({
  onUploadComplete,
  isPremiumUser = false,
  maxSize = 5,
  acceptedFileTypes = ['application/pdf'],
  allowedFileExtensions = ['.pdf']
}) => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fileDetails, setFileDetails] = useState<any>(null);
  
  // Maximum file size based on user tier
  const maxFileSize = isPremiumUser 
    ? (import.meta.env.VITE_MAX_FILE_SIZE_PREMIUM || 100) * 1024 * 1024 
    : MAX_FILE_SIZE_FREE;
  
  // Reset state when component unmounts or when a new upload starts
  useEffect(() => {
    return () => {
      setUploadProgress(0);
      setUploadStatus('idle');
      setErrorMessage('');
    };
  }, []);
  
  // Configuration for react-dropzone
  const onDrop = useCallback(async (acceptedFiles) => {
    // Reset previous upload state
    setUploadProgress(0);
    setUploadStatus('idle');
    setErrorMessage('');
    
    // Validate file
    const file = acceptedFiles[0];
    if (!file) return;
    
    // Check file size
    if (file.size > maxFileSize) {
      setErrorMessage(`File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB for ${isPremiumUser ? 'premium' : 'free'} users.`);
      setUploadStatus('error');
      return;
    }
    
    // Start upload
    setUploadStatus('uploading');
    
    try {
      // Create form data for upload
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload with progress tracking
      const response = await axios.post(`${API_BASE_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percentCompleted);
          }
        },
      });
      
      if (response.data && response.data.success) {
        setUploadStatus('success');
        setFileDetails(response.data);
        
        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete(response.data);
        }
      } else {
        throw new Error(response.data?.message || 'Upload failed');
      }
    } catch (error: any) {
      console.error('File upload error:', error);
      setUploadStatus('error');
      
      // Extract error message from response if available
      const errorMessage = error.response?.data?.message || error.message || 'Unknown upload error';
      setErrorMessage(errorMessage);
    }
  }, [maxFileSize, onUploadComplete, isPremiumUser]);
  
  // Configure dropzone
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    acceptedFiles,
    fileRejections,
  } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce((acc, type) => {
      acc[type] = allowedFileExtensions;
      return acc;
    }, {} as Record<string, string[]>),
    maxFiles: 1,
    maxSize: maxFileSize,
  });
  
  // Handle rejected files
  useEffect(() => {
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      let message = 'File rejected: ';
      
      if (rejection.errors && rejection.errors.length > 0) {
        message += rejection.errors.map(e => e.message).join(', ');
      }
      
      setErrorMessage(message);
      setUploadStatus('error');
    }
  }, [fileRejections]);
  
  // Render helpful file details
  const renderFileDetails = () => {
    if (!acceptedFiles.length && !fileDetails) return null;
    
    const file = acceptedFiles[0] || { name: fileDetails?.fileName, size: fileDetails?.fileSize };
    if (!file) return null;
    
    return (
      <div className="file-details">
        <p><strong>File:</strong> {file.name}</p>
        <p><strong>Size:</strong> {(file.size / (1024 * 1024)).toFixed(2)} MB</p>
        {fileDetails?.uploadDate && (
          <p><strong>Uploaded:</strong> {new Date(fileDetails.uploadDate).toLocaleString()}</p>
        )}
      </div>
    );
  };
  
  // Determine dropzone className based on state
  const getDropzoneClassName = () => {
    let className = "dropzone";
    
    if (isDragActive && !isDragReject) {
      className += " active";
    } else if (isDragReject) {
      className += " reject";
    } else if (uploadStatus === 'success') {
      className += " success";
    } else if (uploadStatus === 'error') {
      className += " error";
    }
    
    return className;
  };
  
  return (
    <div className="enhanced-file-uploader">
      <div {...getRootProps({ className: getDropzoneClassName() })}>
        <input {...getInputProps()} />
        
        {uploadStatus === 'uploading' ? (
          <div className="upload-progress">
            <p className="progress-text">Uploading... {uploadProgress}%</p>
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : uploadStatus === 'success' ? (
          <div className="upload-success">
            <div className="success-icon">✓</div>
            <p>File uploaded successfully!</p>
            {renderFileDetails()}
          </div>
        ) : uploadStatus === 'error' ? (
          <div className="upload-error">
            <div className="error-icon">✗</div>
            <p>Error: {errorMessage}</p>
            <p className="retry-text">Please try again or use a different file.</p>
          </div>
        ) : isDragActive ? (
          <p>Drop the PDF file here...</p>
        ) : (
          <div className="upload-instructions">
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15V16C3 17.6569 4.34315 19 6 19H18C19.6569 19 21 17.6569 21 16V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="drag-text">Drag & drop a PDF file here, or click to select</p>
            <p className="size-limit">
              Maximum file size: {(maxFileSize / (1024 * 1024))}MB
            </p>
          </div>
        )}
      </div>
      
      {uploadStatus !== 'uploading' && uploadStatus !== 'error' && renderFileDetails()}
      
      {/* Diagnostic information (only in development) */}
      {import.meta.env.DEV && uploadStatus === 'error' && (
        <div className="debug-info">
          <p><strong>Debug Info:</strong></p>
          <pre className="error-details">
            {errorMessage}
          </pre>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUploader;