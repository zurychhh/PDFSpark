import { useState, useEffect } from 'react';
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
  const [operationId, setOperationId] = useState<string | null>(null);
  // Track if the conversion is a premium feature
  const [isPremium, setIsPremium] = useState(false);
  // Track checkout URL for payment redirection
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setConversionStatus('idle');
    setProgress(0);
    setDownloadUrl(null);
    setErrorMessage(null);
    setFileId(null);
    setOperationId(null);
  };

  // Check for payment return from Stripe
  const checkPaymentStatus = async () => {
    // Parse query parameters
    const queryParams = new URLSearchParams(window.location.search);
    const paymentId = queryParams.get('payment_id');
    const operationId = queryParams.get('operation_id');
    const canceled = queryParams.get('canceled');
    
    if (canceled && operationId) {
      setOperationId(operationId);
      setErrorMessage('Payment was canceled. Please try again.');
      setConversionStatus('error');
      // Clear URL parameters without refreshing page
      window.history.replaceState(null, '', window.location.pathname);
      return true;
    }
    
    if (paymentId && operationId) {
      try {
        setConversionStatus('processing');
        setProgress(50);
        setOperationId(operationId);
        
        // Check payment status
        const paymentStatus = await pdfService.getPaymentStatus(paymentId);
        
        if (paymentStatus.status === 'successful' && paymentStatus.canProceed) {
          // Continue with conversion process after payment
          await pdfService.pollConversionStatus(
            operationId,
            (status) => {
              setProgress(50 + Math.round(status.progress * 0.5));
            }
          );
          
          // Get conversion result
          const resultResponse = await pdfService.getConversionResult(operationId);
          
          if (!resultResponse.success) {
            throw new Error('Failed to get conversion result');
          }
          
          setDownloadUrl(resultResponse.downloadUrl);
          setProgress(100);
          setConversionStatus('completed');
          
          // Clear URL parameters without refreshing page
          window.history.replaceState(null, '', window.location.pathname);
        } else if (paymentStatus.status === 'pending') {
          setErrorMessage('Payment is still processing. Please wait.');
          setConversionStatus('error');
        } else {
          setErrorMessage('Payment failed. Please try again.');
          setConversionStatus('error');
        }
      } catch (error: any) {
        console.error('Payment verification error:', error);
        setConversionStatus('error');
        setErrorMessage(error.message || 'Payment verification failed. Please try again.');
      }
      
      // Clear URL parameters without refreshing page
      window.history.replaceState(null, '', window.location.pathname);
      return true; // Indicate that we handled a payment return
    }
    
    return false; // No payment return to handle
  };
  
  // Check for payment return on component mount
  useEffect(() => {
    checkPaymentStatus();
  }, []);

  const handleConvert = async () => {
    if (!selectedFile) return;
    
    // Check if we're returning from payment first
    if (await checkPaymentStatus()) return;

    try {
      // 1. Upload file
      setConversionStatus('uploading');
      setProgress(10);

      try {
        // Utworzenie funkcji do aktualizacji postępu przesyłania
        const updateUploadProgress = (progress: number) => {
          // Mapuj postęp przesyłania na zakres 10-40%
          setProgress(10 + Math.round(progress * 0.3));
        };
        
        // Log detailed file info
        console.log('Starting file upload:', {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          lastModified: new Date(selectedFile.lastModified).toISOString()
        });
        
        // Create a dummy file for testing if needed
        let fileToUpload = selectedFile;
        
        // Try to resolve the upload with several attempts
        let attempts = 0;
        let uploadResponse = null;
        let lastError = null;
        
        while (attempts < 3 && !uploadResponse) {
          try {
            attempts++;
            console.log(`Upload attempt ${attempts}`);
            
            // If we're on attempt 2+, add a delay
            if (attempts > 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            uploadResponse = await pdfService.uploadFile(fileToUpload, updateUploadProgress);
            
            if (!uploadResponse || !uploadResponse.success) {
              console.error('Upload response indicated failure:', uploadResponse);
              throw new Error('File upload failed: server returned unsuccessful response');
            }
          } catch (attemptError: any) {
            console.error(`Upload attempt ${attempts} failed:`, attemptError);
            lastError = attemptError;
            
            // If last attempt, let it fail normally
            if (attempts >= 3) {
              throw attemptError;
            }
          }
        }
        
        if (!uploadResponse) {
          throw lastError || new Error('All upload attempts failed');
        }
        
        console.log('Upload successful:', uploadResponse);
        setFileId(uploadResponse.fileId);
        setProgress(40);
      } catch (error: any) {
        console.error('Upload error after all attempts:', error);
        setConversionStatus('error');
        
        // Extract more detailed error message if available
        let errorMsg = 'File upload failed. Please try again.';
        
        if (error.response && error.response.data) {
          // Extract error message from API response
          errorMsg = error.response.data.error || errorMsg;
          console.error('API error details:', error.response.data);
        } else if (error.message) {
          errorMsg = error.message;
        }
        
        // Add debug info
        if (process.env.NODE_ENV === 'development') {
          errorMsg += ` (Debug: ${error.message})`;
        }
        
        setErrorMessage(errorMsg);
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
        
        // Check if payment is required
        if (conversionResponse.isPremium) {
          try {
            // Create payment session
            const paymentResponse = await pdfService.createPayment(
              conversionResponse.operationId,
              'card',
              window.location.href // Use current URL as return URL
            );
            
            if (paymentResponse.success) {
              // Store checkout URL
              setCheckoutUrl(paymentResponse.checkoutUrl);
              
              // Redirect user to Stripe checkout
              window.location.href = paymentResponse.checkoutUrl;
              return; // Stop execution after redirect
            } else {
              throw new Error('Failed to create payment session');
            }
          } catch (paymentError) {
            console.error('Payment error:', paymentError);
            throw new Error('Payment processing failed. Please try again.');
          }
        }
        
        // If not premium or payment handling is complete
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
              
              {/* Handle file download, ensuring filename is preserved */}
              <button 
                className="btn-download"
                onClick={() => {
                  // Create a function to handle the download
                  const handleDownload = () => {
                    // Create a temporary link element
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    
                    // Set filename from original file name
                    const filename = `${selectedFile.name.replace('.pdf', '')}.${targetFormat}`;
                    link.download = filename;
                    
                    // Append to document
                    document.body.appendChild(link);
                    
                    // Trigger click event
                    link.click();
                    
                    // Clean up
                    document.body.removeChild(link);
                  };
                  
                  // Execute download
                  handleDownload();
                }}
              >
                Download {targetFormat.toUpperCase()} File
              </button>}
              
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

          {/* Premium Feature Payment UI */}
          {isPremium && checkoutUrl && (
            <div className="payment-required">
              <h3>Premium Feature</h3>
              <p>This conversion requires a payment to proceed.</p>
              <p className="price-info">Price: $1.99</p>
              
              <button 
                className="btn-payment"
                onClick={() => {
                  // Redirect to checkout page
                  window.location.href = checkoutUrl;
                }}
              >
                Proceed to Payment
              </button>
              
              <p className="payment-info">
                Secure payment processed by Stripe. Your files will be deleted after processing.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PDFConverter;