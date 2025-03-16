import { useState } from 'react';
import CloudinaryUploader from '../components/CloudinaryUploader';
import cloudinaryService from '../services/cloudinaryService';

// Check if Cloudinary is configured or in mock mode
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
const USE_MOCK = import.meta.env.VITE_MOCK_CLOUDINARY === 'true';
const IS_CONFIGURED = CLOUD_NAME !== '';

const CloudinaryDemoPage = () => {
  const [uploadedAsset, setUploadedAsset] = useState<any>(null);
  const [useDirectUpload, setUseDirectUpload] = useState(false);

  const handleUploadComplete = (asset: any) => {
    console.log('Upload completed:', asset);
    setUploadedAsset(asset);
  };

  const handleDeleteAsset = async () => {
    if (!uploadedAsset || !uploadedAsset.id) return;
    
    try {
      const success = await cloudinaryService.deleteAsset(uploadedAsset.id);
      if (success) {
        setUploadedAsset(null);
        alert('Asset deleted successfully');
      } else {
        alert('Failed to delete asset');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Error deleting asset');
    }
  };

  const generateTransformedUrls = () => {
    if (!uploadedAsset || !uploadedAsset.id || uploadedAsset.format === 'pdf') return null;
    
    // Generate a few different transformations to demonstrate Cloudinary's capabilities
    return (
      <div className="transformations mt-6">
        <h3 className="font-medium text-gray-700 mb-2">Image Transformations</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Original Image */}
          <div className="transformation-item">
            <img 
              src={uploadedAsset.secureUrl || uploadedAsset.url}
              alt="Original"
              className="w-full rounded-lg shadow-sm"
            />
            <p className="text-xs text-center mt-1">Original</p>
          </div>
          
          {/* Thumbnail */}
          <div className="transformation-item">
            <img 
              src={cloudinaryService.getImageUrl(uploadedAsset.id, {
                width: 150,
                height: 150,
                crop: 'fill'
              })}
              alt="Thumbnail"
              className="w-full rounded-lg shadow-sm"
            />
            <p className="text-xs text-center mt-1">Thumbnail (150x150)</p>
          </div>
          
          {/* Grayscale */}
          <div className="transformation-item">
            <img 
              src={`https://res.cloudinary.com/${CLOUD_NAME}/image/upload/e_grayscale/${uploadedAsset.id}`}
              alt="Grayscale"
              className="w-full rounded-lg shadow-sm"
            />
            <p className="text-xs text-center mt-1">Grayscale</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Cloudinary Media Management</h1>
        <p className="text-lg text-gray-600">
          Upload, transform, and manage your media assets with Cloudinary
        </p>
        {!IS_CONFIGURED && (
          <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded-md inline-block">
            <p className="text-sm">
              <strong>Notice:</strong> Cloudinary credentials not configured. 
              Using mock implementation.
            </p>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Media</h2>
          <p className="text-gray-600 mb-6">
            Upload images and PDF files to Cloudinary for secure storage and fast delivery.
          </p>
          
          {IS_CONFIGURED && (
            <div className="mb-5 flex items-center">
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useDirectUpload}
                  onChange={() => setUseDirectUpload(!useDirectUpload)}
                  className="mr-2 h-4 w-4" 
                />
                <span>Use direct client-side upload (faster with progress tracking)</span>
              </label>
            </div>
          )}

          <CloudinaryUploader 
            onUploadComplete={handleUploadComplete}
            folder="pdfspark-demo"
            tags={['demo', 'pdfspark']}
            maxFileSizeMB={10}
            allowedFileTypes={['image/jpeg', 'image/png', 'image/gif', 'application/pdf']}
            directUpload={useDirectUpload && IS_CONFIGURED}
          />
        </div>

        {uploadedAsset && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Asset Information</h2>
            
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 mb-2">Upload Details</h3>
              <div className="bg-gray-100 p-4 rounded-lg overflow-hidden">
                <pre className="text-sm overflow-x-auto">
                  {JSON.stringify(uploadedAsset, null, 2)}
                </pre>
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 mb-2">Public URL</h3>
              <a 
                href={uploadedAsset.secureUrl || uploadedAsset.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {uploadedAsset.secureUrl || uploadedAsset.url}
              </a>
            </div>
            
            {/* Show transformations for images only */}
            {uploadedAsset.format !== 'pdf' && !uploadedAsset.id.startsWith('mock-') && generateTransformedUrls()}
            
            <div className="mt-6">
              <button 
                onClick={handleDeleteAsset}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete Asset
              </button>
            </div>
            
            {USE_MOCK ? (
              <p className="text-sm text-gray-500 mt-4">
                Note: This is a demo implementation using mock service. Create a Cloudinary account and 
                configure the environment variables to enable full functionality.
              </p>
            ) : (
              <p className="text-sm text-gray-500 mt-4">
                Your files are stored securely in Cloudinary and can be accessed globally via their CDN.
                You can apply transformations to images by modifying the URL parameters.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudinaryDemoPage;