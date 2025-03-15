import { useState, useCallback } from 'react';
import './FileUploader.css';
import { SUPPORTED_FORMATS, FILE_SIZE_LIMITS, FEATURES } from '../config/config';

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  acceptedFileTypes?: string[];
  maxFileSizeMB?: number;
  isPremium?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelected,
  acceptedFileTypes = SUPPORTED_FORMATS.SOURCE,
  maxFileSizeMB,
  isPremium = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine the max file size based on premium status
  const maxSize = maxFileSizeMB || (isPremium ? FILE_SIZE_LIMITS.PREMIUM : FILE_SIZE_LIMITS.FREE);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const validateFile = useCallback(
    (file: File): boolean => {
      // Check file type
      if (!acceptedFileTypes.includes(file.type)) {
        setError(`Invalid file type. Please upload a PDF file.`);
        return false;
      }

      // Check file size
      if (file.size > maxSize * 1024 * 1024) {
        if (FEATURES.PREMIUM_ENABLED && !isPremium) {
          setError(`File size exceeds the ${maxSize}MB limit for free accounts. Upgrade to process larger files.`);
        } else {
          setError(`File size exceeds the ${maxSize}MB limit.`);
        }
        return false;
      }

      setError(null);
      return true;
    },
    [acceptedFileTypes, maxSize, isPremium]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          onFileSelected(file);
        }
      }
    },
    [onFileSelected, validateFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          onFileSelected(file);
        }
      }
    },
    [onFileSelected, validateFile]
  );

  return (
    <div className="file-uploader-container">
      <div
        className={`file-drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <div className="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 16V8M12 8L8 12M12 8L16 12"
              stroke="#3a86ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16 18H8"
              stroke="#3a86ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
              stroke="#3a86ff"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="upload-text">
          <p className="primary-text">
            {isDragging ? 'Drop your file here' : 'Drag & drop your PDF here'}
          </p>
          <p className="secondary-text">or click to browse your files</p>
        </div>
        <div className="upload-limits">
          <p>Max file size: {maxFileSizeMB}MB</p>
        </div>
        <input
          id="file-input"
          type="file"
          accept={acceptedFileTypes.join(',')}
          onChange={handleFileInput}
          className="hidden-input"
        />
      </div>
      {error && <div className="upload-error">{error}</div>}
    </div>
  );
};

export default FileUploader;