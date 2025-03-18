import React, { useState, useEffect } from 'react';
import { runUploadDiagnostics, createTestPdf } from '../services/uploadDiagnostics';
import axios from 'axios';

interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: any;
}

const UploadDiagnosticPage: React.FC = () => {
  const [results, setResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useGeneratedFile, setUseGeneratedFile] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [conversionResults, setConversionResults] = useState<any>(null);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [backendResults, setBackendResults] = useState<{
    fileSystem: any;
    memory: any;
    cloudinary: any;
    database: any;
  }>({
    fileSystem: null,
    memory: null,
    cloudinary: null,
    database: null
  });

  // Set API URL on component mount
  useEffect(() => {
    const url = localStorage.getItem('pdfspark_working_api_url') || 
                import.meta.env.VITE_API_URL || 
                'http://localhost:5001';
    setApiUrl(url);
  }, []);

  // Function to toggle section expansion
  const toggleSection = (index: number) => {
    setExpandedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setUseGeneratedFile(false);
    }
  };

  // Run additional backend diagnostics
  const runBackendDiagnostics = async (url: string) => {
    try {
      // Test file system
      console.log('Testing file system...');
      const fsResponse = await axios.get(`${url}/api/diagnostic/file-system`);
      
      // Test memory
      console.log('Testing memory...');
      const memoryResponse = await axios.get(`${url}/api/diagnostic/memory`);
      
      // Test Cloudinary
      console.log('Testing Cloudinary...');
      const cloudinaryResponse = await axios.get(`${url}/api/diagnostic/cloudinary`);
      
      // Test database
      console.log('Testing database...');
      const dbResponse = await axios.get(`${url}/api/diagnostic/database`);
      
      // Set results
      setBackendResults({
        fileSystem: fsResponse.data,
        memory: memoryResponse.data,
        cloudinary: cloudinaryResponse.data,
        database: dbResponse.data
      });
      
      // Test PDF conversion
      console.log('Testing PDF conversion...');
      const conversionResponse = await axios.get(`${url}/api/diagnostic/pdf-conversion`);
      setConversionResults(conversionResponse.data);
      
    } catch (error) {
      console.error('Error running backend diagnostics:', error);
    }
  };

  // Run diagnostics
  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    setBackendResults({
      fileSystem: null,
      memory: null,
      cloudinary: null,
      database: null
    });
    setConversionResults(null);
    
    try {
      // Use generated test PDF or user-selected file
      const fileToTest = useGeneratedFile ? createTestPdf() : selectedFile;
      
      // Run upload diagnostics
      const diagnosticResults = await runUploadDiagnostics(fileToTest || undefined);
      setResults(diagnosticResults);
      
      // Find the working API URL from results
      const apiConnectivityResult = diagnosticResults.find((r: any) => r.message?.includes('API connectivity'));
      const workingApiUrl = apiConnectivityResult?.details?.apiUrl 
        ? new URL(apiConnectivityResult.details.apiUrl).origin
        : apiUrl;
      
      console.log('Using API URL for backend tests:', workingApiUrl);
      
      // Run backend diagnostics
      await runBackendDiagnostics(workingApiUrl);
      
      // Auto-expand failed tests
      const newExpandedSections: Record<string, boolean> = {};
      diagnosticResults.forEach((result: any, index: number) => {
        if (!result.success) {
          newExpandedSections[index] = true;
        }
      });
      setExpandedSections(newExpandedSections);
    } catch (error: any) {
      setResults([{
        success: false,
        message: 'Error running diagnostics',
        details: { error: error.message }
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  // Render a backend diagnostic result
  const renderBackendResult = (title: string, data: any) => {
    if (!data) return null;
    
    const status = data.status === 'ok' ? 'ok' : 'error';
    
    return (
      <div className="border rounded-lg overflow-hidden mb-4">
        <div className={`p-4 ${status === 'ok' ? 'bg-green-50' : 'bg-red-50'}`}>
          <h3 className="font-semibold text-lg mb-2">{title}</h3>
          <div className="font-bold mb-2">Status: {status}</div>
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  // Render conversion test results
  const renderConversionResults = () => {
    if (!conversionResults) return null;
    
    const success = conversionResults.summary?.success === true;
    
    return (
      <div className="border rounded-lg overflow-hidden mb-4">
        <div className={`p-4 ${success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h3 className="font-semibold text-lg mb-2">PDF Conversion Diagnostics</h3>
          
          <div className="font-bold mb-2">
            Summary: {success ? 'Success' : 'Failed'}
            {conversionResults.summary?.successRate && ` (${conversionResults.summary.successRate})`}
          </div>
          
          {conversionResults.summary?.issues?.length > 0 && (
            <div className="mb-4 p-2 bg-red-100 rounded">
              <h4 className="font-bold text-red-700">Issues:</h4>
              <ul className="list-disc list-inside ml-2">
                {conversionResults.summary.issues.map((issue: string, idx: number) => (
                  <li key={idx} className="text-red-700">{issue}</li>
                ))}
              </ul>
            </div>
          )}
          
          {conversionResults.summary?.recommendations?.length > 0 && (
            <div className="mb-4 p-2 bg-blue-100 rounded">
              <h4 className="font-bold text-blue-700">Recommendations:</h4>
              <ul className="list-disc list-inside ml-2">
                {conversionResults.summary.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-blue-700">{rec}</li>
                ))}
              </ul>
            </div>
          )}
          
          <h4 className="font-bold mt-4 mb-2">Test Results:</h4>
          <div className="space-y-2">
            {conversionResults.tests?.map((test: any, idx: number) => (
              <div 
                key={idx} 
                className={`p-3 rounded ${
                  test.success ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                <div className="font-bold">
                  {test.success ? '✓ ' : '✗ '}{test.name}
                </div>
                {test.error && (
                  <div className="text-red-700 text-sm mt-1">{test.error}</div>
                )}
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto mt-2">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(test).filter(([key]) => 
                        !['name', 'success', 'error'].includes(key)
                      )
                    ), 
                    null, 2
                  )}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">PDFSpark Comprehensive Diagnostic Tool</h1>
      <p className="mb-4 text-gray-700">
        This tool helps diagnose file upload issues and PDF conversion problems. It runs a comprehensive set of tests
        on your environment, connections, and backend services.
      </p>
      
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Test Configuration</h2>
        
        <div className="mb-4">
          <label className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={useGeneratedFile}
              onChange={e => setUseGeneratedFile(e.target.checked)}
              className="mr-2"
            />
            <span>Use generated test PDF (recommended)</span>
          </label>
          
          {!useGeneratedFile && (
            <div className="mb-4">
              <label className="block mb-2">Or select your own PDF file:</label>
              <input 
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="border p-2 w-full"
              />
              {selectedFile && (
                <div className="mt-2 text-sm text-gray-600">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </div>
              )}
            </div>
          )}
        </div>
        
        <button
          onClick={runDiagnostics}
          disabled={isRunning || (!useGeneratedFile && !selectedFile)}
          className={`px-4 py-2 rounded text-white ${
            isRunning || (!useGeneratedFile && !selectedFile)
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          {isRunning ? 'Running Diagnostics...' : 'Run Comprehensive Diagnostics'}
        </button>
      </div>
      
      {/* Upload Diagnostics */}
      {results.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">File Upload Diagnostics</h2>
          
          <div className="space-y-4">
            {results.map((result, index) => (
              <div 
                key={index} 
                className={`border rounded-lg overflow-hidden ${
                  result.success ? 'border-green-300' : 'border-red-300'
                }`}
              >
                <div 
                  className={`p-4 flex justify-between items-center cursor-pointer ${
                    result.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
                  onClick={() => toggleSection(index)}
                >
                  <div className="flex items-center">
                    <span className={`inline-block w-5 h-5 rounded-full mr-3 ${
                      result.success ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                      {result.success ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span className="font-medium">{result.message}</span>
                  </div>
                  <svg 
                    className={`h-5 w-5 transform ${expandedSections[index] ? 'rotate-180' : ''}`} 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                
                {expandedSections[index] && result.details && (
                  <div className="p-4 bg-white border-t">
                    <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
                      {JSON.stringify(result.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Backend Diagnostics */}
      {(backendResults.fileSystem || backendResults.memory || backendResults.cloudinary || backendResults.database) && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Backend System Diagnostics</h2>
          
          {renderBackendResult('File System Check', backendResults.fileSystem)}
          {renderBackendResult('Memory Status', backendResults.memory)}
          {renderBackendResult('Cloudinary Integration', backendResults.cloudinary)}
          {renderBackendResult('Database Connection', backendResults.database)}
        </div>
      )}
      
      {/* PDF Conversion Results */}
      {conversionResults && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">PDF Conversion Diagnostics</h2>
          {renderConversionResults()}
        </div>
      )}
      
      <div className="mt-8 text-sm text-gray-600 border-t pt-4">
        <h3 className="font-semibold mb-2">Common Issues and Solutions:</h3>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>CORS Errors:</strong> Check that your backend server allows requests from your frontend domain</li>
          <li><strong>API Connectivity:</strong> Ensure the backend server is running and accessible</li>
          <li><strong>FormData Issues:</strong> Make sure your browser supports FormData and file uploads</li>
          <li><strong>File Size Limits:</strong> Free accounts have a 5MB file size limit</li>
          <li><strong>Network Problems:</strong> Check your internet connection</li>
          <li><strong>PDF Conversion Issues:</strong> Verify that you're using proper PDF files and the conversion service is working</li>
          <li><strong>Memory Issues:</strong> Railway deployments should have USE_MEMORY_FALLBACK=true set in environment variables</li>
          <li><strong>File System Problems:</strong> Ensure temporary directories are set to /tmp on Railway</li>
        </ul>
      </div>
    </div>
  );
};

export default UploadDiagnosticPage;