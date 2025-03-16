import { useState } from 'react';
import CloudinaryUploader from '../components/CloudinaryUploader';
import { CloudinaryContext } from 'cloudinary-react';

const CloudinaryDemoPage = () => {
  const [uploadedAsset, setUploadedAsset] = useState<any>(null);

  const handleUploadComplete = (asset: any) => {
    console.log('Upload completed:', asset);
    setUploadedAsset(asset);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Cloudinary Media Management</h1>
        <p className="text-lg text-gray-600">
          Upload, transform, and manage your media assets with Cloudinary integration
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload Media</h2>
          <p className="text-gray-600 mb-6">
            Upload images and PDF files to Cloudinary for secure storage and fast delivery.
          </p>

          <CloudinaryContext cloudName="pdfspark">
            <CloudinaryUploader 
              onUploadComplete={handleUploadComplete}
              folder="pdfspark-demo"
              tags={['demo', 'pdfspark']}
              maxFileSizeMB={10}
              allowedFileTypes={['image/jpeg', 'image/png', 'image/gif', 'application/pdf']}
            />
          </CloudinaryContext>
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
                href={uploadedAsset.secureUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {uploadedAsset.secureUrl}
              </a>
            </div>
            
            <p className="text-sm text-gray-500 mt-4">
              Your uploaded files are now securely stored in Cloudinary and can be accessed via their CDN for fast, global delivery.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudinaryDemoPage;