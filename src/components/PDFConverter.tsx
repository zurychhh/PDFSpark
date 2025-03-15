import { useState } from 'react';
import FileUploader from './FileUploader';
import './PDFConverter.css';
import * as pdfService from '../services/pdfService';
import { DEFAULT_CONVERSION_OPTIONS } from '../config/config';

export type ConversionFormat = 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'txt';

interface PDFConverterProps {
  defaultFormat?: ConversionFormat;
}

const PDFConverter: React.FC<PDFConverterProps> = ({ defaultFormat = 'docx' }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConversionFormat>(defaultFormat);
  const [conversionStatus, setConversionStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  // Track operation ID for status polling
  const [, setOperationId] = useState<string | null>(null);
  // Track if the conversion is a premium feature
  const [, setIsPremium] = useState(false);

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setConversionStatus('idle');
    setProgress(0);
    setDownloadUrl(null);
    setErrorMessage(null);
    setFileId(null);
    setOperationId(null);
  };

  const handleConvert = async () => {
    if (!selectedFile) return;

    try {
      // 1. Upload file
      setConversionStatus('uploading');
      setProgress(20);

      try {
        const uploadResponse = await pdfService.uploadFile(selectedFile);
        
        if (!uploadResponse.success) {
          throw new Error('File upload failed');
        }
        
        setFileId(uploadResponse.fileId);
        setProgress(40);
      } catch (error) {
        console.error('Upload error:', error);
        setConversionStatus('error');
        setErrorMessage('File upload failed. Please try again.');
        return;
      }
      
      // 2. Start conversion
      setConversionStatus('processing');
      setProgress(50);
      
      try {
        if (!fileId) {
          throw new Error('File ID is missing');
        }
        
        // Get default options for the selected format
        const options = DEFAULT_CONVERSION_OPTIONS[targetFormat];
        
        const conversionResponse = await pdfService.convertPDF(
          fileId,
          targetFormat,
          options
        );
        
        if (!conversionResponse.success) {
          throw new Error('Conversion initialization failed');
        }
        
        setOperationId(conversionResponse.operationId);
        setIsPremium(conversionResponse.isPremium);
        
        // 3. Poll for conversion status
        await pdfService.pollConversionStatus(
          conversionResponse.operationId,
          (status) => {
            // Update progress based on status
            setProgress(50 + Math.round(status.progress * 0.5)); // Map 0-100% to 50-100%
          }
        );
        
        // 4. Get conversion result
        const resultResponse = await pdfService.getConversionResult(
          conversionResponse.operationId
        );
        
        if (!resultResponse.success) {
          throw new Error('Failed to get conversion result');
        }
        
        setDownloadUrl(resultResponse.downloadUrl);
        setProgress(100);
        setConversionStatus('completed');
      } catch (error: any) {
        console.error('Conversion error:', error);
        setConversionStatus('error');
        // Extract more detailed error information if available
        const errorMessage = error.response?.data?.message || error.message || 'An error occurred during conversion. Please try again.';
        setErrorMessage(errorMessage);
        // Log additional details for debugging
        if (error.response) {
          console.error('API Response Error:', {
            status: error.response.status,
            headers: error.response.headers,
            data: error.response.data
          });
        }
      }
    } catch (error: any) {
      setConversionStatus('error');
      setErrorMessage(error.message || 'An error occurred. Please try again.');
      console.error('Error:', error);
    }
  };

  // Formats with their display names and icons (simplified for demo)
  const formats: { value: ConversionFormat; label: string }[] = [
    { value: 'docx', label: 'Word Document (.docx)' },
    { value: 'xlsx', label: 'Excel Spreadsheet (.xlsx)' },
    { value: 'pptx', label: 'PowerPoint (.pptx)' },
    { value: 'jpg', label: 'Image (.jpg)' },
    { value: 'txt', label: 'Text (.txt)' },
  ];

  return (
    <div className="pdf-converter-container">
      <h2 className="converter-title">Convert PDF to {formats.find(f => f.value === targetFormat)?.label.split(' ')[0]}</h2>
      
      {!selectedFile ? (
        // Step 1: File Upload
        <div className="converter-section upload-section">
          <FileUploader onFileSelected={handleFileSelected} />
        </div>
      ) : (
        // Step 2: Conversion Options & Processing
        <div className="converter-section conversion-section">
          <div className="file-info">
            <div className="file-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6C4 4.89543 4.89543 4 6 4H14L20 10V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z" stroke="#3a86ff" strokeWidth="2" />
                <path d="M14 4L14 10H20" stroke="#3a86ff" strokeWidth="2" />
              </svg>
            </div>
            <div className="file-details">
              <p className="file-name">{selectedFile.name}</p>
              <p className="file-size">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <button 
              className="btn-remove"
              onClick={() => setSelectedFile(null)}
            >
              &times;
            </button>
          </div>

          <div className="conversion-options">
            <label htmlFor="format-select">Convert to:</label>
            <select 
              id="format-select"
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value as ConversionFormat)}
              disabled={conversionStatus === 'processing' || conversionStatus === 'uploading'}
            >
              {formats.map(format => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>

          {conversionStatus === 'idle' && (
            <button 
              className="btn-convert"
              onClick={handleConvert}
            >
              Convert Now
            </button>
          )}

          {(conversionStatus === 'uploading' || conversionStatus === 'processing') && (
            <div className="conversion-progress">
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="progress-text">
                {conversionStatus === 'uploading' ? 'Uploading file...' : 'Converting...'}
                {progress}%
              </p>
            </div>
          )}

          {conversionStatus === 'completed' && downloadUrl && (
            <div className="conversion-result">
              <p className="success-message">Conversion completed successfully!</p>
              <a 
                href={downloadUrl}
                download={`${selectedFile.name.replace('.pdf', '')}.${targetFormat}`}
                className="btn-download"
              >
                Download {targetFormat.toUpperCase()} File
              </a>
              <button 
                className="btn-convert-another"
                onClick={() => setSelectedFile(null)}
              >
                Convert Another File
              </button>
            </div>
          )}

          {conversionStatus === 'error' && (
            <div className="conversion-error">
              <p className="error-message">{errorMessage}</p>
              <button 
                className="btn-retry"
                onClick={handleConvert}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PDFConverter;