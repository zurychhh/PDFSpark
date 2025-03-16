import { useState } from 'react';
import CloudinaryUploader from '../components/CloudinaryUploader';

const CloudinaryDemoPage = () => {
  const [uploadedAsset, setUploadedAsset] = useState<any>(null);

  const handleUploadComplete = (asset: any) => {
    console.log('Upload completed:', asset);
    setUploadedAsset(asset);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Media Management Demo</h1>
        <p className="text-lg text-gray-600">
          Upload, preview, and manage your media assets
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Media</h2>
          <p className="text-gray-600 mb-6">
            Upload images and PDF files to preview and manage them.
          </p>

          <CloudinaryUploader 
            onUploadComplete={handleUploadComplete}
            folder="pdfspark-demo"
            tags={['demo', 'pdfspark']}
            maxFileSizeMB={10}
            allowedFileTypes={['image/jpeg', 'image/png', 'image/gif', 'application/pdf']}
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
            
            <p className="text-sm text-gray-500 mt-4">
              Note: This is a demo implementation using local browser storage. In a production environment, files would be stored in Cloudinary's CDN.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudinaryDemoPage;