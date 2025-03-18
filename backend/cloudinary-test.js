/**
 * Cloudinary integration test script
 * This script tests uploading and retrieving a file from Cloudinary
 */
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create a simple test PDF file
function createTestPdf() {
  const testFilePath = path.join(__dirname, 'cloudinary-test.pdf');
  const simplePdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000053 00000 n
0000000102 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
149
%EOF`;

  fs.writeFileSync(testFilePath, simplePdfContent);
  console.log(`Created test PDF file at: ${testFilePath}`);
  return testFilePath;
}

// Test uploading to Cloudinary
async function testCloudinaryUpload() {
  try {
    console.log('\n--- Testing Cloudinary Integration ---');
    console.log(`Cloudinary configuration:
- Cloud name: ${process.env.CLOUDINARY_CLOUD_NAME}
- API key configured: ${process.env.CLOUDINARY_API_KEY ? 'Yes' : 'No'}
- API secret configured: ${process.env.CLOUDINARY_API_SECRET ? 'Yes' : 'No'}`);

    // 1. Create a test file
    const testFilePath = createTestPdf();
    
    // 2. Test API ping
    console.log('\nPinging Cloudinary API...');
    const pingResult = await cloudinary.api.ping();
    console.log('Ping result:', JSON.stringify(pingResult, null, 2));
    
    // 3. Get account info/usage
    console.log('\nGetting account usage info...');
    const usageResult = await cloudinary.api.usage();
    console.log('Usage:', JSON.stringify({
      credits: usageResult.credits,
      bandwidth: usageResult.bandwidth,
      storage: usageResult.storage
    }, null, 2));
    
    // 4. Upload test file
    console.log('\nUploading test file to Cloudinary...');
    console.time('Upload duration');
    const uploadResult = await cloudinary.uploader.upload(testFilePath, {
      folder: 'pdfspark_test',
      resource_type: 'raw',
      tags: ['test', 'cloudinary-test-script']
    });
    console.timeEnd('Upload duration');
    
    console.log('Upload successful!');
    console.log('- Public ID:', uploadResult.public_id);
    console.log('- URL:', uploadResult.secure_url);
    console.log('- Resource type:', uploadResult.resource_type);
    console.log('- Format:', uploadResult.format);
    console.log('- Size:', uploadResult.bytes, 'bytes');
    
    // 5. Generate a download URL
    console.log('\nGenerating download URL...');
    const downloadUrl = cloudinary.url(uploadResult.public_id, {
      resource_type: 'raw',
      flags: 'attachment',
      sign_url: true
    });
    console.log('Download URL:', downloadUrl);
    
    // 6. Clean up (delete the test file from Cloudinary)
    console.log('\nCleaning up (deleting test file from Cloudinary)...');
    const deleteResult = await cloudinary.uploader.destroy(uploadResult.public_id, {
      resource_type: 'raw'
    });
    console.log('Delete result:', deleteResult.result);
    
    // Clean up local file
    fs.unlinkSync(testFilePath);
    console.log('Deleted local test file');
    
    console.log('\n✅ Cloudinary integration test completed successfully!');
    return true;
  } catch (error) {
    console.error('\n❌ Cloudinary integration test failed:');
    console.error('Error:', error.message);
    if (error.http_code) {
      console.error('HTTP Code:', error.http_code);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return false;
  }
}

// Run the test
testCloudinaryUpload().then(success => {
  console.log('\nTest result:', success ? 'PASSED' : 'FAILED');
  process.exit(success ? 0 : 1);
});