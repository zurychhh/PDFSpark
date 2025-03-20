import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${API_URL}/api`;

type LogEntry = {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
};

type DiagnosticResult = {
  success: boolean;
  data?: any;
  error?: string;
};

type DiagnosticResults = {
  envConfig?: DiagnosticResult;
  apiConnectivity?: DiagnosticResult;
  fileSystem?: DiagnosticResult;
  fileUpload?: DiagnosticResult;
  fileConversion?: DiagnosticResult;
  fileDownload?: DiagnosticResult;
  downloadUrl?: DiagnosticResult;
};

const DiagnosticPage: React.FC = () => {
  const [diagnosticResults, setDiagnosticResults] = useState<DiagnosticResults>({});
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  
  const addToLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    setLog(prev => [...prev, { 
      time: new Date().toISOString(), 
      message, 
      type 
    }]);
  };
  
  const clearLog = () => {
    setLog([]);
  };
  
  const runDiagnostics = async () => {
    setIsRunning(true);
    clearLog();
    addToLog('Starting diagnostic tests...', 'info');
    
    try {
      // Check environment configuration
      addToLog('Checking environment configuration...', 'info');
      const envConfig = {
        API_URL: import.meta.env.VITE_API_URL || '(not set)',
        API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '(not set)',
        MOCK_API: import.meta.env.VITE_MOCK_API || '(not set)',
        CLOUDINARY_CLOUD_NAME: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '(not set)',
        MOCK_CLOUDINARY: import.meta.env.VITE_MOCK_CLOUDINARY || '(not set)',
        MAX_FILE_SIZE_FREE: import.meta.env.VITE_MAX_FILE_SIZE_FREE || '(not set)',
        MAX_FILE_SIZE_PREMIUM: import.meta.env.VITE_MAX_FILE_SIZE_PREMIUM || '(not set)',
      };
      
      addToLog(`Environment config: ${JSON.stringify(envConfig, null, 2)}`, 'info');
      setDiagnosticResults(prev => ({ ...prev, envConfig: {
        success: true,
        data: envConfig
      }}));
      
      // Check API connectivity
      addToLog('Testing API connectivity...', 'info');
      try {
        const response = await axios.get(`${API_BASE_URL}/diagnostic/ping`, { timeout: 5000 });
        addToLog(`API ping response: ${JSON.stringify(response.data)}`, 'success');
        setDiagnosticResults(prev => ({ ...prev, apiConnectivity: {
          success: true,
          data: response.data
        }}));
      } catch (error: any) {
        addToLog(`API connectivity error: ${error.message}`, 'error');
        setDiagnosticResults(prev => ({ ...prev, apiConnectivity: {
          success: false,
          error: error.message
        }}));
      }
      
      // Check file system
      addToLog('Testing file system access...', 'info');
      try {
        const response = await axios.get(`${API_BASE_URL}/diagnostic/file-system`, { timeout: 5000 });
        addToLog(`File system check response: ${JSON.stringify(response.data)}`, 'success');
        setDiagnosticResults(prev => ({ ...prev, fileSystem: {
          success: true,
          data: response.data
        }}));
      } catch (error: any) {
        addToLog(`File system check error: ${error.message}`, 'error');
        setDiagnosticResults(prev => ({ ...prev, fileSystem: {
          success: false,
          error: error.message
        }}));
      }
      
      // Test small file upload
      addToLog('Testing small file upload...', 'info');
      try {
        // Create a tiny test file (a simple PDF)
        const tinyPdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%EOF';
        
        const blob = new Blob([tinyPdfContent], { type: 'application/pdf' });
        const testFile = new File([blob], 'test.pdf', { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', testFile);
        
        const response = await axios.post(`${API_BASE_URL}/files/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 10000
        });
        
        addToLog(`File upload test response: ${JSON.stringify(response.data)}`, 'success');
        setDiagnosticResults(prev => ({ ...prev, fileUpload: {
          success: true,
          data: response.data
        }}));
        
        // If upload succeeded, try conversion
        if (response.data && response.data.fileId) {
          await testConversion(response.data.fileId);
        }
      } catch (error: any) {
        addToLog(`File upload test error: ${error.message}`, 'error');
        setDiagnosticResults(prev => ({ ...prev, fileUpload: {
          success: false,
          error: error.message
        }}));
      }
      
      // Overall status
      addToLog('Diagnostic tests completed.', 'info');
    } catch (error: any) {
      addToLog(`Error running diagnostics: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };
  
  const testConversion = async (fileId: string) => {
    addToLog(`Testing file conversion for file ID: ${fileId}...`, 'info');
    
    try {
      // Request conversion to plaintext (simple)
      const conversionResponse = await axios.post(`${API_BASE_URL}/convert`, {
        fileId,
        sourceFormat: 'pdf',
        targetFormat: 'txt',
        options: {}
      }, { timeout: 10000 });
      
      addToLog(`Conversion request response: ${JSON.stringify(conversionResponse.data)}`, 'success');
      
      if (conversionResponse.data && conversionResponse.data.operationId) {
        const operationId = conversionResponse.data.operationId;
        
        // Poll for status
        addToLog(`Polling conversion status for operation ID: ${operationId}...`, 'info');
        
        let status = 'pending';
        let attempts = 0;
        const maxAttempts = 5;
        
        while (status === 'pending' && attempts < maxAttempts) {
          try {
            const statusResponse = await axios.get(`${API_BASE_URL}/operations/${operationId}/status`);
            status = statusResponse.data.status;
            
            addToLog(`Conversion status (attempt ${attempts + 1}): ${status}`, 'info');
            
            if (status === 'completed') {
              // Test download
              await testDownload(operationId);
              break;
            } else if (status === 'failed') {
              addToLog(`Conversion failed: ${statusResponse.data.errorMessage}`, 'error');
              setDiagnosticResults(prev => ({ ...prev, fileConversion: {
                success: false,
                error: statusResponse.data.errorMessage
              }}));
              break;
            }
            
            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
          } catch (error: any) {
            addToLog(`Error checking conversion status: ${error.message}`, 'error');
            setDiagnosticResults(prev => ({ ...prev, fileConversion: {
              success: false,
              error: error.message
            }}));
            break;
          }
        }
        
        if (status === 'pending') {
          addToLog('Conversion did not complete in time', 'warning');
          setDiagnosticResults(prev => ({ ...prev, fileConversion: {
            success: false,
            error: 'Conversion timed out'
          }}));
        }
      }
    } catch (error: any) {
      addToLog(`File conversion test error: ${error.message}`, 'error');
      setDiagnosticResults(prev => ({ ...prev, fileConversion: {
        success: false,
        error: error.message
      }}));
    }
  };
  
  const testDownload = async (operationId: string) => {
    addToLog(`Testing file download for operation ID: ${operationId}...`, 'info');
    
    try {
      const downloadResponse = await axios.get(`${API_BASE_URL}/operations/${operationId}/download`);
      
      addToLog(`Download endpoint response: ${JSON.stringify(downloadResponse.data)}`, 'success');
      setDiagnosticResults(prev => ({ ...prev, fileDownload: {
        success: true,
        data: downloadResponse.data
      }}));
      
      // Test the actual download URL
      if (downloadResponse.data && downloadResponse.data.downloadUrl) {
        const url = downloadResponse.data.downloadUrl;
        
        addToLog(`Testing download URL: ${url}`, 'info');
        
        try {
          // Just do a HEAD request to check if the URL is accessible
          const headResponse = await axios.head(url);
          
          addToLog(`Download URL is accessible. Status: ${headResponse.status}`, 'success');
          setDiagnosticResults(prev => ({ ...prev, downloadUrl: {
            success: true,
            status: headResponse.status
          }}));
        } catch (error: any) {
          addToLog(`Download URL check failed: ${error.message}`, 'error');
          setDiagnosticResults(prev => ({ ...prev, downloadUrl: {
            success: false,
            error: error.message
          }}));
        }
      }
    } catch (error: any) {
      addToLog(`File download test error: ${error.message}`, 'error');
      setDiagnosticResults(prev => ({ ...prev, fileDownload: {
        success: false,
        error: error.message
      }}));
    }
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">PDFSpark Diagnostic Tool</h1>
      
      <div className="mb-6">
        <button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {isRunning ? 'Running Diagnostics...' : 'Run Diagnostics'}
        </button>
      </div>
      
      {/* Diagnostic Log */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Diagnostic Log</h2>
        <div className="border rounded bg-gray-50 p-4 h-64 overflow-y-auto font-mono text-sm">
          {log.length === 0 ? (
            <p className="text-gray-500">Run diagnostics to see log entries...</p>
          ) : (
            log.map((entry, index) => (
              <div 
                key={index} 
                className={`mb-1 ${
                  entry.type === 'error' ? 'text-red-600' : 
                  entry.type === 'success' ? 'text-green-600' : 
                  entry.type === 'warning' ? 'text-yellow-600' : 
                  'text-gray-700'
                }`}
              >
                <span className="text-gray-500">[{entry.time.split('T')[1].split('.')[0]}]</span> {entry.message}
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Results */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Results Summary</h2>
        
        <div className="space-y-4">
          {Object.entries(diagnosticResults).map(([key, value]) => (
            <div key={key} className="border rounded p-4">
              <h3 className="font-medium mb-2 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</h3>
              {value.success ? (
                <div className="text-green-600 mb-2">✓ Success</div>
              ) : (
                <div className="text-red-600 mb-2">✗ Failed: {value.error}</div>
              )}
              
              {value.data && (
                <pre className="bg-gray-50 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(value.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticPage;