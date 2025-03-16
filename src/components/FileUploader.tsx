import { useState, useCallback } from 'react';
import './FileUploader.css';
import { SUPPORTED_FORMATS, FILE_SIZE_LIMITS, FEATURES } from '../config/config';

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  onFileUploaded: (response: any) => void;
  acceptedFileTypes?: string[];
  allowedFileExtensions?: string[];
  maxSize?: number;
  isPremiumFeature?: boolean;
  userSubscription?: { active: boolean } | null;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelected,
  onFileUploaded,
  acceptedFileTypes = SUPPORTED_FORMATS.SOURCE,
  allowedFileExtensions,
  maxSize: maxFileSizeMB,
  isPremiumFeature = false,
  userSubscription = null
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine the max file size based on premium status
  const isPremium = isPremiumFeature && userSubscription && userSubscription.active;
  const effectiveMaxSize = maxFileSizeMB || (isPremium ? FILE_SIZE_LIMITS.PREMIUM : FILE_SIZE_LIMITS.FREE);

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
    (file: File): Promise<boolean> => {
      return new Promise((resolve) => {
        // Check file type
        if (!acceptedFileTypes.includes(file.type)) {
          setError(`Invalid file type. Please upload a PDF file.`);
          return resolve(false);
        }
  
        // Check file size
        if (file.size > effectiveMaxSize * 1024 * 1024) {
          if (FEATURES.PREMIUM_ENABLED && !isPremium) {
            setError(`File size exceeds the ${effectiveMaxSize}MB limit for free accounts. Upgrade to process larger files.`);
          } else {
            setError(`File size exceeds the ${effectiveMaxSize}MB limit.`);
          }
          return resolve(false);
        }
  
        // For PDF files, validate the file signature
        if (acceptedFileTypes.includes('application/pdf') && file.type === 'application/pdf') {
          // Read the file header to check for PDF signature
          const reader = new FileReader();
          reader.onload = (event) => {
            if (!event.target || !event.target.result) {
              setError('Error reading file');
              return resolve(false);
            }
  
            const arr = new Uint8Array(event.target.result as ArrayBuffer).subarray(0, 5);
            const header = String.fromCharCode.apply(null, Array.from(arr));
            
            // Check for PDF signature '%PDF-'
            if (header !== '%PDF-') {
              setError('Invalid PDF file. The file does not appear to be a valid PDF document.');
              return resolve(false);
            }
  
            // If we got here, the file passed all checks
            setError(null);
            return resolve(true);
          };
  
          reader.onerror = () => {
            setError('Error reading file');
            return resolve(false);
          };
  
          // Read the first few bytes to check the signature
          reader.readAsArrayBuffer(file.slice(0, 5));
        } else {
          // For non-PDF files or when PDF is not required, just validate based on MIME type
          setError(null);
          return resolve(true);
        }
      });
    },
    [acceptedFileTypes, effectiveMaxSize, isPremium]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        const file = files[0];
        const isValid = await validateFile(file);
        if (isValid) {
          onFileSelected(file);
        }
      }
    },
    [onFileSelected, validateFile]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        const file = files[0];
        const isValid = await validateFile(file);
        if (isValid) {
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
          <p>Max file size: {effectiveMaxSize}MB</p>
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