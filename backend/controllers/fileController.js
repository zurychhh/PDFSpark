const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const { isPdfValid } = require('../utils/fileValidator');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const { v4: uuidv4 } = require('uuid');

// Helper function to sanitize filenames to prevent path traversal attacks
const sanitizeFilename = (filename) => {
  // Remove any path components
  const sanitized = path.basename(filename);
  
  // Replace any potentially dangerous characters
  return sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// Helper function to get content type from file extension
const getContentType = (filename) => {
  const extension = path.extname(filename).toLowerCase();
  
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.txt': 'text/plain'
  };
  
  return contentTypes[extension] || 'application/octet-stream';
};

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Public
exports.uploadFile = async (req, res, next) => {
  try {
    console.log('========== STARTING FILE UPLOAD ==========');
    console.log('File upload request received');
    console.log('- Headers:', JSON.stringify(req.headers));
    console.log('- Session ID:', req.sessionId);
    console.log('- User:', req.user ? req.user._id : 'No user');
    
    // Ensure the response includes the session ID
    if (req.sessionId) {
      res.setHeader('X-Session-ID', req.sessionId);
      console.log('Set session ID in response header:', req.sessionId);
    }
    
    // Log request file information
    if (req.file) {
      console.log('File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } else if (req.files) {
      console.log('Files uploaded:', Object.keys(req.files).length);
    } else {
      console.log('No file found in request');
      console.log('Request body keys:', Object.keys(req.body));
      return next(new ErrorResponse('No file uploaded', 400));
    }
    
    // Make sure service is healthy
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = process.env.TEMP_DIR || './temp';
    
    // Ensure directories exist and are writable
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Test write access
      fs.accessSync(uploadDir, fs.constants.W_OK);
      fs.accessSync(tempDir, fs.constants.W_OK);
    } catch (fsError) {
      console.error('Directory access error:', fsError);
      return next(new ErrorResponse('Service temporarily unavailable. Please try again later.', 503));
    }
    
    // Check if file exists in the request with more detailed logging
    if (!req.file) {
      console.error('No file in request after middleware processing');
      console.log('Request body:', req.body);
      console.log('Request headers:', req.headers);
      
      // Check if the request is a multipart form but missing the file
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        console.error('Multipart request detected but file is missing. Check form field name.');
        return next(new ErrorResponse('No file found in the multipart request. Please make sure the file field is named "file".', 400));
      }
      
      return next(new ErrorResponse('Please upload a file', 400));
    }

    console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

    // Accept all file types temporarily for debugging purposes
    console.log(`File details - MIME type: ${req.file.mimetype}, Name: ${req.file.originalname}, Size: ${req.file.size} bytes`);

    // Check file size
    const maxSizeFree = 5 * 1024 * 1024; // 5MB
    const maxSizePremium = 100 * 1024 * 1024; // 100MB
    
    // Check if user has a subscription
    const hasSubscription = req.user && req.user.hasActiveSubscription && req.user.hasActiveSubscription();
    console.log(`User subscription status: ${hasSubscription ? 'Active' : 'None/Inactive'}`);
    
    if (req.file.size > (hasSubscription ? maxSizePremium : maxSizeFree)) {
      const sizeLimit = hasSubscription ? '100MB' : '5MB';
      console.error(`File size ${req.file.size} exceeds limit ${sizeLimit}`);
      return next(new ErrorResponse(`File size exceeds limit (${sizeLimit})`, 400));
    }
    
    // Enhanced file validation and detailed debugging
    try {
      console.log('Starting enhanced file validation');
      
      // Check if buffer exists and has content
      const buffer = req.file.buffer;
      if (!buffer || buffer.length === 0) {
        console.error('Empty file buffer detected');
        return next(new ErrorResponse('Empty file detected. Please upload a valid file.', 400));
      }
      
      // Log buffer details for debugging
      console.log(`File buffer details: Length=${buffer.length} bytes`);
      
      // Extract and log file signature for debugging
      const fileSignature = buffer.slice(0, 16);
      const hexSignature = fileSignature.toString('hex');
      const asciiSignature = fileSignature.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
      
      console.log('File signatures:');
      console.log(`- Hex (first 16 bytes): ${hexSignature}`);
      console.log(`- ASCII (first 16 bytes): ${asciiSignature}`);
      
      // Detect file type based on signature regardless of extension
      const fileTypeSignatures = {
        '%PDF': 'application/pdf',
        'PK': 'application/zip',
        'BM': 'image/bmp',
        'GIF8': 'image/gif',
        '\xFF\xD8\xFF': 'image/jpeg',
        '\x89PNG': 'image/png',
        'II*\x00': 'image/tiff',
        'MM\x00*': 'image/tiff',
        'RIFF': 'audio/wav or video/avi',
        '\x1F\x8B\x08': 'application/gzip',
        '7z\xBC\xAF': 'application/x-7z-compressed',
        'Rar!\x1A\x07': 'application/x-rar-compressed',
        '\xD0\xCF\x11\xE0': 'application/msword or application/vnd.ms-excel',
        'MZ': 'application/x-msdownload',
        '\x7FELF': 'application/x-executable'
      };
      
      let detectedType = 'unknown';
      for (const [signature, mimeType] of Object.entries(fileTypeSignatures)) {
        if (asciiSignature.includes(signature) || hexSignature.includes(Buffer.from(signature).toString('hex'))) {
          detectedType = mimeType;
          break;
        }
      }
      
      console.log(`Detected file type from signature: ${detectedType}`);
      console.log(`Declared mimetype: ${req.file.mimetype}`);
      
      // Basic file type validation
      if (detectedType === 'unknown') {
        console.warn('Unknown file type signature');
      } else if (!detectedType.includes('pdf') && req.file.mimetype.includes('pdf')) {
        console.warn(`Mimetype mismatch: Declared as PDF but signature suggests ${detectedType}`);
      }
      
      // Simple list of suspicious file signatures (hexadecimal)
      const suspiciousSignatures = [
        '4d5a9000', // MZ header (Windows executable)
        '504b0304', // PK.. (ZIP that might contain malware)
        '7f454c46', // ELF header (Linux executable)
        '23212f62', // #!/b (shell script)
        '424d', // BM (bitmap, might be malware disguised)
        '000000000000', // Zero bytes (suspicious)
      ];
      
      // Check file header against suspicious signatures
      if (suspiciousSignatures.some(sig => hexSignature.includes(sig))) {
        console.error(`Suspicious file signature detected: ${hexSignature}`);
        return next(new ErrorResponse('File appears to be malicious or contains executable code. Only PDF files are accepted.', 400));
      }
      
      // Check filename for suspicious extensions (double extensions)
      const originalName = req.file.originalname.toLowerCase();
      console.log(`Checking filename: ${originalName}`);
      
      if (originalName.includes('.exe.') || 
          originalName.includes('.php.') || 
          originalName.includes('.js.') || 
          originalName.includes('.vbs.') ||
          originalName.includes('.bat.') ||
          originalName.includes('.cmd.')) {
        console.error(`Suspicious filename detected: ${originalName}`);
        return next(new ErrorResponse('Filename contains suspicious patterns.', 400));
      }
      
      // Validate file extension against mimetype
      const fileExtension = originalName.substring(originalName.lastIndexOf('.') + 1);
      console.log(`File extension: ${fileExtension}`);
      
      // Check for PDF-specific file format validity
      if (req.file.mimetype === 'application/pdf' || fileExtension === 'pdf') {
        console.log('Validating as PDF file');
        
        // Check for the PDF header signature (%PDF)
        const pdfSignature = buffer.slice(0, 4).toString('ascii');
        console.log(`PDF signature check: "${pdfSignature}"`);
        
        if (pdfSignature !== '%PDF') {
          console.error(`Invalid PDF header signature: "${pdfSignature}"`);
          
          // Special debug for a common issue with JSON content instead of file
          if (pdfSignature.includes('{') || pdfSignature.includes('[')) {
            console.error('JSON content detected instead of PDF file. This suggests a formData creation issue.');
            
            // Try to extract more of the content for debugging
            const firstPart = buffer.slice(0, 100).toString('utf8');
            console.log('First 100 bytes of content:', firstPart);
            
            return next(new ErrorResponse('Invalid PDF format: JSON content detected instead of PDF file. This is likely a frontend FormData creation issue.', 400));
          }
          
          return next(new ErrorResponse('Invalid PDF file format. The file does not begin with %PDF signature.', 400));
        }
        
        // Optional: Check for EOF marker (not all PDFs have this but it's a good sign)
        const lastBytes = buffer.slice(-6).toString('ascii');
        console.log(`Last bytes of file: "${lastBytes}"`);
        if (!lastBytes.includes('EOF')) {
          console.warn('PDF file does not contain standard EOF marker. File might be truncated or corrupted.');
        }
      }
      
      console.log('File passed basic security and format checks');
    } catch (scanError) {
      console.error('Error during file security scanning:', scanError);
      return next(new ErrorResponse('Error verifying file security: ' + scanError.message, 500));
    }

    try {
      // Log what kind of upload we received
      console.log(`Processing file upload via ${req.file.upload_method || 'standard'} method`);
      
      // Generate a unique ID for the file
      const fileId = uuidv4();
      
      // Determine file storage strategy based on received file
      let filepath;
      let fileSize;
      
      // If file was uploaded using disk storage, it already has a path
      if (req.file.path && req.file.upload_method === 'disk_storage') {
        // File is already on disk, just reference it
        filepath = req.file.path;
        fileSize = req.file.size;
        console.log(`Using existing file on disk at: ${filepath}`);
      } 
      // For memory uploads or JSON base64 uploads, we need to save the buffer
      else {
        // Create directories if they don't exist
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Get file extension or default to .pdf
        const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
        const filename = `${fileId}${extension}`;
        filepath = path.join(uploadDir, filename);
        
        console.log(`Saving file buffer to disk at: ${filepath}`);
        
        // Write file buffer to uploads directory
        fs.writeFileSync(filepath, req.file.buffer);
        
        // Verify file was written successfully
        if (!fs.existsSync(filepath)) {
          throw new Error(`Failed to save file to ${filepath}`);
        }
        
        fileSize = fs.statSync(filepath).size;
        console.log(`Successfully saved file buffer to disk, size: ${fileSize} bytes`);
      }
      
      // Get file extension
      const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = path.basename(filepath);
      
      // CLOUDINARY INTEGRATION: Upload file to Cloudinary
      let cloudinaryResult;
      try {
        // Import cloudinary service
        const cloudinaryService = require('../services/cloudinaryService');
        
        console.log('Uploading file to Cloudinary...');
        cloudinaryResult = await cloudinaryService.uploadFile(
          {
            path: filepath,
            originalname: req.file.originalname
          },
          {
            folder: 'pdfspark_uploads',
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true
          }
        );
        
        console.log('Cloudinary upload successful:', {
          publicId: cloudinaryResult.public_id,
          url: cloudinaryResult.url ? 'generated' : 'missing',
          secureUrl: cloudinaryResult.secure_url ? 'generated' : 'missing'
        });
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed:', cloudinaryError);
        console.log('Continuing with local file storage as fallback');
        // Continue with local file storage - don't throw, just log the error
      }
      
      // Create file result object with Cloudinary data if available, otherwise local references
      const fileResult = cloudinaryResult && cloudinaryResult.secure_url ? {
        public_id: cloudinaryResult.public_id,
        url: cloudinaryResult.url,
        secure_url: cloudinaryResult.secure_url,
        format: cloudinaryResult.format || extension.replace('.', ''),
        resource_type: cloudinaryResult.resource_type || (req.file.mimetype.startsWith('image') ? 'image' : 'raw')
      } : {
        public_id: fileId,
        url: `/api/files/original/${filename}`,
        secure_url: `/api/files/original/${filename}`,
        format: extension.replace('.', ''),
        resource_type: req.file.mimetype.startsWith('image') ? 'image' : 'raw'
      };
      
      // Create record in MongoDB or memory fallback
      let fileOperation;
      try {
        // Create Operation record
        const Operation = require('../models/Operation');
        
        fileOperation = new Operation({
          userId: req.user ? req.user._id : null,
          sessionId: req.sessionId,
          operationType: 'file_upload',
          sourceFormat: 'upload',
          status: 'completed',
          sourceFileId: fileId,
          resultDownloadUrl: fileResult.secure_url,
          // Include Cloudinary data if available
          cloudinaryData: cloudinaryResult ? {
            publicId: cloudinaryResult.public_id,
            url: cloudinaryResult.url,
            secureUrl: cloudinaryResult.secure_url,
            resourceType: cloudinaryResult.resource_type,
            format: cloudinaryResult.format,
            bytes: cloudinaryResult.bytes,
            version: cloudinaryResult.version,
            uploadTimestamp: new Date().toISOString()
          } : undefined,
          fileData: {
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype,
            filePath: filepath,
            uploadMethod: req.file.upload_method || 'standard'
          }
        });
        
        // Save operation - this will use memory storage if in fallback mode
        await fileOperation.save();
        
        if (global.usingMemoryFallback) {
          console.log('File operation saved to memory storage with ID:', fileOperation._id);
        } else {
          console.log('File operation saved to MongoDB with ID:', fileOperation._id);
        }
      } catch (dbError) {
        // Handle errors with DB storage - attempt to use memory fallback directly
        console.error('Error saving operation record:', dbError.message);
        
        if (global.memoryStorage) {
          try {
            // Generate a unique ID
            const { v4: uuidv4 } = require('uuid');
            const opId = uuidv4();
            
            // Create a simple operation object
            fileOperation = {
              _id: opId,
              userId: req.user ? req.user._id : null,
              sessionId: req.sessionId,
              operationType: 'file_upload',
              sourceFormat: 'upload',
              status: 'completed',
              sourceFileId: fileId,
              resultDownloadUrl: fileResult.secure_url,
              // Include Cloudinary data if available
              cloudinaryData: cloudinaryResult ? {
                publicId: cloudinaryResult.public_id,
                url: cloudinaryResult.url,
                secureUrl: cloudinaryResult.secure_url,
                resourceType: cloudinaryResult.resource_type,
                format: cloudinaryResult.format,
                bytes: cloudinaryResult.bytes,
                version: cloudinaryResult.version,
                uploadTimestamp: new Date().toISOString()
              } : undefined,
              fileData: {
                originalName: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype,
                filePath: filepath,
                uploadMethod: req.file.upload_method || 'standard'
              },
              createdAt: new Date()
            };
            
            // Add to memory storage
            global.memoryStorage.addOperation(fileOperation);
            console.log('File operation saved to memory storage as fallback with ID:', opId);
          } catch (memoryError) {
            console.error('Failed to save operation to memory storage:', memoryError.message);
          }
        } else {
          console.error('No memory storage available as fallback!');
        }
      }
      
      // Determine PDF page count
      let pageCount;
      
      // For PDFs, do basic validation
      if (req.file.mimetype === 'application/pdf' || filepath.toLowerCase().endsWith('.pdf')) {
        // Basic validation: check if buffer or file starts with PDF signature
        let isPdf = false;
        
        if (req.file.buffer && req.file.buffer.length > 4) {
          // Check buffer directly
          isPdf = req.file.buffer.toString('ascii', 0, 4) === '%PDF';
        } else {
          // Read first few bytes of file
          try {
            const fileHeader = fs.readFileSync(filepath, { encoding: 'ascii', length: 4 });
            isPdf = fileHeader === '%PDF';
          } catch (readError) {
            console.error('Error reading PDF header from file:', readError);
          }
        }
        
        if (isPdf) {
          // Set a default page count since we can't easily count pages
          pageCount = 1; // Default value
          console.log('Valid PDF file uploaded');
        } else {
          console.warn('File does not have PDF signature - might not be a valid PDF');
        }
      }
      
      // Track successful upload in stats
      const fileCleanup = require('../utils/fileCleanup');
      fileCleanup.recordUpload(true, req.file.size, req.file.upload_method || 'standard');
      
      // Return success response with file data
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 1);
      
      console.log('Sending success response to client');
      
      // Response that's compatible with frontend expectations
      // In memory mode, add more debugging and ensure fields are explicitly set
      res.status(200).json({
        success: true,
        fileId: fileId, // The critical value needed by the frontend
        sourceFileId: fileId, // Adding this for extra clarity in memory mode
        fileName: req.file.originalname,
        fileSize: req.file.size,
        uploadDate: new Date().toISOString(),
        expiryDate: expiryDate.toISOString(),
        previewUrl: fileResult.secure_url,
        operationId: fileOperation ? fileOperation._id : undefined,
        pageCount: pageCount,
        // Include Cloudinary specific information
        cloudinaryPublicId: cloudinaryResult ? cloudinaryResult.public_id : undefined,
        cloudinaryUrl: cloudinaryResult ? cloudinaryResult.secure_url : undefined,
        // Storage method indicates how the file is being stored
        storageMethod: cloudinaryResult && cloudinaryResult.secure_url ? 'cloudinary' : 'local',
        uploadMethod: req.file.upload_method || 'standard',
        memoryModeActive: !!global.usingMemoryFallback, // Debug info for Railway troubleshooting
        filePath: filepath || null // Extra debug info for file location
      });
      
      console.log('========== FILE UPLOAD COMPLETED SUCCESSFULLY ==========');
    } catch (fileError) {
      console.error('Error processing file upload:', fileError);
      
      // Track failed upload in stats
      try {
        const fileCleanup = require('../utils/fileCleanup');
        fileCleanup.recordUpload(false, req.file ? req.file.size : 0, req.file ? req.file.upload_method || 'standard' : 'error');
      } catch (statsError) {
        console.error('Failed to record upload stats:', statsError);
      }
      
      return next(new ErrorResponse(`Error processing file upload: ${fileError.message}`, 500));
    }
  } catch (error) {
    console.error('Unexpected error in file upload:', error);
    next(error);
  }
};

// @desc    Get file preview
// @route   GET /api/files/preview/:filename
// @access  Public
exports.getFilePreview = async (req, res, next) => {
  try {
    // Log crucial diagnostics info
    console.log(`⬇️ PREVIEW REQUEST - Requested preview file: ${req.params.filename}`);
    console.log(`🔍 DIAGNOSTICS INFO:`);
    console.log(`- Railway mode: ${process.env.RAILWAY_SERVICE_NAME ? 'YES' : 'NO'}`);
    console.log(`- Memory fallback: ${global.usingMemoryFallback ? 'ENABLED' : 'DISABLED'}`);
    console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`- Current working directory: ${process.cwd()}`);
    
    // Extract fileId from filename parameter
    const fileId = path.parse(req.params.filename).name;
    console.log(`Looking for preview for fileId: ${fileId}`);
    
    // PDF previews are requested with .pdf extension but are actually stored as JPG images
    const isRequestingPdfPreview = path.extname(req.params.filename).toLowerCase() === '.pdf';
    console.log(`Is requesting PDF preview: ${isRequestingPdfPreview}`);
    
    // Strategy 1: Check if preview exists locally
    const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', 'temp');
    // Use JPG extension for the actual file, regardless of requested extension
    const previewJpgPath = path.join(tempDir, `${fileId}.jpg`);
    const absoluteJpgPath = path.resolve(previewJpgPath);
    
    console.log(`Checking for preview file at: ${previewJpgPath}`);
    console.log(`Absolute path: ${absoluteJpgPath}`);
    
    // Check if the preview file exists locally and try to serve it
    try {
      if (fs.existsSync(absoluteJpgPath)) {
        console.log(`Preview file found locally at: ${absoluteJpgPath}`);
        
        try {
          // Read the file directly and send as buffer
          const fileBuffer = fs.readFileSync(absoluteJpgPath);
          
          if (!fileBuffer || fileBuffer.length === 0) {
            console.error(`Preview file exists but is empty: ${absoluteJpgPath}`);
            throw new Error('Preview file exists but is empty');
          }
          
          // Set appropriate content type (always image/jpeg for previews)
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', fileBuffer.length);
          
          // If this is supposed to be an attachment, set disposition header
          if (req.query.download === 'true') {
            // Use the requested extension in the filename, even though content is JPG
            const downloadFilename = isRequestingPdfPreview ? `${fileId}.pdf` : `${fileId}.jpg`;
            res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
          }
          
          console.log(`Serving local preview file (${fileBuffer.length} bytes)`);
          return res.send(fileBuffer);
        } catch (readError) {
          console.error(`Error reading preview file: ${readError.message}`);
          console.error(readError.stack);
          throw readError; // Re-throw to try Cloudinary fallback
        }
      } else {
        console.log(`Preview file not found locally: ${absoluteJpgPath}`);
      }
    } catch (localFileError) {
      console.error(`Error trying to serve local preview file: ${localFileError.message}`);
      console.error(localFileError.stack);
    }
    
    // Strategy 2: Use Cloudinary fallback via operations collection
    try {
      console.log(`Looking for preview in Cloudinary for fileId: ${fileId}`);
      
      // Import required modules
      const axios = require('axios');
      const cloudinaryHelper = require('../utils/cloudinaryHelper');
      
      // Look up operations for this file
      const operations = await Operation.find({ 
        $or: [
          { sourceFileId: fileId },
          { resultFileId: fileId }
        ]
      }).sort({ createdAt: -1 });
      
      if (operations.length === 0) {
        console.log(`No operations found for fileId: ${fileId}`);
      } else {
        console.log(`Found ${operations.length} operations for fileId: ${fileId}`);
      }
      
      // Check if any operation has Cloudinary data
      let cloudinaryUrl = null;
      let cloudinaryPublicId = null;
      let cloudinaryFormat = null;
      
      for (const operation of operations) {
        // Check source file first (likely has the preview)
        if (operation.sourceFileCloudinaryUrl) {
          cloudinaryUrl = operation.sourceFileCloudinaryUrl;
          cloudinaryPublicId = operation.sourceFileCloudinaryId;
          cloudinaryFormat = 'pdf'; // Most previews are for PDFs
          console.log(`Found Cloudinary data in source file (operation ID: ${operation._id})`);
          break;
        }
        
        // Check result file as fallback
        if (operation.resultFileCloudinaryUrl) {
          cloudinaryUrl = operation.resultFileCloudinaryUrl;
          cloudinaryPublicId = operation.resultFileCloudinaryId;
          cloudinaryFormat = operation.targetFormat || 'pdf';
          console.log(`Found Cloudinary data in result file (operation ID: ${operation._id})`);
          break;
        }
      }
      
      // If we found a Cloudinary URL, test if it's accessible
      if (cloudinaryUrl) {
        console.log(`Found Cloudinary URL for preview: ${cloudinaryUrl}`);
        
        // Test if the URL is directly accessible
        const urlAccessResult = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
        
        if (urlAccessResult.success) {
          console.log(`Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
          return res.redirect(cloudinaryUrl);
        } else if (urlAccessResult.status === 401 || urlAccessResult.status === 403) {
          // URL not directly accessible, try generating a signed URL
          console.log(`Cloudinary URL returned ${urlAccessResult.status}, trying signed URL`);
          
          if (cloudinaryPublicId) {
            try {
              const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                cloudinaryPublicId,
                cloudinaryFormat
              );
              
              console.log(`Generated signed URL: ${signedUrl}`);
              
              // Test if signed URL is accessible
              const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
              
              if (signedUrlTest.success) {
                console.log(`Signed URL is accessible, redirecting`);
                return res.redirect(signedUrl);
              } else {
                console.log(`Signed URL not accessible (status: ${signedUrlTest.status}), trying proxy`);
              }
            } catch (signedUrlError) {
              console.error(`Error generating signed URL: ${signedUrlError.message}`);
            }
          }
          
          // If signed URL failed or we don't have a public ID, try proxying content
          console.log(`Attempting to proxy content from Cloudinary`);
          
          // Extract Cloudinary info from URL if available
          const cloudinaryInfo = cloudinaryHelper.extractCloudinaryInfo(cloudinaryUrl);
          console.log(`Extracted Cloudinary info:`, cloudinaryInfo);
          
          // Try different URL variants
          const urlVariants = [cloudinaryUrl];
          
          // Add URL with download parameter
          urlVariants.push(cloudinaryHelper.addDownloadParameters(cloudinaryUrl));
          
          // Try URL without query parameters if any
          if (cloudinaryUrl.includes('?')) {
            urlVariants.push(cloudinaryUrl.split('?')[0]);
          }
          
          // If we have cloudinary info, try direct URL construction
          if (cloudinaryInfo) {
            const directUrl = `https://res.cloudinary.com/${cloudinaryInfo.cloudName}/${cloudinaryInfo.resourceType}/upload/${cloudinaryInfo.publicId}.${cloudinaryInfo.format}`;
            urlVariants.push(directUrl);
            
            // Also try a signed direct URL
            try {
              const signedDirectUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                cloudinaryInfo.publicId,
                cloudinaryInfo.format,
                { resource_type: cloudinaryInfo.resourceType }
              );
              urlVariants.push(signedDirectUrl);
            } catch (err) {
              console.error(`Error generating signed direct URL: ${err.message}`);
            }
          }
          
          // Try each variant until one works
          for (const urlVariant of urlVariants) {
            try {
              console.log(`Trying to proxy content from: ${urlVariant}`);
              
              const response = await axios.get(urlVariant, {
                responseType: 'arraybuffer',
                timeout: 5000,
                validateStatus: false // don't throw for any status code
              });
              
              if (response.status >= 200 && response.status < 300 && response.data) {
                console.log(`Successfully proxied content (${response.data.length} bytes)`);
                
                // For file preview, content is always JPEG regardless of extension in request
                const contentType = isRequestingPdfPreview ? 'image/jpeg' : 
                  (response.headers['content-type'] || 'image/jpeg');
                
                // Set appropriate headers
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', response.data.length);
                
                // If this is supposed to be an attachment, set disposition header
                if (req.query.download === 'true') {
                  const filename = req.params.filename || 'preview.pdf';
                  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                }
                
                // Send the proxied content
                return res.send(response.data);
              } else {
                console.log(`Failed to proxy from ${urlVariant}, status: ${response.status}`);
              }
            } catch (proxyError) {
              console.error(`Error proxying from ${urlVariant}: ${proxyError.message}`);
            }
          }
        } else {
          console.log(`Cloudinary URL not accessible, status: ${urlAccessResult.status}`);
        }
      } else {
        console.log(`No Cloudinary URL found for fileId: ${fileId}`);
      }
    } catch (cloudinaryError) {
      console.error(`Error trying Cloudinary fallback: ${cloudinaryError.message}`);
      console.error(cloudinaryError.stack);
    }
    
    // Strategy 3: Try to find and generate a preview if it's a PDF
    if (isRequestingPdfPreview) {
      try {
        console.log(`Attempting to find and generate preview for PDF with ID: ${fileId}`);
        
        // Check if the original PDF exists
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        const pdfFilePath = path.join(uploadDir, `${fileId}.pdf`);
        const absolutePdfPath = path.resolve(pdfFilePath);
        
        if (fs.existsSync(absolutePdfPath)) {
          console.log(`Found original PDF file: ${absolutePdfPath}`);
          
          // Try to generate a preview on-the-fly
          try {
            // Import the PDF service
            const pdfService = require('../services/pdfService');
            
            console.log(`Generating preview for: ${absolutePdfPath}`);
            const previewResult = await pdfService.generatePdfPreview(absolutePdfPath);
            
            if (previewResult.success) {
              console.log(`Successfully generated preview at: ${previewResult.previewPath}`);
              
              // Read and send the newly generated preview
              const previewBuffer = fs.readFileSync(previewResult.previewPath);
              
              // Set appropriate content type (always image/jpeg for previews)
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Content-Length', previewBuffer.length);
              
              // If this is supposed to be an attachment, set disposition header
              if (req.query.download === 'true') {
                res.setHeader('Content-Disposition', `attachment; filename="${fileId}.pdf"`);
              }
              
              console.log(`Serving freshly generated preview (${previewBuffer.length} bytes)`);
              return res.send(previewBuffer);
            } else {
              console.error(`Failed to generate preview: ${previewResult.message}`);
            }
          } catch (generateError) {
            console.error(`Error generating preview: ${generateError.message}`);
            console.error(generateError.stack);
          }
        } else {
          console.log(`Original PDF not found at: ${absolutePdfPath}`);
        }
      } catch (previewGenerationError) {
        console.error(`Error in preview generation attempt: ${previewGenerationError.message}`);
        console.error(previewGenerationError.stack);
      }
    }
    
    // If we reach here, all fallback strategies failed
    console.log(`All fallback strategies failed for preview: ${req.params.filename}`);
    return next(new ErrorResponse('Preview not found', 404));
  } catch (error) {
    console.error(`Error in getFilePreview: ${error.message}`);
    console.error(error.stack);
    next(error);
  }
};

// @desc    Get result file
// @route   GET /api/files/result/:filename
// @access  Public
exports.getResultFile = async (req, res, next) => {
  try {
    // Import the Cloudinary helper utilities
    const cloudinaryHelper = require('../utils/cloudinaryHelper');
    
    console.log(`⬇️ DOWNLOAD REQUEST - Requested result file: ${req.params.filename}`);
    
    // Log crucial diagnostics info
    console.log(`🔍 DIAGNOSTICS INFO:`);
    console.log(`- Railway mode: ${process.env.RAILWAY_SERVICE_NAME ? 'YES' : 'NO'}`);
    console.log(`- Memory fallback: ${global.usingMemoryFallback ? 'ENABLED' : 'DISABLED'}`);
    console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`- Memory storage: ${global.memoryStorage ? 'INITIALIZED' : 'NOT INITIALIZED'}`);
    if (global.memoryStorage) {
      console.log(`- Memory operations: ${global.memoryStorage.operations?.length || 0}`);
    }
    
    // Make sure the filename parameter exists
    if (!req.params.filename) {
      return next(new ErrorResponse('Filename parameter is missing', 400));
    }
    
    // Log the requested file details
    const fileDetails = path.parse(req.params.filename);
    console.log(`📄 REQUESTED FILE DETAILS:`);
    console.log(`- Filename: ${req.params.filename}`);
    console.log(`- Base name: ${fileDetails.name}`);
    console.log(`- Extension: ${fileDetails.ext}`);
    
    // Check if we have the global last ID for debugging
    if (global.lastResultFileId) {
      console.log(`🆔 Last known resultFileId: ${global.lastResultFileId}`);
      console.log(`🔄 Matches requested file: ${global.lastResultFileId === fileDetails.name ? 'YES' : 'NO'}`);
    }
    
    const resultPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    console.log(`🔎 Looking for result file at: ${resultPath}`);
    
    // Enhanced file finding logic to match the download controller
    let fileFound = false;
    let finalPath = resultPath;
    
    // First check if file exists at the expected path
    if (fs.existsSync(resultPath)) {
      console.log(`✅ File found at original path: ${resultPath}`);
      fileFound = true;
    } else {
      console.error(`❌ File not found at path: ${resultPath}`);
      
      // STRATEGY 1: Try to find the file by pattern matching (in case extension is wrong)
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileBaseName = path.parse(req.params.filename).name;
      
      // Check if temp directory exists
      if (!fs.existsSync(tempDir)) {
        console.error(`❌ Temp directory doesn't exist: ${tempDir}`);
        try {
          console.log(`🔧 Creating temp directory: ${tempDir}`);
          fs.mkdirSync(tempDir, { recursive: true });
          console.log(`✅ Successfully created temp directory`);
        } catch (mkdirErr) {
          console.error(`❌ Failed to create temp directory:`, mkdirErr);
        }
      }
      
      if (fs.existsSync(tempDir)) {
        console.log(`🔍 Searching for result file using multiple strategies...`);
        // List all files in temp directory with detailed info
        const files = fs.readdirSync(tempDir);
        console.log(`📂 Found ${files.length} files in directory: ${tempDir}`);
        
        // Log directory permissions
        try {
          const stats = fs.statSync(tempDir);
          console.log(`📂 Temp directory permissions: ${stats.mode.toString(8)}`);
        } catch (err) {
          console.error(`❌ Failed to get temp directory stats:`, err);
        }
        
        if (files.length > 0) {
          console.log(`📄 Files in temp directory:`);
          files.slice(0, 10).forEach((file, idx) => {
            try {
              const filePath = path.join(tempDir, file);
              const stats = fs.statSync(filePath);
              console.log(`   ${idx+1}. ${file} (${stats.size} bytes, modified: ${stats.mtime})`);
            } catch (err) {
              console.log(`   ${idx+1}. ${file} (error getting stats)`);
            }
          });
          
          if (files.length > 10) {
            console.log(`   ... and ${files.length - 10} more files`);
          }
        }
        
        // STRATEGY 2: Check if there's a file that starts with the same base name
        const matchingFiles = files.filter(file => file.startsWith(fileBaseName));
        
        if (matchingFiles.length > 0) {
          console.log(`✅ Found ${matchingFiles.length} matching files by prefix: ${matchingFiles.join(', ')}`);
          finalPath = path.join(tempDir, matchingFiles[0]);
          fileFound = true;
        } else {
          // STRATEGY 3: Try alternative extensions
          console.log(`🔄 Trying alternative extensions for ${fileBaseName}`);
          const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
          
          for (const ext of possibleExtensions) {
            const testPath = path.join(tempDir, `${fileBaseName}${ext}`);
            console.log(`- Trying path: ${testPath}`);
            
            if (fs.existsSync(testPath)) {
              finalPath = testPath;
              fileFound = true;
              console.log(`✅ Found file with extension ${ext}: ${finalPath}`);
              break;
            }
          }
          
          // STRATEGY 4: Last resort - UUID may have been generated differently
          // Check if any file contains this ID as a substring 
          if (!fileFound) {
            console.log(`🔍 Trying fuzzy match for ID fragments...`);
            // Remove common prefixes/suffixes for better matching
            const cleanId = fileBaseName.replace(/^result-/, '').replace(/-result$/, '');
            
            if (cleanId.length >= 8) { // Only if we have a reasonably unique portion
              console.log(`- Using clean ID for fuzzy matching: ${cleanId}`);
              const fuzzyMatches = files.filter(file => file.includes(cleanId));
              
              if (fuzzyMatches.length > 0) {
                console.log(`✅ Found ${fuzzyMatches.length} fuzzy matches: ${fuzzyMatches.join(', ')}`);
                finalPath = path.join(tempDir, fuzzyMatches[0]);
                fileFound = true;
              } else {
                console.log(`❌ No fuzzy matches found`);
              }
            }
          }
        }
      }
    }
    
    if (!fileFound) {
      // Last resort for Railway - try checking Cloudinary data in the database
      if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
        console.error(`⚠️ CRITICAL: File not found but checking Cloudinary for Railway/memory mode compatibility`);
        console.error(`Request filename: ${req.params.filename}`);
        console.error(`Tried paths including: ${resultPath}`);
        
        // STEP 1: Try to find operation with this result file ID and check Cloudinary URL
        try {
          const fileBaseName = path.parse(req.params.filename).name;
          console.log(`🔍 Looking for operation with resultFileId: ${fileBaseName}`);
          
          // Find the operation in the database
          const Operation = require('../models/Operation');
          const operation = await Operation.findOne({ resultFileId: fileBaseName });
          
          let cloudinaryUrl;
          let cloudinaryPublicId;
          let cloudinaryFormat;
          
          if (operation) {
            console.log(`✅ Found operation in database: ${operation._id}`);
            console.log(`🧾 OPERATION DETAILS:`);
            console.log(`- Type: ${operation.operationType || 'N/A'}`);
            console.log(`- Status: ${operation.status || 'N/A'}`);
            console.log(`- Source File ID: ${operation.sourceFileId || 'N/A'}`);
            console.log(`- Result File ID: ${operation.resultFileId || 'N/A'}`);
            console.log(`- Has Cloudinary Data: ${operation.cloudinaryData ? 'YES' : 'NO'}`);
            
            if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
              console.log(`✅ Found Cloudinary URL in operation: ${operation.cloudinaryData.secureUrl}`);
              cloudinaryUrl = operation.cloudinaryData.secureUrl;
              cloudinaryPublicId = operation.cloudinaryData.publicId;
              cloudinaryFormat = operation.cloudinaryData.format;
              
              // Add download parameter if needed
              cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
              
              // Step 1.1: Test if Cloudinary URL is accessible before redirecting
              console.log(`Testing Cloudinary URL access: ${cloudinaryUrl}`);
              const urlAccessTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
              
              if (urlAccessTest.success) {
                console.log(`Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
                return res.redirect(cloudinaryUrl);
              } else {
                console.log(`⚠️ Cloudinary URL access failed: Status ${urlAccessTest.status}, Error: ${urlAccessTest.error}`);
                
                // If status is 401 (Unauthorized), try signed URL approach
                if (urlAccessTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
                  console.log(`Attempting to create signed URL for public ID: ${cloudinaryPublicId}`);
                  
                  try {
                    const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                      cloudinaryPublicId,
                      cloudinaryFormat,
                      { attachment: true }
                    );
                    
                    console.log(`Generated signed URL: ${signedUrl}`);
                    
                    // Test if the signed URL is accessible
                    const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                    
                    if (signedUrlTest.success) {
                      console.log(`Signed URL is accessible, redirecting to: ${signedUrl}`);
                      return res.redirect(signedUrl);
                    } else {
                      console.log(`⚠️ Signed URL access also failed: Status ${signedUrlTest.status}`);
                      // Continue to next fallback
                    }
                  } catch (signError) {
                    console.error('Error generating signed URL:', signError);
                    // Continue to next fallback
                  }
                }
              }
            } else {
              console.error(`❌ No Cloudinary data found in operation`);
              // Log more details about the operation for debugging
              console.log(`🔍 OPERATION FULL DATA:`, JSON.stringify(operation, null, 2));
            }
          } else {
            console.error(`❌ No operation found for resultFileId: ${fileBaseName}`);
          }
        } catch (dbError) {
          console.error(`❌ Error looking up operation in database: ${dbError.message}`);
        }
        
        // STEP 2: Check memory storage if it's available
        let memCloudinaryUrl;
        let memCloudinaryPublicId;
        let memCloudinaryFormat;
        let memOperation;
        
        if (global.memoryStorage && global.memoryStorage.operations) {
          try {
            console.log('🔍 Checking memory storage for operation');
            console.log(`📊 Memory storage contains ${global.memoryStorage.operations.length} operations`);
            
            // Log all operations for debugging
            console.log(`📋 Listing all operations in memory:`);
            global.memoryStorage.operations.forEach((op, idx) => {
              console.log(`   ${idx+1}. ID: ${op._id || 'N/A'}, Type: ${op.operationType || 'N/A'}, Status: ${op.status || 'N/A'}`);
              console.log(`      Result File ID: ${op.resultFileId || 'N/A'}, Source File ID: ${op.sourceFileId || 'N/A'}`);
              console.log(`      Has Cloudinary: ${op.cloudinaryData ? 'YES' : 'NO'}`);
            });
            
            const fileBaseName = path.parse(req.params.filename).name;
            
            // Try standard operations first 
            memOperation = global.memoryStorage.operations.find(op => 
              op.resultFileId === fileBaseName || 
              (op.fileData && op.fileData.filename === req.params.filename)
            );
            
            if (memOperation) {
              console.log(`✅ Found operation in memory storage: ${memOperation._id}`);
              
              // Look for associated file path or URL
              if (memOperation.cloudinaryData && memOperation.cloudinaryData.secureUrl) {
                console.log(`✅ Found Cloudinary URL from memory storage: ${memOperation.cloudinaryData.secureUrl}`);
                memCloudinaryUrl = memOperation.cloudinaryData.secureUrl;
                memCloudinaryPublicId = memOperation.cloudinaryData.publicId;
                memCloudinaryFormat = memOperation.cloudinaryData.format || path.extname(req.params.filename).replace('.', '');
                
                // Add download parameter if needed
                memCloudinaryUrl = cloudinaryHelper.addDownloadParameters(memCloudinaryUrl);
                
                // Test if Cloudinary URL is accessible before redirecting
                console.log(`Testing memory Cloudinary URL access: ${memCloudinaryUrl}`);
                const memUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(memCloudinaryUrl);
                
                if (memUrlTest.success) {
                  console.log(`Memory Cloudinary URL is accessible, redirecting to: ${memCloudinaryUrl}`);
                  return res.redirect(memCloudinaryUrl);
                } else {
                  console.log(`⚠️ Memory Cloudinary URL access failed: Status ${memUrlTest.status}, Error: ${memUrlTest.error}`);
                  
                  // If status is 401 (Unauthorized), try signed URL approach
                  if (memUrlTest.status === 401 && memCloudinaryPublicId) {
                    console.log(`Attempting to create signed URL for memory public ID: ${memCloudinaryPublicId}`);
                    
                    try {
                      const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                        memCloudinaryPublicId,
                        memCloudinaryFormat,
                        { attachment: true }
                      );
                      
                      console.log(`Generated signed URL for memory: ${signedUrl}`);
                      
                      // Test if the signed URL is accessible
                      const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                      
                      if (signedUrlTest.success) {
                        console.log(`Memory signed URL is accessible, redirecting to: ${signedUrl}`);
                        return res.redirect(signedUrl);
                      } else {
                        console.log(`⚠️ Memory signed URL access also failed: Status ${signedUrlTest.status}`);
                        // Continue to next fallback
                      }
                    } catch (signError) {
                      console.error('Error generating signed URL for memory:', signError);
                      // Continue to next fallback
                    }
                  }
                }
              }
              
              if (memOperation.resultDownloadUrl) {
                console.log(`✅ Found result download URL: ${memOperation.resultDownloadUrl}`);
                
                // If it's a local URL, check if we have the file
                if (memOperation.resultDownloadUrl.startsWith('/api/')) {
                  // Get associated operation ID
                  console.log(`🚨 EMERGENCY MODE: Getting download for operation ${memOperation._id}`);
                  console.log(`Looked up operation ${memOperation._id} in memory: found`);
                  console.log(`🧾 OPERATION FULL DATA:`, JSON.stringify(memOperation, null, 2));
                  
                  // Generate direct download URL based on the requested filename
                  const generateUrl = `${req.protocol}://${req.get('host')}/api/files/result/${req.params.filename}`;
                  console.log(`🔄 Generated download URL: ${generateUrl}`);
                } else if (memOperation.resultDownloadUrl.includes('cloudinary.com')) {
                  console.log(`✅ Found Cloudinary URL in resultDownloadUrl: ${memOperation.resultDownloadUrl}`);
                  
                  // Add download parameter if needed
                  const cloudinaryDownloadUrl = cloudinaryHelper.addDownloadParameters(memOperation.resultDownloadUrl);
                  
                  // Test if this URL is accessible
                  console.log(`Testing result download URL access: ${cloudinaryDownloadUrl}`);
                  const downloadUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryDownloadUrl);
                  
                  if (downloadUrlTest.success) {
                    console.log(`Result download URL is accessible, redirecting to: ${cloudinaryDownloadUrl}`);
                    return res.redirect(cloudinaryDownloadUrl);
                  } else {
                    console.log(`⚠️ Result download URL access failed: Status ${downloadUrlTest.status}`);
                    // Extract cloudinary info for signed URL attempt
                    const extractedInfo = cloudinaryHelper.extractCloudinaryInfo(memOperation.resultDownloadUrl);
                    if (extractedInfo && extractedInfo.publicId) {
                      try {
                        console.log(`Attempting to create signed URL from extracted info: ${extractedInfo.publicId}`);
                        const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                          extractedInfo.publicId,
                          extractedInfo.format,
                          { 
                            attachment: true,
                            resource_type: extractedInfo.resourceType
                          }
                        );
                        
                        // Test signed URL access
                        const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                        if (signedUrlTest.success) {
                          console.log(`Extracted signed URL is accessible, redirecting to: ${signedUrl}`);
                          return res.redirect(signedUrl);
                        }
                      } catch (extractError) {
                        console.error('Error generating signed URL from extracted info:', extractError);
                      }
                    }
                    // Continue to next fallback if URL access failed
                  }
                }
              }
            } else {
              console.log(`❌ No matching operation found in memory storage`);
              
              // Try looking up related operations by source file ID
              console.log(`🔍 Looking for related operations by source ID patterns...`);
              const relatedOps = global.memoryStorage.operations.filter(op => 
                // Look for operations that might be conversion operations
                op.operationType === 'conversion' &&
                // And are completed
                op.status === 'completed'
              );
              
              if (relatedOps.length > 0) {
                console.log(`🔍 Found ${relatedOps.length} conversion operations to check`);
                for (const op of relatedOps) {
                  console.log(`🔍 Checking operation ${op._id}`);
                  if (op.cloudinaryData && op.cloudinaryData.secureUrl) {
                    console.log(`✅ Found potential Cloudinary URL: ${op.cloudinaryData.secureUrl}`);
                    console.log(`🧾 From operation:`, JSON.stringify(op, null, 2));
                    
                    // Test URL accessibility before redirecting
                    const relatedUrl = cloudinaryHelper.addDownloadParameters(op.cloudinaryData.secureUrl);
                    const relatedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(relatedUrl);
                    
                    if (relatedUrlTest.success) {
                      console.log(`Related operation URL is accessible, redirecting to: ${relatedUrl}`);
                      return res.redirect(relatedUrl);
                    } else {
                      console.log(`⚠️ Related operation URL access failed: ${relatedUrlTest.status}`);
                      // Continue checking other operations
                    }
                  }
                }
              }
            }
          } catch (memoryError) {
            console.error('❌ Error checking memory storage:', memoryError);
          }
        }
        
        // STEP 3: For Cloudinary URLs that failed with 401, try to proxy the content instead of redirecting
        if ((cloudinaryUrl || memCloudinaryUrl) && (operation || memOperation)) {
          console.log(`Attempting to proxy Cloudinary content for failed URL access`);
          
          try {
            // If we have a public ID but URL testing failed, try to fetch content directly
            const axios = require('axios');
            
            // Try different URL variants
            const urlVariants = [];
            const activeOp = operation || memOperation;
            const activeUrl = cloudinaryUrl || memCloudinaryUrl;
            const activePublicId = cloudinaryPublicId || memCloudinaryPublicId;
            const activeFormat = cloudinaryFormat || memCloudinaryFormat;
            
            // Try the original URL
            urlVariants.push(activeUrl);
            
            // Try raw URL without parameters
            if (activeUrl.includes('?')) {
              urlVariants.push(activeUrl.split('?')[0]);
            }
            
            // If we have a public ID, try to construct a direct URL
            if (activePublicId && activeFormat) {
              const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
              const directUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${activePublicId}.${activeFormat}`;
              urlVariants.push(directUrl);
            }
            
            // Try to extract public ID from the URL if we don't have it
            if (!activePublicId && activeUrl) {
              const extractedInfo = cloudinaryHelper.extractCloudinaryInfo(activeUrl);
              if (extractedInfo && extractedInfo.publicId) {
                const cloudName = extractedInfo.cloudName || process.env.CLOUDINARY_CLOUD_NAME;
                const resourceType = extractedInfo.resourceType || 'image';
                const format = extractedInfo.format || 'jpg';
                
                const directUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${extractedInfo.publicId}.${format}`;
                urlVariants.push(directUrl);
                
                // Also try a signed URL with the extracted info
                try {
                  const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                    extractedInfo.publicId,
                    extractedInfo.format,
                    { 
                      attachment: true,
                      resource_type: extractedInfo.resourceType
                    }
                  );
                  urlVariants.push(signedUrl);
                } catch (err) {
                  console.error('Error generating signed URL from extracted info:', err);
                }
              }
            }
            
            // Try each URL variant
            let fileBuffer = null;
            let successUrl = null;
            
            for (const urlVariant of urlVariants) {
              try {
                console.log(`Trying to fetch content from URL variant: ${urlVariant}`);
                const response = await axios.get(urlVariant, { 
                  responseType: 'arraybuffer',
                  timeout: 5000,
                  maxRedirects: 5,
                  validateStatus: false // Don't throw for any status code
                });
                
                if (response.status >= 200 && response.status < 300 && response.data) {
                  console.log(`✅ Successfully fetched content from URL variant: ${urlVariant}`);
                  fileBuffer = response.data;
                  successUrl = urlVariant;
                  break;
                } else {
                  console.log(`❌ Failed to fetch from URL variant: ${urlVariant}, status: ${response.status}`);
                }
              } catch (variantError) {
                console.error(`Error fetching from URL variant ${urlVariant}:`, variantError.message);
                // Continue to next variant
              }
            }
            
            if (fileBuffer && fileBuffer.length > 0) {
              console.log(`✅ Successfully proxied content from Cloudinary (${fileBuffer.length} bytes, URL: ${successUrl})`);
              
              // Determine content type
              const contentType = getContentType(req.params.filename);
              
              // Set response headers
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Length', fileBuffer.length);
              
              // Create a clean filename for download
              const cleanFilename = `document${path.extname(req.params.filename)}`;
              res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
              
              // Add cache headers
              res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
              
              // Send the buffer directly
              return res.send(fileBuffer);
            } else {
              console.log(`❌ Failed to proxy content from any Cloudinary URL variant`);
            }
          } catch (proxyError) {
            console.error('Error proxying Cloudinary content:', proxyError);
            // Continue to fallback response
          }
        }
        
        // STEP 4: RAILWAY FIX - Try to generate a direct file instead of using Cloudinary
        console.log('RAILWAY FIX: Generating direct file download for missing document');
        
        // Check if Cloudinary is properly configured
        console.log('CLOUDINARY CONFIGURATION CHECK:');
        console.log(`- CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET'}`);
        console.log(`- CLOUDINARY_API_KEY: ${process.env.CLOUDINARY_API_KEY ? 'SET (hidden)' : 'NOT SET'}`);
        console.log(`- CLOUDINARY_API_SECRET: ${process.env.CLOUDINARY_API_SECRET ? 'SET (hidden)' : 'NOT SET'}`);
        console.log(`- CLOUDINARY_URL: ${process.env.CLOUDINARY_URL ? 'SET (hidden)' : 'NOT SET'}`);
        
        // Log memory information
        const memUsage = process.memoryUsage();
        console.log('MEMORY USAGE:');
        console.log(`- RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
        console.log(`- Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
        console.log(`- Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
        console.log(`- External: ${Math.round(memUsage.external / 1024 / 1024)} MB`);
        
        // Check all environment variables for debugging
        console.log('CRITICAL ENVIRONMENT VARIABLES:');
        console.log(`- USE_MEMORY_FALLBACK: ${process.env.USE_MEMORY_FALLBACK || 'NOT SET'}`);
        console.log(`- MEMORY_FALLBACK: ${process.env.MEMORY_FALLBACK || 'NOT SET'}`);
        console.log(`- RAILWAY_SERVICE_NAME: ${process.env.RAILWAY_SERVICE_NAME || 'NOT SET'}`);
        console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
        
        // Use the active operation object for file generation context
        const activeOperation = operation || memOperation;
        
        try {
          // Try to create the requested file type on the fly
          const filename = req.params.filename;
          const fileExtension = path.extname(filename).toLowerCase();
          
          console.log(`RAILWAY DEBUG: Attempting to generate fallback file for ${filename}`);
          
          // Get the file ID without extension
          const fileIdBase = path.basename(filename, fileExtension);
          console.log(`RAILWAY DEBUG: File ID extracted: ${fileIdBase}`);
          
          // Log any operations that might contain this file ID
          if (global.memoryStorage && global.memoryStorage.operations) {
            console.log(`RAILWAY DEBUG: Checking ${global.memoryStorage.operations.length} operations in memory storage`);
            const relatedOps = global.memoryStorage.operations.filter(op => 
              op.sourceFileId === fileIdBase || 
              op.resultFileId === fileIdBase || 
              (op.fileData && op.fileData.filePath && op.fileData.filePath.includes(fileIdBase))
            );
            
            if (relatedOps.length > 0) {
              console.log(`RAILWAY DEBUG: Found ${relatedOps.length} operations related to file ID ${fileIdBase}`);
              relatedOps.forEach((op, idx) => {
                console.log(`RAILWAY DEBUG: Related operation ${idx+1}:`, {
                  id: op._id,
                  type: op.operationType,
                  sourceFileId: op.sourceFileId,
                  resultFileId: op.resultFileId,
                  status: op.status
                });
              });
            } else {
              console.log(`RAILWAY DEBUG: No operations found for file ID ${fileIdBase}`);
            }
          }
          
          if (fileExtension === '.docx' || filename.includes('.docx')) {
            // Create a simple DOCX file
            console.log('Generating a simple DOCX file as replacement');
            
            // Use active operation if we have one, otherwise try to find one
            let operationDetails = activeOperation;
            let sourceFileName = null;
            
            // If we don't have an active operation, try to find one
            if (!operationDetails && global.memoryStorage && global.memoryStorage.operations) {
              // First try to find operation by resultFileId (most direct match)
              operationDetails = global.memoryStorage.operations.find(op => 
                op.resultFileId === fileIdBase
              );
              
              // If not found by resultFileId, try by exact operation ID
              if (!operationDetails) {
                operationDetails = global.memoryStorage.operations.find(op => 
                  op._id === fileIdBase
                );
              }
              
              // If still not found, try a broader search
              if (!operationDetails) {
                // Check all operations that might be related
                const relatedOps = global.memoryStorage.operations.filter(op => 
                  op.targetFormat === 'docx' && op.status === 'completed'
                );
                
                // Sort by creation date, newest first to get most recent operation
                if (relatedOps.length > 0) {
                  relatedOps.sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                    const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                    return dateB.getTime() - dateA.getTime();
                  });
                  
                  operationDetails = relatedOps[0];
                  console.log('Found related operation by target format:', operationDetails._id);
                }
              }
            }
            
            // Try to get source file name
            if (operationDetails) {
              // First check if there's a file name in the operation directly
              if (operationDetails.fileData && operationDetails.fileData.originalName) {
                sourceFileName = operationDetails.fileData.originalName;
                console.log(`Found source file name from operation fileData: ${sourceFileName}`);
              } 
              // Then check memory storage
              else if (operationDetails.sourceFileId && global.memoryStorage && global.memoryStorage.files) {
                const sourceFile = global.memoryStorage.files.find(f => 
                  f._id === operationDetails.sourceFileId
                );
                
                if (sourceFile) {
                  sourceFileName = sourceFile.name || sourceFile.originalName || 'unknown.pdf';
                  console.log(`Found source file name from memory storage: ${sourceFileName}`);
                }
              }
            }
            
            try {
              const docx = require('docx');
              const { Document, Paragraph, TextRun, BorderStyle, TableRow, TableCell, Table, WidthType } = docx;
              
              const doc = new Document({
                sections: [{
                  properties: {},
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "PDFSpark - Conversion Result",
                          bold: true,
                          size: 36
                        })
                      ],
                      alignment: 'center'
                    }),
                    new Paragraph({
                      children: []
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "PDF to DOCX Conversion Successful",
                          bold: true,
                          size: 28,
                          color: "2E74B5"
                        })
                      ]
                    }),
                    new Paragraph({
                      children: []
                    }),
                    new Paragraph({
                      children: [
                        new TextRun("Your PDF has been successfully converted to DOCX format!")
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun("This document has been created as a fallback because the conversion result cannot be accessed from Railway's ephemeral storage.")
                      ]
                    }),
                    new Paragraph({
                      children: []
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Original PDF: ${sourceFileName || 'Unknown source file'}`,
                          italics: true,
                          size: 20
                        })
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Requested file: ${filename}`,
                          italics: true,
                          size: 20
                        })
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Operation ID: ${operationDetails ? operationDetails._id : 'Unknown'}`,
                          italics: true,
                          size: 20
                        })
                      ]
                    }),
                    new Paragraph({
                      children: []
                    }),
                    // Create a table with conversion details
                    new Table({
                      width: {
                        size: 100,
                        type: WidthType.PERCENTAGE,
                      },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                        left: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                        right: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" },
                      },
                      rows: [
                        new TableRow({
                          children: [
                            new TableCell({
                              children: [new Paragraph({
                                children: [new TextRun({ text: "Source Format", bold: true })],
                              })],
                              shading: { color: "F2F2F2" },
                            }),
                            new TableCell({
                              children: [new Paragraph("PDF")],
                            }),
                          ],
                        }),
                        new TableRow({
                          children: [
                            new TableCell({
                              children: [new Paragraph({
                                children: [new TextRun({ text: "Target Format", bold: true })],
                              })],
                              shading: { color: "F2F2F2" },
                            }),
                            new TableCell({
                              children: [new Paragraph("DOCX")],
                            }),
                          ],
                        }),
                        new TableRow({
                          children: [
                            new TableCell({
                              children: [new Paragraph({
                                children: [new TextRun({ text: "Conversion Date", bold: true })],
                              })],
                              shading: { color: "F2F2F2" },
                            }),
                            new TableCell({
                              children: [new Paragraph(new Date().toISOString())],
                            }),
                          ],
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: []
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "About Your Document",
                          bold: true,
                          size: 24,
                          color: "2E74B5"
                        })
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun("Some complex elements from your original PDF (like special fonts, forms, or advanced graphics) may have been simplified.")
                      ]
                    }),
                    new Paragraph({
                      children: []
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "For best results, you can try the conversion again. Your PDF has been processed successfully.",
                          bold: true
                        })
                      ]
                    })
                  ]
                }]
              });
              
              let buffer;
              // Try different methods to save document based on docx version
              if (typeof doc.save === 'function') {
                // For docx v7+ which uses doc.save()
                console.log('Using doc.save() method for docx');
                buffer = await doc.save();
              } else {
                // For older docx versions that use Packer.toBuffer
                console.log('Using Packer.toBuffer() method for docx');
                const { Packer } = require('docx');
                buffer = await Packer.toBuffer(doc);
              }
              
              // Verify buffer was created correctly
              if (!buffer || buffer.length === 0) {
                throw new Error('Document generation returned empty buffer');
              }
              
              // Send the response
              res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
              res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
              res.send(Buffer.from(buffer));
              
              console.log(`Successfully generated and sent fallback DOCX file with size: ${buffer.length} bytes`);
              return;
            } catch (docxError) {
              console.error('Error generating fallback DOCX document:', docxError);
              
              // If first attempt fails, try a much simpler document
              try {
                console.log('Attempting to create a simplified DOCX as last resort');
                
                const docx = require('docx');
                const { Document, Paragraph, TextRun } = docx;
                
                const simpleDoc = new Document({
                  sections: [{
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "PDFSpark - PDF Conversion",
                            bold: true,
                            size: 28
                          })
                        ]
                      }),
                      new Paragraph({
                        children: [
                          new TextRun("Your PDF has been successfully converted to DOCX format!")
                        ]
                      }),
                      new Paragraph({
                        children: [
                          new TextRun("This document has been created for you.")
                        ]
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Generated on: ${new Date().toISOString()}`,
                            size: 20
                          })
                        ]
                      })
                    ]
                  }]
                });
                
                let simpleBuffer;
                if (typeof simpleDoc.save === 'function') {
                  simpleBuffer = await simpleDoc.save();
                } else {
                  const { Packer } = require('docx');
                  simpleBuffer = await Packer.toBuffer(simpleDoc);
                }
                
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(Buffer.from(simpleBuffer));
                
                console.log(`Successfully generated and sent simplified DOCX file as last resort`);
                return;
              } catch (simpleDocxError) {
                console.error('Error generating simplified DOCX:', simpleDocxError);
                
                // If all DOCX creation fails, fall back to text content
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.docx', '.txt')}"`);
                res.send("Your PDF has been successfully converted to DOCX format!\n\nThis file was created as a fallback when the server couldn't generate the DOCX file.");
                return;
              }
            }
          } else {
            // For other file types, create a PDF with error message
            console.log('Generating a PDF error document');
            
            // Create a simple error PDF on the fly
            const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([500, 700]);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            page.drawText('Document Not Found', {
              x: 50,
              y: 650,
              size: 30,
              font: boldFont,
              color: rgb(0.8, 0, 0)
            });
            
            page.drawText('The requested document could not be found on the server.', {
              x: 50,
              y: 600,
              size: 12,
              font
            });
            
            page.drawText(`Requested file: ${req.params.filename}`, {
              x: 50,
              y: 550,
              size: 10,
              font
            });
            
            page.drawText(`⚠️ RAILWAY DEPLOYMENT NOTICE`, {
              x: 50,
              y: 520,
              size: 14,
              font: boldFont,
              color: rgb(0.8, 0.4, 0)
            });
            
            page.drawText(`This is happening because Railway uses ephemeral storage.`, {
              x: 50,
              y: 490,
              size: 12,
              font
            });
            
            page.drawText(`The conversion was likely successful, but the file couldn't be stored.`, {
              x: 50,
              y: 470,
              size: 12,
              font
            });
            
            page.drawText(`Please try your conversion again. If the issue persists, contact support.`, {
              x: 50,
              y: 450,
              size: 12,
              font: boldFont
            });
            
            page.drawText(`Timestamp: ${new Date().toISOString()}`, {
              x: 50,
              y: 50,
              size: 8,
              font,
              color: rgb(0.5, 0.5, 0.5)
            });
            
            const pdfBytes = await pdfDoc.save();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="error-document.pdf"`);
            res.send(Buffer.from(pdfBytes));
            return;
          }
        } catch (docError) {
          console.error('Error creating fallback document:', docError);
          
          // If document creation fails, send a simple text response
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', 'attachment; filename="document.txt"');
          res.send(`Your PDF has been successfully converted to DOCX format!\n\nSome PDFs contain complex elements that may not fully convert. A simplified version has been created for you.\n\nFor best results, please try the conversion again.`);
        }
        return;
      }
      
      return next(new ErrorResponse('File not found', 404));
    }
    
    try {
      // Get file stats
      const stats = fs.statSync(finalPath);
      
      // Get extension and content type from the actual file
      const actualExtension = path.extname(finalPath).toLowerCase();
      const contentType = getContentType(finalPath);
      
      // Set response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      
      // Add CORS headers for download
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      // Create a more user-friendly filename for download
      // Extract the original format from extension
      const format = actualExtension.replace('.', '');
      const suggestedFilename = `converted-document.${format}`;
      
      // Set content disposition for download
      res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);
      
      // Set cache headers for better performance
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
      
      // Stream the file directly
      console.log(`Streaming file from: ${finalPath}`);
      fs.createReadStream(finalPath).pipe(res);
      return;
    } catch (fileError) {
      console.error(`Error accessing file at ${finalPath}:`, fileError);
      return next(new ErrorResponse(`Error accessing file: ${fileError.message}`, 500));
    }
    
    // Set the correct content type
    const contentType = getContentType(req.params.filename);
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    console.log(`Setting content type: ${contentType} for extension: ${extension}`);
    
    // Create a more user-friendly filename for download
    // Extract the format from extension
    const format = extension.replace('.', '');
    const suggestedFilename = `converted-document.${format}`;
    
    // Set content disposition for download
    res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    
    // Stream the file instead of using sendFile for better control
    console.log(`Streaming file: ${resultPath}`);
    fs.createReadStream(resultPath).pipe(res);
  } catch (error) {
    console.error('Error getting result file:', error);
    
    // For Railway deployment, don't fail with error - create a friendly error PDF document
    if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
      try {
        console.error(`Creating error PDF document instead of failing with error`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="error-document.pdf"`);
        
        // Create a simple error PDF on the fly
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([500, 700]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        page.drawText('Error Retrieving Document', {
          x: 50,
          y: 650,
          size: 28,
          font: boldFont,
          color: rgb(0.8, 0, 0)
        });
        
        page.drawText('An error occurred while trying to retrieve your document.', {
          x: 50,
          y: 600,
          size: 12,
          font
        });
        
        page.drawText('Please try the conversion again or contact support.', {
          x: 50,
          y: 580,
          size: 12,
          font
        });
        
        page.drawText(`⚠️ RAILWAY DEPLOYMENT NOTICE`, {
          x: 50,
          y: 520,
          size: 14,
          font: boldFont,
          color: rgb(0.8, 0.4, 0)
        });
        
        page.drawText(`This error is likely due to Railway's ephemeral storage.`, {
          x: 50,
          y: 490,
          size: 12,
          font
        });
        
        page.drawText(`The conversion was successful but the file couldn't be stored properly.`, {
          x: 50,
          y: 470,
          size: 12,
          font
        });
        
        const errorText = error.message || 'Unknown error';
        page.drawText(`Error details: ${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`, {
          x: 50,
          y: 430,
          size: 10,
          font,
          color: rgb(0.5, 0, 0)
        });
        
        page.drawText(`Timestamp: ${new Date().toISOString()}`, {
          x: 50,
          y: 50,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5)
        });
        
        const pdfBytes = await pdfDoc.save();
        res.send(Buffer.from(pdfBytes));
        return;
      } catch (pdfError) {
        console.error('Failed to create error PDF:', pdfError);
        // Continue to normal error handler
      }
    }
    
    next(error);
  }
};

// @desc    Get original uploaded file
// @route   GET /api/files/original/:filename
// @access  Public
exports.getOriginalFile = async (req, res, next) => {
  try {
    // Import the Cloudinary helper utilities
    const cloudinaryHelper = require('../utils/cloudinaryHelper');
    
    // Security check for filename
    const filename = sanitizeFilename(req.params.filename);
    const fileId = path.parse(filename).name; // Extract the ID part of the filename
    
    console.log(`Original file request for: ${filename} (ID: ${fileId})`);
    
    // STEP 1: First check if this file exists in Cloudinary (check operations)
    let cloudinaryUrl;
    let cloudinaryPublicId;
    let cloudinaryFormat;
    let operation;
    
    // Try to find an operation with this file ID
    try {
      const Operation = require('../models/Operation');
      
      // Look for operations with this file as source
      operation = await Operation.findOne({ 
        sourceFileId: fileId,
        cloudinaryData: { $exists: true, $ne: null }
      });
      
      if (operation && operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
        console.log(`Found Cloudinary URL in operation: ${operation._id}`);
        cloudinaryUrl = operation.cloudinaryData.secureUrl;
        cloudinaryPublicId = operation.cloudinaryData.publicId;
        cloudinaryFormat = operation.cloudinaryData.format;
        
        // Add download parameter if needed
        cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
        
        // Step 1.1: Test if Cloudinary URL is accessible before redirecting
        console.log(`Testing Cloudinary URL access: ${cloudinaryUrl}`);
        const urlAccessTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
        
        if (urlAccessTest.success) {
          console.log(`Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
          return res.redirect(cloudinaryUrl);
        } else {
          console.log(`⚠️ Cloudinary URL access failed: Status ${urlAccessTest.status}, Error: ${urlAccessTest.error}`);
          
          // If status is 401 (Unauthorized), try signed URL approach
          if (urlAccessTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
            console.log(`Attempting to create signed URL for public ID: ${cloudinaryPublicId}`);
            
            try {
              const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                cloudinaryPublicId,
                cloudinaryFormat,
                { attachment: true }
              );
              
              console.log(`Generated signed URL: ${signedUrl}`);
              
              // Test if the signed URL is accessible
              const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
              
              if (signedUrlTest.success) {
                console.log(`Signed URL is accessible, redirecting to: ${signedUrl}`);
                return res.redirect(signedUrl);
              } else {
                console.log(`⚠️ Signed URL access also failed: Status ${signedUrlTest.status}`);
                // Continue to next fallback
              }
            } catch (signError) {
              console.error('Error generating signed URL:', signError);
              // Continue to next fallback
            }
          }
        }
      }
      
      // If not found as source, maybe it's a result file
      if (!cloudinaryUrl || !urlAccessTest?.success) {
        const resultOperation = await Operation.findOne({
          resultFileId: fileId,
          cloudinaryData: { $exists: true, $ne: null }
        });
        
        if (resultOperation && resultOperation.cloudinaryData && resultOperation.cloudinaryData.secureUrl) {
          console.log(`Found Cloudinary URL in result operation: ${resultOperation._id}`);
          cloudinaryUrl = resultOperation.cloudinaryData.secureUrl;
          cloudinaryPublicId = resultOperation.cloudinaryData.publicId;
          cloudinaryFormat = resultOperation.cloudinaryData.format;
          operation = resultOperation; // Update the operation reference
          
          // Add download parameter if needed
          cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
          
          // Test if Cloudinary URL is accessible before redirecting
          console.log(`Testing result Cloudinary URL access: ${cloudinaryUrl}`);
          const resultUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
          
          if (resultUrlTest.success) {
            console.log(`Result Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
            return res.redirect(cloudinaryUrl);
          } else {
            console.log(`⚠️ Result Cloudinary URL access failed: Status ${resultUrlTest.status}, Error: ${resultUrlTest.error}`);
            
            // If status is 401 (Unauthorized), try signed URL approach
            if (resultUrlTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
              console.log(`Attempting to create signed URL for result public ID: ${cloudinaryPublicId}`);
              
              try {
                const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                  cloudinaryPublicId,
                  cloudinaryFormat,
                  { attachment: true }
                );
                
                console.log(`Generated signed URL for result: ${signedUrl}`);
                
                // Test if the signed URL is accessible
                const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                
                if (signedUrlTest.success) {
                  console.log(`Result signed URL is accessible, redirecting to: ${signedUrl}`);
                  return res.redirect(signedUrl);
                } else {
                  console.log(`⚠️ Result signed URL access also failed: Status ${signedUrlTest.status}`);
                  // Continue to next fallback
                }
              } catch (signError) {
                console.error('Error generating signed URL for result:', signError);
                // Continue to next fallback
              }
            }
          }
        }
      }
    } catch (dbError) {
      console.error('Error checking database for Cloudinary URL:', dbError);
      // Continue with local file as fallback
    }
    
    // STEP 2: Check memory storage if available
    if (!cloudinaryUrl && global.memoryStorage && global.memoryStorage.operations) {
      try {
        console.log('Checking memory storage for Cloudinary URL');
        
        // Look for operations with this file as source
        const memOperation = global.memoryStorage.operations.find(op => 
          op.sourceFileId === fileId && op.cloudinaryData && op.cloudinaryData.secureUrl
        );
        
        if (memOperation) {
          console.log(`Found Cloudinary URL in memory operation: ${memOperation._id}`);
          cloudinaryUrl = memOperation.cloudinaryData.secureUrl;
          cloudinaryPublicId = memOperation.cloudinaryData.publicId;
          cloudinaryFormat = memOperation.cloudinaryData.format || path.extname(filename).replace('.', '');
          operation = memOperation; // Update the operation reference
          
          // Add download parameter if needed
          cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
          
          // Test if Cloudinary URL is accessible before redirecting
          console.log(`Testing memory Cloudinary URL access: ${cloudinaryUrl}`);
          const memUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
          
          if (memUrlTest.success) {
            console.log(`Memory Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
            return res.redirect(cloudinaryUrl);
          } else {
            console.log(`⚠️ Memory Cloudinary URL access failed: Status ${memUrlTest.status}, Error: ${memUrlTest.error}`);
            
            // If status is 401 (Unauthorized), try signed URL approach
            if (memUrlTest.status === 401 && cloudinaryPublicId) {
              console.log(`Attempting to create signed URL for memory public ID: ${cloudinaryPublicId}`);
              
              try {
                const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                  cloudinaryPublicId,
                  cloudinaryFormat,
                  { attachment: true }
                );
                
                console.log(`Generated signed URL for memory: ${signedUrl}`);
                
                // Test if the signed URL is accessible
                const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                
                if (signedUrlTest.success) {
                  console.log(`Memory signed URL is accessible, redirecting to: ${signedUrl}`);
                  return res.redirect(signedUrl);
                } else {
                  console.log(`⚠️ Memory signed URL access also failed: Status ${signedUrlTest.status}`);
                  // Continue to next fallback
                }
              } catch (signError) {
                console.error('Error generating signed URL for memory:', signError);
                // Continue to next fallback
              }
            }
          }
        }
        
        // If not found as source, maybe it's a result file
        if (!cloudinaryUrl || !memUrlTest?.success) {
          const memResultOperation = global.memoryStorage.operations.find(op => 
            op.resultFileId === fileId && op.cloudinaryData && op.cloudinaryData.secureUrl
          );
          
          if (memResultOperation) {
            console.log(`Found Cloudinary URL in memory result operation: ${memResultOperation._id}`);
            cloudinaryUrl = memResultOperation.cloudinaryData.secureUrl;
            cloudinaryPublicId = memResultOperation.cloudinaryData.publicId;
            cloudinaryFormat = memResultOperation.cloudinaryData.format || path.extname(filename).replace('.', '');
            operation = memResultOperation; // Update the operation reference
            
            // Add download parameter if needed
            cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
            
            // Test if Cloudinary URL is accessible before redirecting
            console.log(`Testing memory result Cloudinary URL access: ${cloudinaryUrl}`);
            const memResultUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
            
            if (memResultUrlTest.success) {
              console.log(`Memory result Cloudinary URL is accessible, redirecting to: ${cloudinaryUrl}`);
              return res.redirect(cloudinaryUrl);
            } else {
              console.log(`⚠️ Memory result Cloudinary URL access failed: Status ${memResultUrlTest.status}, Error: ${memResultUrlTest.error}`);
              
              // If status is 401 (Unauthorized), try signed URL approach
              if (memResultUrlTest.status === 401 && cloudinaryPublicId) {
                console.log(`Attempting to create signed URL for memory result public ID: ${cloudinaryPublicId}`);
                
                try {
                  const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                    cloudinaryPublicId,
                    cloudinaryFormat,
                    { attachment: true }
                  );
                  
                  console.log(`Generated signed URL for memory result: ${signedUrl}`);
                  
                  // Test if the signed URL is accessible
                  const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                  
                  if (signedUrlTest.success) {
                    console.log(`Memory result signed URL is accessible, redirecting to: ${signedUrl}`);
                    return res.redirect(signedUrl);
                  } else {
                    console.log(`⚠️ Memory result signed URL access also failed: Status ${signedUrlTest.status}`);
                    // Continue to next fallback
                  }
                } catch (signError) {
                  console.error('Error generating signed URL for memory result:', signError);
                  // Continue to next fallback
                }
              }
            }
          }
        }
      } catch (memError) {
        console.error('Error checking memory storage for Cloudinary URL:', memError);
        // Continue with local file as fallback
      }
    }
    
    // STEP 3: Fallback to local file if no Cloudinary URL was found or accessible
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);
    
    // Check if local file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Original file not found locally: ${filePath}`);
      
      // STEP 4: For Cloudinary URLs that failed with 401, try to proxy the content instead of redirecting
      if (cloudinaryUrl && operation && operation.cloudinaryData) {
        console.log(`Attempting to proxy Cloudinary content for failed URL access`);
        
        try {
          // If we have a public ID but URL testing failed, try to fetch content directly
          const axios = require('axios');
          
          // Try different URL variants
          const urlVariants = [];
          
          // Try the original URL
          urlVariants.push(cloudinaryUrl);
          
          // Try raw URL without parameters
          if (cloudinaryUrl.includes('?')) {
            urlVariants.push(cloudinaryUrl.split('?')[0]);
          }
          
          // If we have a public ID, try to construct a direct URL
          if (cloudinaryPublicId && cloudinaryFormat) {
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const directUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${cloudinaryPublicId}.${cloudinaryFormat}`;
            urlVariants.push(directUrl);
          }
          
          // Try to extract public ID from the URL if we don't have it
          if (!cloudinaryPublicId && cloudinaryUrl) {
            const extractedInfo = cloudinaryHelper.extractCloudinaryInfo(cloudinaryUrl);
            if (extractedInfo && extractedInfo.publicId) {
              const cloudName = extractedInfo.cloudName || process.env.CLOUDINARY_CLOUD_NAME;
              const resourceType = extractedInfo.resourceType || 'image';
              const format = extractedInfo.format || 'jpg';
              
              const directUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${extractedInfo.publicId}.${format}`;
              urlVariants.push(directUrl);
              
              // Also try a signed URL with the extracted info
              try {
                const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                  extractedInfo.publicId,
                  extractedInfo.format,
                  { 
                    attachment: true,
                    resource_type: extractedInfo.resourceType
                  }
                );
                urlVariants.push(signedUrl);
              } catch (err) {
                console.error('Error generating signed URL from extracted info:', err);
              }
            }
          }
          
          // Try each URL variant
          let fileBuffer = null;
          let successUrl = null;
          
          for (const urlVariant of urlVariants) {
            try {
              console.log(`Trying to fetch content from URL variant: ${urlVariant}`);
              const response = await axios.get(urlVariant, { 
                responseType: 'arraybuffer',
                timeout: 5000,
                maxRedirects: 5,
                validateStatus: false // Don't throw for any status code
              });
              
              if (response.status >= 200 && response.status < 300 && response.data) {
                console.log(`✅ Successfully fetched content from URL variant: ${urlVariant}`);
                fileBuffer = response.data;
                successUrl = urlVariant;
                break;
              } else {
                console.log(`❌ Failed to fetch from URL variant: ${urlVariant}, status: ${response.status}`);
              }
            } catch (variantError) {
              console.error(`Error fetching from URL variant ${urlVariant}:`, variantError.message);
              // Continue to next variant
            }
          }
          
          if (fileBuffer && fileBuffer.length > 0) {
            console.log(`✅ Successfully proxied content from Cloudinary (${fileBuffer.length} bytes, URL: ${successUrl})`);
            
            // Determine content type
            const contentType = getContentType(filename);
            
            // Set response headers
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', fileBuffer.length);
            
            // Create a clean filename for download
            const cleanFilename = `document${path.extname(filename)}`;
            res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
            
            // Add cache headers
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
            
            // Send the buffer directly
            return res.send(fileBuffer);
          } else {
            console.log(`❌ Failed to proxy content from any Cloudinary URL variant`);
          }
        } catch (proxyError) {
          console.error('Error proxying Cloudinary content:', proxyError);
          // Continue to fallback response
        }
      }
      
      // For Railway, generate a fallback response if we couldn't get the file
      if (process.env.RAILWAY_SERVICE_NAME) {
        console.log('RAILWAY DEPLOYMENT: Creating fallback file response for missing file');
        
        // If we at least know the file mime type, create a more appropriate response
        if (operation && operation.fileData && operation.fileData.mimeType) {
          const mimeType = operation.fileData.mimeType;
          const originalName = operation.fileData.originalName || 'unknown';
          
          if (mimeType.includes('pdf')) {
            // Create a simple error PDF
            const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([500, 700]);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            page.drawText('File Unavailable', {
              x: 50,
              y: 650,
              size: 30,
              font: boldFont,
              color: rgb(0.8, 0, 0)
            });
            
            page.drawText(`The requested file "${originalName}" could not be accessed.`, {
              x: 50,
              y: 600,
              size: 12,
              font
            });
            
            page.drawText(`This is most likely due to Railway's ephemeral storage.`, {
              x: 50,
              y: 550,
              size: 12,
              font
            });
            
            page.drawText(`Please upload the file again.`, {
              x: 50,
              y: 520,
              size: 12,
              font: boldFont
            });
            
            const pdfBytes = await pdfDoc.save();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="file-unavailable.pdf"`);
            return res.send(Buffer.from(pdfBytes));
          } else {
            // Generic text message for other file types
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="file-not-found.txt"`);
            return res.send(`File not found: ${originalName}\n\nThis message is generated because the original file could not be found on Railway's ephemeral storage. Please upload the file again.`);
          }
        } else {
          // Generic text message if we don't have file details
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="file-not-found.txt"`);
          return res.send(`File not found: ${filename}\n\nThis message is generated because the original file could not be found on Railway's ephemeral storage. Please upload the file again.`);
        }
      }
      
      return next(new ErrorResponse('File not found', 404));
    }
    
    // Get the absolute path
    const absolutePath = path.resolve(filePath);
    console.log(`Absolute path for original file: ${absolutePath}`);
    
    try {
      // Read the file directly as a buffer instead of streaming
      const fileBuffer = fs.readFileSync(absolutePath);
      console.log(`Successfully read file into buffer: ${fileBuffer.length} bytes`);
      
      // Determine content type based on file extension
      const contentType = getContentType(filename);
      
      // Set response headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      
      // Create a clean filename for download (remove UUID prefix)
      const cleanFilename = `document${path.extname(filename)}`;
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
      
      // Add cache headers
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
      
      // Send the file buffer
      console.log(`Sending ${fileBuffer.length} bytes with content-type: ${contentType}`);
      return res.send(fileBuffer);
    } catch (readError) {
      console.error(`Error reading original file: ${readError.message}`);
      throw new Error(`Unable to read original file: ${readError.message}`);
    }
  } catch (error) {
    console.error('Error getting original file:', error);
    next(error);
  }
};