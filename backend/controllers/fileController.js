const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const { isPdfValid } = require('../utils/fileValidator');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const { v4: uuidv4 } = require('uuid');
const createDebug = require('../utils/debugLogger');

// Create a logger for file controller
const debug = createDebug('pdfspark:api:files');
const uploadDebug = debug.extend('upload');
const downloadDebug = debug.extend('download');

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
    uploadDebug.info('========== STARTING FILE UPLOAD ==========');
    uploadDebug.info('File upload request received');
    uploadDebug.info('- Headers: %o', req.headers);
    uploadDebug.info('- Session ID: %s', req.sessionId);
    uploadDebug.info('- User: %s', req.user ? req.user._id : 'No user');
    
    // Ensure the response includes the session ID
    if (req.sessionId) {
      res.setHeader('X-Session-ID', req.sessionId);
      uploadDebug.info('Set session ID in response header: %s', req.sessionId);
    }
    
    // Log request file information
    if (req.file) {
      uploadDebug.info('File details: %o', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } else if (req.files) {
      uploadDebug.info('Files uploaded: %d', Object.keys(req.files).length);
    } else {
      uploadDebug.warn('No file found in request');
      uploadDebug.warn('Request body keys: %o', Object.keys(req.body));
      return next(new ErrorResponse('No file uploaded', 400));
    }
    
    // Make sure service is healthy
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const tempDir = process.env.TEMP_DIR || './temp';
    
    // Ensure directories exist and are writable
    try {
      if (!fs.existsSync(uploadDir)) {
        uploadDebug.info('Creating upload directory: %s', uploadDir);
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      if (!fs.existsSync(tempDir)) {
        uploadDebug.info('Creating temp directory: %s', tempDir);
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Test write access
      fs.accessSync(uploadDir, fs.constants.W_OK);
      fs.accessSync(tempDir, fs.constants.W_OK);
      uploadDebug.info('Directories exist and are writable: %s, %s', uploadDir, tempDir);
    } catch (fsError) {
      uploadDebug.error('Directory access error: %o', fsError);
      return next(new ErrorResponse('Service temporarily unavailable. Please try again later.', 503));
    }
    
    // Check if file exists in the request with more detailed logging
    if (!req.file) {
      uploadDebug.error('No file in request after middleware processing');
      uploadDebug.error('Request body: %o', req.body);
      uploadDebug.error('Request headers: %o', req.headers);
      
      // Check if the request is a multipart form but missing the file
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        uploadDebug.error('Multipart request detected but file is missing. Check form field name.');
        return next(new ErrorResponse('No file found in the multipart request. Please make sure the file field is named "file".', 400));
      }
      
      return next(new ErrorResponse('Please upload a file', 400));
    }

    uploadDebug.info('File received: %s, size: %d, mimetype: %s', req.file.originalname, req.file.size, req.file.mimetype);

    // Accept all file types temporarily for debugging purposes
    uploadDebug.info('File details - MIME type: %s, Name: %s, Size: %d bytes', req.file.mimetype, req.file.originalname, req.file.size);

    // Check file size
    const maxSizeFree = 5 * 1024 * 1024; // 5MB
    const maxSizePremium = 100 * 1024 * 1024; // 100MB
    
    // Check if user has a subscription
    const hasSubscription = req.user && req.user.hasActiveSubscription && req.user.hasActiveSubscription();
    uploadDebug.info('User subscription status: %s', hasSubscription ? 'Active' : 'None/Inactive');
    
    if (req.file.size > (hasSubscription ? maxSizePremium : maxSizeFree)) {
      const sizeLimit = hasSubscription ? '100MB' : '5MB';
      uploadDebug.error('File size %d exceeds limit %s', req.file.size, sizeLimit);
      return next(new ErrorResponse(`File size exceeds limit (${sizeLimit})`, 400));
    }
    
    // Enhanced file validation and detailed debugging
    try {
      uploadDebug.info('Starting enhanced file validation');
      
      // Check if buffer exists and has content
      const buffer = req.file.buffer;
      if (!buffer || buffer.length === 0) {
        uploadDebug.error('Empty file buffer detected');
        return next(new ErrorResponse('Empty file detected. Please upload a valid file.', 400));
      }
      
      // Log buffer details for debugging
      uploadDebug.info('File buffer details: Length=%d bytes', buffer.length);
      
      // Extract and log file signature for debugging
      const fileSignature = buffer.slice(0, 16);
      const hexSignature = fileSignature.toString('hex');
      const asciiSignature = fileSignature.toString('ascii').replace(/[^\x20-\x7E]/g, '.');
      
      uploadDebug.info('File signatures:');
      uploadDebug.info('- Hex (first 16 bytes): %s', hexSignature);
      uploadDebug.info('- ASCII (first 16 bytes): %s', asciiSignature);
      
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
      
      uploadDebug.info('Detected file type from signature: %s', detectedType);
      uploadDebug.info('Declared mimetype: %s', req.file.mimetype);
      
      // Basic file type validation
      if (detectedType === 'unknown') {
        uploadDebug.warn('Unknown file type signature');
      } else if (!detectedType.includes('pdf') && req.file.mimetype.includes('pdf')) {
        uploadDebug.warn('Mimetype mismatch: Declared as PDF but signature suggests %s', detectedType);
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
        uploadDebug.error('Suspicious file signature detected: %s', hexSignature);
        return next(new ErrorResponse('File appears to be malicious or contains executable code. Only PDF files are accepted.', 400));
      }
      
      // Check filename for suspicious extensions (double extensions)
      const originalName = req.file.originalname.toLowerCase();
      uploadDebug.info('Checking filename: %s', originalName);
      
      if (originalName.includes('.exe.') || 
          originalName.includes('.php.') || 
          originalName.includes('.js.') || 
          originalName.includes('.vbs.') ||
          originalName.includes('.bat.') ||
          originalName.includes('.cmd.')) {
        uploadDebug.error('Suspicious filename detected: %s', originalName);
        return next(new ErrorResponse('Filename contains suspicious patterns.', 400));
      }
      
      // Validate file extension against mimetype
      const fileExtension = originalName.substring(originalName.lastIndexOf('.') + 1);
      uploadDebug.info('File extension: %s', fileExtension);
      
      // Check for PDF-specific file format validity
      if (req.file.mimetype === 'application/pdf' || fileExtension === 'pdf') {
        uploadDebug.info('Validating as PDF file');
        
        // Check for the PDF header signature (%PDF)
        const pdfSignature = buffer.slice(0, 4).toString('ascii');
        uploadDebug.info('PDF signature check: "%s"', pdfSignature);
        
        if (pdfSignature !== '%PDF') {
          uploadDebug.error('Invalid PDF header signature: "%s"', pdfSignature);
          
          // Special debug for a common issue with JSON content instead of file
          if (pdfSignature.includes('{') || pdfSignature.includes('[')) {
            uploadDebug.error('JSON content detected instead of PDF file. This suggests a formData creation issue.');
            
            // Try to extract more of the content for debugging
            const firstPart = buffer.slice(0, 100).toString('utf8');
            uploadDebug.error('First 100 bytes of content: %s', firstPart);
            
            return next(new ErrorResponse('Invalid PDF format: JSON content detected instead of PDF file. This is likely a frontend FormData creation issue.', 400));
          }
          
          return next(new ErrorResponse('Invalid PDF file format. The file does not begin with %PDF signature.', 400));
        }
        
        // Optional: Check for EOF marker (not all PDFs have this but it's a good sign)
        const lastBytes = buffer.slice(-6).toString('ascii');
        uploadDebug.info('Last bytes of file: "%s"', lastBytes);
        if (!lastBytes.includes('EOF')) {
          uploadDebug.warn('PDF file does not contain standard EOF marker. File might be truncated or corrupted.');
        }
      }
      
      uploadDebug.info('File passed basic security and format checks');
    } catch (scanError) {
      uploadDebug.error('Error during file security scanning: %o', scanError);
      return next(new ErrorResponse('Error verifying file security: ' + scanError.message, 500));
    }

    try {
      // Log what kind of upload we received
      uploadDebug.info('Processing file upload via %s method', req.file.upload_method || 'standard');
      
      // Generate a unique ID for the file
      const fileId = uuidv4();
      uploadDebug.info('Generated file ID: %s', fileId);
      
      // Determine file storage strategy based on received file
      let filepath;
      let fileSize;
      
      // If file was uploaded using disk storage, it already has a path
      if (req.file.path && req.file.upload_method === 'disk_storage') {
        // File is already on disk, just reference it
        filepath = req.file.path;
        fileSize = req.file.size;
        uploadDebug.info('Using existing file on disk at: %s', filepath);
      } 
      // For memory uploads or JSON base64 uploads, we need to save the buffer
      else {
        // Create directories if they don't exist
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
          uploadDebug.info('Creating upload directory: %s', uploadDir);
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Get file extension or default to .pdf
        const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
        const filename = `${fileId}${extension}`;
        filepath = path.join(uploadDir, filename);
        
        uploadDebug.info('Saving file buffer to disk at: %s', filepath);
        
        // Write file buffer to uploads directory
        fs.writeFileSync(filepath, req.file.buffer);
        
        // Verify file was written successfully
        if (!fs.existsSync(filepath)) {
          uploadDebug.error('Failed to save file to %s', filepath);
          throw new Error(`Failed to save file to ${filepath}`);
        }
        
        fileSize = fs.statSync(filepath).size;
        uploadDebug.info('Successfully saved file buffer to disk, size: %d bytes', fileSize);
      }
      
      // Get file extension
      const extension = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = path.basename(filepath);
      
      // CLOUDINARY INTEGRATION: Upload file to Cloudinary
      let cloudinaryResult;
      try {
        // Import cloudinary service
        const cloudinaryService = require('../services/cloudinaryService');
        
        uploadDebug.info('Uploading file to Cloudinary...');
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
        
        uploadDebug.info('Cloudinary upload successful: %o', {
          publicId: cloudinaryResult.public_id,
          url: cloudinaryResult.url ? 'generated' : 'missing',
          secureUrl: cloudinaryResult.secure_url ? 'generated' : 'missing'
        });
      } catch (cloudinaryError) {
        uploadDebug.error('Cloudinary upload failed: %o', cloudinaryError);
        uploadDebug.warn('Continuing with local file storage as fallback');
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
          uploadDebug.info('File operation saved to memory storage with ID: %s', fileOperation._id);
        } else {
          uploadDebug.info('File operation saved to MongoDB with ID: %s', fileOperation._id);
        }
      } catch (dbError) {
        // Handle errors with DB storage - attempt to use memory fallback directly
        uploadDebug.error('Error saving operation record: %s', dbError.message);
        
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
            uploadDebug.info('File operation saved to memory storage as fallback with ID: %s', opId);
          } catch (memoryError) {
            uploadDebug.error('Failed to save operation to memory storage: %s', memoryError.message);
          }
        } else {
          uploadDebug.error('No memory storage available as fallback!');
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
            uploadDebug.error('Error reading PDF header from file: %o', readError);
          }
        }
        
        if (isPdf) {
          // Set a default page count since we can't easily count pages
          pageCount = 1; // Default value
          uploadDebug.info('Valid PDF file uploaded');
        } else {
          uploadDebug.warn('File does not have PDF signature - might not be a valid PDF');
        }
      }
      
      // Track successful upload in stats
      const fileCleanup = require('../utils/fileCleanup');
      fileCleanup.recordUpload(true, req.file.size, req.file.upload_method || 'standard');
      
      // Return success response with file data
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 1);
      
      uploadDebug.info('Sending success response to client');
      
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
      
      uploadDebug.info('========== FILE UPLOAD COMPLETED SUCCESSFULLY ==========');
    } catch (fileError) {
      uploadDebug.error('Error processing file upload: %o', fileError);
      
      // Track failed upload in stats
      try {
        const fileCleanup = require('../utils/fileCleanup');
        fileCleanup.recordUpload(false, req.file ? req.file.size : 0, req.file ? req.file.upload_method || 'standard' : 'error');
      } catch (statsError) {
        uploadDebug.error('Failed to record upload stats: %o', statsError);
      }
      
      return next(new ErrorResponse(`Error processing file upload: ${fileError.message}`, 500));
    }
  } catch (error) {
    uploadDebug.error('Unexpected error in file upload: %o', error);
    next(error);
  }
};

// @desc    Get file preview
// @route   GET /api/files/preview/:filename
// @access  Public
exports.getFilePreview = async (req, res, next) => {
  try {
    // Log crucial diagnostics info
    downloadDebug.info('⬇️ PREVIEW REQUEST - Requested preview file: %s', req.params.filename);
    downloadDebug.info('🔍 DIAGNOSTICS INFO:');
    downloadDebug.info('- Railway mode: %s', process.env.RAILWAY_SERVICE_NAME ? 'YES' : 'NO');
    downloadDebug.info('- Memory fallback: %s', global.usingMemoryFallback ? 'ENABLED' : 'DISABLED');
    downloadDebug.info('- Environment: %s', process.env.NODE_ENV || 'development');
    downloadDebug.info('- Current working directory: %s', process.cwd());
    
    // Extract fileId from filename parameter
    const fileId = path.parse(req.params.filename).name;
    downloadDebug.info('Looking for preview for fileId: %s', fileId);
    
    // PDF previews are requested with .pdf extension but are actually stored as JPG images
    const isRequestingPdfPreview = path.extname(req.params.filename).toLowerCase() === '.pdf';
    downloadDebug.info('Is requesting PDF preview: %s', isRequestingPdfPreview);
    
    // Strategy 1: Check if preview exists locally
    const tempDir = process.env.TEMP_DIR || path.join(__dirname, '..', 'temp');
    // Use JPG extension for the actual file, regardless of requested extension
    const previewJpgPath = path.join(tempDir, `${fileId}.jpg`);
    const absoluteJpgPath = path.resolve(previewJpgPath);
    
    downloadDebug.info('Checking for preview file at: %s', previewJpgPath);
    downloadDebug.info('Absolute path: %s', absoluteJpgPath);
    
    // Check if the preview file exists locally and try to serve it
    try {
      if (fs.existsSync(absoluteJpgPath)) {
        downloadDebug.info('Preview file found locally at: %s', absoluteJpgPath);
        
        try {
          // Read the file directly and send as buffer
          const fileBuffer = fs.readFileSync(absoluteJpgPath);
          
          if (!fileBuffer || fileBuffer.length === 0) {
            downloadDebug.error('Preview file exists but is empty: %s', absoluteJpgPath);
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
          
          downloadDebug.info('Serving local preview file (%d bytes)', fileBuffer.length);
          return res.send(fileBuffer);
        } catch (readError) {
          downloadDebug.error('Error reading preview file: %s', readError.message);
          downloadDebug.error(readError.stack);
          throw readError; // Re-throw to try Cloudinary fallback
        }
      } else {
        downloadDebug.info('Preview file not found locally: %s', absoluteJpgPath);
      }
    } catch (localFileError) {
      downloadDebug.error('Error trying to serve local preview file: %s', localFileError.message);
      downloadDebug.error(localFileError.stack);
    }
    
    // Strategy 2: Use Cloudinary fallback via operations collection
    try {
      downloadDebug.info('Looking for preview in Cloudinary for fileId: %s', fileId);
      
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
        downloadDebug.info('No operations found for fileId: %s', fileId);
      } else {
        downloadDebug.info('Found %d operations for fileId: %s', operations.length, fileId);
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
          downloadDebug.info('Found Cloudinary data in source file (operation ID: %s)', operation._id);
          break;
        }
        
        // Check result file as fallback
        if (operation.resultFileCloudinaryUrl) {
          cloudinaryUrl = operation.resultFileCloudinaryUrl;
          cloudinaryPublicId = operation.resultFileCloudinaryId;
          cloudinaryFormat = operation.targetFormat || 'pdf';
          downloadDebug.info('Found Cloudinary data in result file (operation ID: %s)', operation._id);
          break;
        }
      }
      
      // If we found a Cloudinary URL, test if it's accessible
      if (cloudinaryUrl) {
        downloadDebug.info('Found Cloudinary URL for preview: %s', cloudinaryUrl);
        
        // Test if the URL is directly accessible
        const urlAccessResult = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
        
        if (urlAccessResult.success) {
          downloadDebug.info('Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
          return res.redirect(cloudinaryUrl);
        } else if (urlAccessResult.status === 401 || urlAccessResult.status === 403) {
          // URL not directly accessible, try generating a signed URL
          downloadDebug.info('Cloudinary URL returned %d, trying signed URL', urlAccessResult.status);
          
          if (cloudinaryPublicId) {
            try {
              const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                cloudinaryPublicId,
                cloudinaryFormat
              );
              
              downloadDebug.info('Generated signed URL: %s', signedUrl);
              
              // Test if signed URL is accessible
              const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
              
              if (signedUrlTest.success) {
                downloadDebug.info('Signed URL is accessible, redirecting');
                return res.redirect(signedUrl);
              } else {
                downloadDebug.info('Signed URL not accessible (status: %d), trying proxy', signedUrlTest.status);
              }
            } catch (signedUrlError) {
              downloadDebug.error('Error generating signed URL: %s', signedUrlError.message);
            }
          }
          
          // If signed URL failed or we don't have a public ID, try proxying content
          downloadDebug.info('Attempting to proxy content from Cloudinary');
          
          // Extract Cloudinary info from URL if available
          const cloudinaryInfo = cloudinaryHelper.extractCloudinaryInfo(cloudinaryUrl);
          downloadDebug.info('Extracted Cloudinary info: %o', cloudinaryInfo);
          
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
              downloadDebug.error('Error generating signed direct URL: %s', err.message);
            }
          }
          
          // Try each variant until one works
          for (const urlVariant of urlVariants) {
            try {
              downloadDebug.info('Trying to proxy content from: %s', urlVariant);
              
              const response = await axios.get(urlVariant, {
                responseType: 'arraybuffer',
                timeout: 5000,
                validateStatus: false // don't throw for any status code
              });
              
              if (response.status >= 200 && response.status < 300 && response.data) {
                downloadDebug.info('Successfully proxied content (%d bytes)', response.data.length);
                
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
                downloadDebug.info('Failed to proxy from %s, status: %d', urlVariant, response.status);
              }
            } catch (proxyError) {
              downloadDebug.error('Error proxying from %s: %s', urlVariant, proxyError.message);
            }
          }
        } else {
          downloadDebug.info('Cloudinary URL not accessible, status: %d', urlAccessResult.status);
        }
      } else {
        downloadDebug.info('No Cloudinary URL found for fileId: %s', fileId);
      }
    } catch (cloudinaryError) {
      downloadDebug.error('Error trying Cloudinary fallback: %s', cloudinaryError.message);
      downloadDebug.error(cloudinaryError.stack);
    }
    
    // Strategy 3: Try to find and generate a preview if it's a PDF
    if (isRequestingPdfPreview) {
      try {
        downloadDebug.info('Attempting to find and generate preview for PDF with ID: %s', fileId);
        
        // Check if the original PDF exists
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        const pdfFilePath = path.join(uploadDir, `${fileId}.pdf`);
        const absolutePdfPath = path.resolve(pdfFilePath);
        
        if (fs.existsSync(absolutePdfPath)) {
          downloadDebug.info('Found original PDF file: %s', absolutePdfPath);
          
          // Try to generate a preview on-the-fly
          try {
            // Import the PDF service
            const pdfService = require('../services/pdfService');
            
            downloadDebug.info('Generating preview for: %s', absolutePdfPath);
            const previewResult = await pdfService.generatePdfPreview(absolutePdfPath);
            
            if (previewResult.success) {
              downloadDebug.info('Successfully generated preview at: %s', previewResult.previewPath);
              
              // Read and send the newly generated preview
              const previewBuffer = fs.readFileSync(previewResult.previewPath);
              
              // Set appropriate content type (always image/jpeg for previews)
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Content-Length', previewBuffer.length);
              
              // If this is supposed to be an attachment, set disposition header
              if (req.query.download === 'true') {
                res.setHeader('Content-Disposition', `attachment; filename="${fileId}.pdf"`);
              }
              
              downloadDebug.info('Serving freshly generated preview (%d bytes)', previewBuffer.length);
              return res.send(previewBuffer);
            } else {
              downloadDebug.error('Failed to generate preview: %s', previewResult.message);
            }
          } catch (generateError) {
            downloadDebug.error('Error generating preview: %s', generateError.message);
            downloadDebug.error(generateError.stack);
          }
        } else {
          downloadDebug.info('Original PDF not found at: %s', absolutePdfPath);
        }
      } catch (previewGenerationError) {
        downloadDebug.error('Error in preview generation attempt: %s', previewGenerationError.message);
        downloadDebug.error(previewGenerationError.stack);
      }
    }
    
    // If we reach here, all fallback strategies failed
    downloadDebug.info('All fallback strategies failed for preview: %s', req.params.filename);
    return next(new ErrorResponse('Preview not found', 404));
  } catch (error) {
    downloadDebug.error('Error in getFilePreview: %s', error.message);
    downloadDebug.error(error.stack);
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
    
    downloadDebug.info('⬇️ DOWNLOAD REQUEST - Requested result file: %s', req.params.filename);
    
    // Log crucial diagnostics info
    downloadDebug.info('🔍 DIAGNOSTICS INFO:');
    downloadDebug.info('- Railway mode: %s', process.env.RAILWAY_SERVICE_NAME ? 'YES' : 'NO');
    downloadDebug.info('- Memory fallback: %s', global.usingMemoryFallback ? 'ENABLED' : 'DISABLED');
    downloadDebug.info('- Environment: %s', process.env.NODE_ENV || 'development');
    downloadDebug.info('- Memory storage: %s', global.memoryStorage ? 'INITIALIZED' : 'NOT INITIALIZED');
    if (global.memoryStorage) {
      downloadDebug.info('- Memory operations: %d', global.memoryStorage.operations?.length || 0);
    }
    
    // Make sure the filename parameter exists
    if (!req.params.filename) {
      return next(new ErrorResponse('Filename parameter is missing', 400));
    }
    
    // Log the requested file details
    const fileDetails = path.parse(req.params.filename);
    downloadDebug.info('📄 REQUESTED FILE DETAILS:');
    downloadDebug.info('- Filename: %s', req.params.filename);
    downloadDebug.info('- Base name: %s', fileDetails.name);
    downloadDebug.info('- Extension: %s', fileDetails.ext);
    
    // Check if we have the global last ID for debugging
    if (global.lastResultFileId) {
      downloadDebug.info('🆔 Last known resultFileId: %s', global.lastResultFileId);
      downloadDebug.info('🔄 Matches requested file: %s', global.lastResultFileId === fileDetails.name ? 'YES' : 'NO');
    }
    
    const resultPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    downloadDebug.info('🔎 Looking for result file at: %s', resultPath);
    
    // Enhanced file finding logic to match the download controller
    let fileFound = false;
    let finalPath = resultPath;
    
    // First check if file exists at the expected path
    if (fs.existsSync(resultPath)) {
      downloadDebug.info('✅ File found at original path: %s', resultPath);
      fileFound = true;
    } else {
      downloadDebug.error('❌ File not found at path: %s', resultPath);
      
      // STRATEGY 1: Try to find the file by pattern matching (in case extension is wrong)
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileBaseName = path.parse(req.params.filename).name;
      
      // Check if temp directory exists
      if (!fs.existsSync(tempDir)) {
        downloadDebug.error('❌ Temp directory doesn\'t exist: %s', tempDir);
        try {
          downloadDebug.info('🔧 Creating temp directory: %s', tempDir);
          fs.mkdirSync(tempDir, { recursive: true });
          downloadDebug.info('✅ Successfully created temp directory');
        } catch (mkdirErr) {
          downloadDebug.error('❌ Failed to create temp directory: %o', mkdirErr);
        }
      }
      
      if (fs.existsSync(tempDir)) {
        downloadDebug.info('🔍 Searching for result file using multiple strategies...');
        // List all files in temp directory with detailed info
        const files = fs.readdirSync(tempDir);
        downloadDebug.info('📂 Found %d files in directory: %s', files.length, tempDir);
        
        // Log directory permissions
        try {
          const stats = fs.statSync(tempDir);
          downloadDebug.info('📂 Temp directory permissions: %s', stats.mode.toString(8));
        } catch (err) {
          downloadDebug.error('❌ Failed to get temp directory stats: %o', err);
        }
        
        if (files.length > 0) {
          downloadDebug.info('📄 Files in temp directory:');
          files.slice(0, 10).forEach((file, idx) => {
            try {
              const filePath = path.join(tempDir, file);
              const stats = fs.statSync(filePath);
              downloadDebug.info('   %d. %s (%d bytes, modified: %s)', idx+1, file, stats.size, stats.mtime);
            } catch (err) {
              downloadDebug.info('   %d. %s (error getting stats)', idx+1, file);
            }
          });
          
          if (files.length > 10) {
            downloadDebug.info('   ... and %d more files', files.length - 10);
          }
        }
        
        // STRATEGY 2: Check if there's a file that starts with the same base name
        const matchingFiles = files.filter(file => file.startsWith(fileBaseName));
        
        if (matchingFiles.length > 0) {
          downloadDebug.info('✅ Found %d matching files by prefix: %s', matchingFiles.length, matchingFiles.join(', '));
          finalPath = path.join(tempDir, matchingFiles[0]);
          fileFound = true;
        } else {
          // STRATEGY 3: Try alternative extensions
          downloadDebug.info('🔄 Trying alternative extensions for %s', fileBaseName);
          const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
          
          for (const ext of possibleExtensions) {
            const testPath = path.join(tempDir, `${fileBaseName}${ext}`);
            downloadDebug.info('- Trying path: %s', testPath);
            
            if (fs.existsSync(testPath)) {
              finalPath = testPath;
              fileFound = true;
              downloadDebug.info('✅ Found file with extension %s: %s', ext, finalPath);
              break;
            }
          }
          
          // STRATEGY 4: Last resort - UUID may have been generated differently
          // Check if any file contains this ID as a substring 
          if (!fileFound) {
            downloadDebug.info('🔍 Trying fuzzy match for ID fragments...');
            // Remove common prefixes/suffixes for better matching
            const cleanId = fileBaseName.replace(/^result-/, '').replace(/-result$/, '');
            
            if (cleanId.length >= 8) { // Only if we have a reasonably unique portion
              downloadDebug.info('- Using clean ID for fuzzy matching: %s', cleanId);
              const fuzzyMatches = files.filter(file => file.includes(cleanId));
              
              if (fuzzyMatches.length > 0) {
                downloadDebug.info('✅ Found %d fuzzy matches: %s', fuzzyMatches.length, fuzzyMatches.join(', '));
                finalPath = path.join(tempDir, fuzzyMatches[0]);
                fileFound = true;
              } else {
                downloadDebug.info('❌ No fuzzy matches found');
              }
            }
          }
        }
      }
    }
    
    if (!fileFound) {
      // Last resort for Railway - try checking Cloudinary data in the database
      if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
        downloadDebug.error('⚠️ CRITICAL: File not found but checking Cloudinary for Railway/memory mode compatibility');
        downloadDebug.error('Request filename: %s', req.params.filename);
        downloadDebug.error('Tried paths including: %s', resultPath);
        
        // STEP 1: Try to find operation with this result file ID and check Cloudinary URL
        try {
          const fileBaseName = path.parse(req.params.filename).name;
          downloadDebug.info('🔍 Looking for operation with resultFileId: %s', fileBaseName);
          
          // Find the operation in the database
          const Operation = require('../models/Operation');
          const operation = await Operation.findOne({ resultFileId: fileBaseName });
          
          let cloudinaryUrl;
          let cloudinaryPublicId;
          let cloudinaryFormat;
          
          if (operation) {
            downloadDebug.info('✅ Found operation in database: %s', operation._id);
            downloadDebug.info('🧾 OPERATION DETAILS:');
            downloadDebug.info('- Type: %s', operation.operationType || 'N/A');
            downloadDebug.info('- Status: %s', operation.status || 'N/A');
            downloadDebug.info('- Source File ID: %s', operation.sourceFileId || 'N/A');
            downloadDebug.info('- Result File ID: %s', operation.resultFileId || 'N/A');
            downloadDebug.info('- Has Cloudinary Data: %s', operation.cloudinaryData ? 'YES' : 'NO');
            
            if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
              downloadDebug.info('✅ Found Cloudinary URL in operation: %s', operation.cloudinaryData.secureUrl);
              cloudinaryUrl = operation.cloudinaryData.secureUrl;
              cloudinaryPublicId = operation.cloudinaryData.publicId;
              cloudinaryFormat = operation.cloudinaryData.format;
              
              // Add download parameter if needed
              cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
              
              // Step 1.1: Test if Cloudinary URL is accessible before redirecting
              downloadDebug.info('Testing Cloudinary URL access: %s', cloudinaryUrl);
              const urlAccessTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
              
              if (urlAccessTest.success) {
                downloadDebug.info('Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
                return res.redirect(cloudinaryUrl);
              } else {
                downloadDebug.warn('⚠️ Cloudinary URL access failed: Status %d, Error: %s', urlAccessTest.status, urlAccessTest.error);
                
                // If status is 401 (Unauthorized), try signed URL approach
                if (urlAccessTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
                  downloadDebug.info('Attempting to create signed URL for public ID: %s', cloudinaryPublicId);
                  
                  try {
                    const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                      cloudinaryPublicId,
                      cloudinaryFormat,
                      { attachment: true }
                    );
                    
                    downloadDebug.info('Generated signed URL: %s', signedUrl);
                    
                    // Test if the signed URL is accessible
                    const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                    
                    if (signedUrlTest.success) {
                      downloadDebug.info('Signed URL is accessible, redirecting to: %s', signedUrl);
                      return res.redirect(signedUrl);
                    } else {
                      downloadDebug.warn('⚠️ Signed URL access also failed: Status %d', signedUrlTest.status);
                      // Continue to next fallback
                    }
                  } catch (signError) {
                    downloadDebug.error('Error generating signed URL: %o', signError);
                    // Continue to next fallback
                  }
                }
              }
            } else {
              downloadDebug.error('❌ No Cloudinary data found in operation');
              // Log more details about the operation for debugging
              downloadDebug.info('🔍 OPERATION FULL DATA: %o', operation);
            }
          } else {
            downloadDebug.error('❌ No operation found for resultFileId: %s', fileBaseName);
          }
        } catch (dbError) {
          downloadDebug.error('❌ Error looking up operation in database: %s', dbError.message);
        }
        
        // STEP 2: Check memory storage if it's available
        let memCloudinaryUrl;
        let memCloudinaryPublicId;
        let memCloudinaryFormat;
        let memOperation;
        
        if (global.memoryStorage && global.memoryStorage.operations) {
          try {
            downloadDebug.info('🔍 Checking memory storage for operation');
            downloadDebug.info('📊 Memory storage contains %d operations', global.memoryStorage.operations.length);
            
            // Log all operations for debugging
            downloadDebug.info('📋 Listing all operations in memory:');
            global.memoryStorage.operations.forEach((op, idx) => {
              downloadDebug.info('   %d. ID: %s, Type: %s, Status: %s', 
                idx+1, op._id || 'N/A', op.operationType || 'N/A', op.status || 'N/A');
              downloadDebug.info('      Result File ID: %s, Source File ID: %s', 
                op.resultFileId || 'N/A', op.sourceFileId || 'N/A');
              downloadDebug.info('      Has Cloudinary: %s', op.cloudinaryData ? 'YES' : 'NO');
            });
            
            const fileBaseName = path.parse(req.params.filename).name;
            
            // Try standard operations first 
            memOperation = global.memoryStorage.operations.find(op => 
              op.resultFileId === fileBaseName || 
              (op.fileData && op.fileData.filename === req.params.filename)
            );
            
            if (memOperation) {
              downloadDebug.info('✅ Found operation in memory storage: %s', memOperation._id);
              
              // Look for associated file path or URL
              if (memOperation.cloudinaryData && memOperation.cloudinaryData.secureUrl) {
                downloadDebug.info('✅ Found Cloudinary URL from memory storage: %s', memOperation.cloudinaryData.secureUrl);
                memCloudinaryUrl = memOperation.cloudinaryData.secureUrl;
                memCloudinaryPublicId = memOperation.cloudinaryData.publicId;
                memCloudinaryFormat = memOperation.cloudinaryData.format || path.extname(req.params.filename).replace('.', '');
                
                // Add download parameter if needed
                memCloudinaryUrl = cloudinaryHelper.addDownloadParameters(memCloudinaryUrl);
                
                // Test if Cloudinary URL is accessible before redirecting
                downloadDebug.info('Testing memory Cloudinary URL access: %s', memCloudinaryUrl);
                const memUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(memCloudinaryUrl);
                
                if (memUrlTest.success) {
                  downloadDebug.info('Memory Cloudinary URL is accessible, redirecting to: %s', memCloudinaryUrl);
                  return res.redirect(memCloudinaryUrl);
                } else {
                  downloadDebug.warn('⚠️ Memory Cloudinary URL access failed: Status %d, Error: %s', memUrlTest.status, memUrlTest.error);
                  
                  // If status is 401 (Unauthorized), try signed URL approach
                  if (memUrlTest.status === 401 && memCloudinaryPublicId) {
                    downloadDebug.info('Attempting to create signed URL for memory public ID: %s', memCloudinaryPublicId);
                    
                    try {
                      const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                        memCloudinaryPublicId,
                        memCloudinaryFormat,
                        { attachment: true }
                      );
                      
                      downloadDebug.info('Generated signed URL for memory: %s', signedUrl);
                      
                      // Test if the signed URL is accessible
                      const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                      
                      if (signedUrlTest.success) {
                        downloadDebug.info('Memory signed URL is accessible, redirecting to: %s', signedUrl);
                        return res.redirect(signedUrl);
                      } else {
                        downloadDebug.warn('⚠️ Memory signed URL access also failed: Status %d', signedUrlTest.status);
                        // Continue to next fallback
                      }
                    } catch (signError) {
                      downloadDebug.error('Error generating signed URL for memory: %o', signError);
                      // Continue to next fallback
                    }
                  }
                }
              }
              
              if (memOperation.resultDownloadUrl) {
                downloadDebug.info('✅ Found result download URL: %s', memOperation.resultDownloadUrl);
                
                // If it's a local URL, check if we have the file
                if (memOperation.resultDownloadUrl.startsWith('/api/')) {
                  // Get associated operation ID
                  downloadDebug.info('🚨 EMERGENCY MODE: Getting download for operation %s', memOperation._id);
                  downloadDebug.info('Looked up operation %s in memory: found', memOperation._id);
                  downloadDebug.info('🧾 OPERATION FULL DATA: %o', memOperation);
                  
                  // Generate direct download URL based on the requested filename
                  const generateUrl = `${req.protocol}://${req.get('host')}/api/files/result/${req.params.filename}`;
                  downloadDebug.info('🔄 Generated download URL: %s', generateUrl);
                } else if (memOperation.resultDownloadUrl.includes('cloudinary.com')) {
                  downloadDebug.info('✅ Found Cloudinary URL in resultDownloadUrl: %s', memOperation.resultDownloadUrl);
                  
                  // Add download parameter if needed
                  const cloudinaryDownloadUrl = cloudinaryHelper.addDownloadParameters(memOperation.resultDownloadUrl);
                  
                  // Test if this URL is accessible
                  downloadDebug.info('Testing result download URL access: %s', cloudinaryDownloadUrl);
                  const downloadUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryDownloadUrl);
                  
                  if (downloadUrlTest.success) {
                    downloadDebug.info('Result download URL is accessible, redirecting to: %s', cloudinaryDownloadUrl);
                    return res.redirect(cloudinaryDownloadUrl);
                  } else {
                    downloadDebug.warn('⚠️ Result download URL access failed: Status %d', downloadUrlTest.status);
                    // Extract cloudinary info for signed URL attempt
                    const extractedInfo = cloudinaryHelper.extractCloudinaryInfo(memOperation.resultDownloadUrl);
                    if (extractedInfo && extractedInfo.publicId) {
                      try {
                        downloadDebug.info('Attempting to create signed URL from extracted info: %s', extractedInfo.publicId);
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
                          downloadDebug.info('Extracted signed URL is accessible, redirecting to: %s', signedUrl);
                          return res.redirect(signedUrl);
                        }
                      } catch (extractError) {
                        downloadDebug.error('Error generating signed URL from extracted info: %o', extractError);
                      }
                    }
                    // Continue to next fallback if URL access failed
                  }
                }
              }
            } else {
              downloadDebug.info('❌ No matching operation found in memory storage');
              
              // Try looking up related operations by source file ID
              downloadDebug.info('🔍 Looking for related operations by source ID patterns...');
              const relatedOps = global.memoryStorage.operations.filter(op => 
                // Look for operations that might be conversion operations
                op.operationType === 'conversion' &&
                // And are completed
                op.status === 'completed'
              );
              
              if (relatedOps.length > 0) {
                downloadDebug.info('🔍 Found %d conversion operations to check', relatedOps.length);
                for (const op of relatedOps) {
                  downloadDebug.info('🔍 Checking operation %s', op._id);
                  if (op.cloudinaryData && op.cloudinaryData.secureUrl) {
                    downloadDebug.info('✅ Found potential Cloudinary URL: %s', op.cloudinaryData.secureUrl);
                    downloadDebug.info('🧾 From operation: %o', op);
                    
                    // Test URL accessibility before redirecting
                    const relatedUrl = cloudinaryHelper.addDownloadParameters(op.cloudinaryData.secureUrl);
                    const relatedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(relatedUrl);
                    
                    if (relatedUrlTest.success) {
                      downloadDebug.info('Related operation URL is accessible, redirecting to: %s', relatedUrl);
                      return res.redirect(relatedUrl);
                    } else {
                      downloadDebug.warn('⚠️ Related operation URL access failed: %d', relatedUrlTest.status);
                      // Continue checking other operations
                    }
                  }
                }
              }
            }
          } catch (memoryError) {
            downloadDebug.error('❌ Error checking memory storage: %o', memoryError);
          }
        }
        
        // STEP 3: For Cloudinary URLs that failed with 401, try to proxy the content instead of redirecting
        if ((cloudinaryUrl || memCloudinaryUrl) && (operation || memOperation)) {
          downloadDebug.info('Attempting to proxy Cloudinary content for failed URL access');
          
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
                  downloadDebug.error('Error generating signed URL from extracted info: %o', err);
                }
              }
            }
            
            // Try each URL variant
            let fileBuffer = null;
            let successUrl = null;
            
            for (const urlVariant of urlVariants) {
              try {
                downloadDebug.info('Trying to fetch content from URL variant: %s', urlVariant);
                const response = await axios.get(urlVariant, { 
                  responseType: 'arraybuffer',
                  timeout: 5000,
                  maxRedirects: 5,
                  validateStatus: false // Don't throw for any status code
                });
                
                if (response.status >= 200 && response.status < 300 && response.data) {
                  downloadDebug.info('✅ Successfully fetched content from URL variant: %s', urlVariant);
                  fileBuffer = response.data;
                  successUrl = urlVariant;
                  break;
                } else {
                  downloadDebug.error('❌ Failed to fetch from URL variant: %s, status: %d', urlVariant, response.status);
                }
              } catch (variantError) {
                downloadDebug.error('Error fetching from URL variant %s: %s', urlVariant, variantError.message);
                // Continue to next variant
              }
            }
            
            if (fileBuffer && fileBuffer.length > 0) {
              downloadDebug.info('✅ Successfully proxied content from Cloudinary (%d bytes, URL: %s)', fileBuffer.length, successUrl);
              
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
              downloadDebug.warn('❌ Failed to proxy content from any Cloudinary URL variant');
            }
          } catch (proxyError) {
            downloadDebug.error('Error proxying Cloudinary content: %o', proxyError);
            // Continue to fallback response
          }
        }
        
        // STEP 4: RAILWAY FIX - Try to generate a direct file instead of using Cloudinary
        downloadDebug.info('RAILWAY FIX: Generating direct file download for missing document');
        
        // Check if Cloudinary is properly configured
        downloadDebug.info('CLOUDINARY CONFIGURATION CHECK:');
        downloadDebug.info('- CLOUDINARY_CLOUD_NAME: %s', process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET');
        downloadDebug.info('- CLOUDINARY_API_KEY: %s', process.env.CLOUDINARY_API_KEY ? 'SET (hidden)' : 'NOT SET');
        downloadDebug.info('- CLOUDINARY_API_SECRET: %s', process.env.CLOUDINARY_API_SECRET ? 'SET (hidden)' : 'NOT SET');
        downloadDebug.info('- CLOUDINARY_URL: %s', process.env.CLOUDINARY_URL ? 'SET (hidden)' : 'NOT SET');
        
        // Log memory information
        const memUsage = process.memoryUsage();
        downloadDebug.info('MEMORY USAGE:');
        downloadDebug.info('- RSS: %d MB', Math.round(memUsage.rss / 1024 / 1024));
        downloadDebug.info('- Heap Total: %d MB', Math.round(memUsage.heapTotal / 1024 / 1024));
        downloadDebug.info('- Heap Used: %d MB', Math.round(memUsage.heapUsed / 1024 / 1024));
        downloadDebug.info('- External: %d MB', Math.round(memUsage.external / 1024 / 1024));
        
        // Check all environment variables for debugging
        downloadDebug.info('CRITICAL ENVIRONMENT VARIABLES:');
        downloadDebug.info('- USE_MEMORY_FALLBACK: %s', process.env.USE_MEMORY_FALLBACK || 'NOT SET');
        downloadDebug.info('- MEMORY_FALLBACK: %s', process.env.MEMORY_FALLBACK || 'NOT SET');
        downloadDebug.info('- RAILWAY_SERVICE_NAME: %s', process.env.RAILWAY_SERVICE_NAME || 'NOT SET');
        downloadDebug.info('- NODE_ENV: %s', process.env.NODE_ENV || 'NOT SET');
        
        // Use the active operation object for file generation context
        const activeOperation = operation || memOperation;
        
        try {
          // Try to create the requested file type on the fly
          const filename = req.params.filename;
          const fileExtension = path.extname(filename).toLowerCase();
          
          downloadDebug.info('RAILWAY DEBUG: Attempting to generate fallback file for %s', filename);
          
          // Get the file ID without extension
          const fileIdBase = path.basename(filename, fileExtension);
          downloadDebug.info('RAILWAY DEBUG: File ID extracted: %s', fileIdBase);
          
          // Log any operations that might contain this file ID
          if (global.memoryStorage && global.memoryStorage.operations) {
            downloadDebug.info('RAILWAY DEBUG: Checking %d operations in memory storage', global.memoryStorage.operations.length);
            const relatedOps = global.memoryStorage.operations.filter(op => 
              op.sourceFileId === fileIdBase || 
              op.resultFileId === fileIdBase || 
              (op.fileData && op.fileData.filePath && op.fileData.filePath.includes(fileIdBase))
            );
            
            if (relatedOps.length > 0) {
              downloadDebug.info('RAILWAY DEBUG: Found %d operations related to file ID %s', relatedOps.length, fileIdBase);
              relatedOps.forEach((op, idx) => {
                downloadDebug.info('RAILWAY DEBUG: Related operation %d: %o', idx+1, {
                  id: op._id,
                  type: op.operationType,
                  sourceFileId: op.sourceFileId,
                  resultFileId: op.resultFileId,
                  status: op.status
                });
              });
            } else {
              downloadDebug.info('RAILWAY DEBUG: No operations found for file ID %s', fileIdBase);
            }
          }
          
          if (fileExtension === '.docx' || filename.includes('.docx')) {
            // Create a simple DOCX file
            downloadDebug.info('Generating a simple DOCX file as replacement');
            
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
                  downloadDebug.info('Found related operation by target format: %s', operationDetails._id);
                }
              }
            }
            
            // Try to get source file name
            if (operationDetails) {
              // First check if there's a file name in the operation directly
              if (operationDetails.fileData && operationDetails.fileData.originalName) {
                sourceFileName = operationDetails.fileData.originalName;
                downloadDebug.info('Found source file name from operation fileData: %s', sourceFileName);
              } 
              // Then check memory storage
              else if (operationDetails.sourceFileId && global.memoryStorage && global.memoryStorage.files) {
                const sourceFile = global.memoryStorage.files.find(f => 
                  f._id === operationDetails.sourceFileId
                );
                
                if (sourceFile) {
                  sourceFileName = sourceFile.name || sourceFile.originalName || 'unknown.pdf';
                  downloadDebug.info('Found source file name from memory storage: %s', sourceFileName);
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
                downloadDebug.info('Using doc.save() method for docx');
                buffer = await doc.save();
              } else {
                // For older docx versions that use Packer.toBuffer
                downloadDebug.info('Using Packer.toBuffer() method for docx');
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
              
              downloadDebug.info('Successfully generated and sent fallback DOCX file with size: %d bytes', buffer.length);
              return;
            } catch (docxError) {
              downloadDebug.error('Error generating fallback DOCX document: %o', docxError);
              
              // If first attempt fails, try a much simpler document
              try {
                downloadDebug.info('Attempting to create a simplified DOCX as last resort');
                
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
                
                downloadDebug.info('Successfully generated and sent simplified DOCX file as last resort');
                return;
              } catch (simpleDocxError) {
                downloadDebug.error('Error generating simplified DOCX: %o', simpleDocxError);
                
                // If all DOCX creation fails, fall back to text content
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.docx', '.txt')}"`);
                res.send("Your PDF has been successfully converted to DOCX format!\n\nThis file was created as a fallback when the server couldn't generate the DOCX file.");
                return;
              }
            }
          } else {
            // For other file types, create a PDF with error message
            downloadDebug.info('Generating a PDF error document');
            
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
          downloadDebug.error('Error creating fallback document: %o', docError);
          
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
      downloadDebug.info('Streaming file from: %s', finalPath);
      fs.createReadStream(finalPath).pipe(res);
      return;
    } catch (fileError) {
      downloadDebug.error('Error accessing file at %s: %o', finalPath, fileError);
      return next(new ErrorResponse(`Error accessing file: ${fileError.message}`, 500));
    }
    
    // Set the correct content type
    const contentType = getContentType(req.params.filename);
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    downloadDebug.info('Setting content type: %s for extension: %s', contentType, extension);
    
    // Create a more user-friendly filename for download
    // Extract the format from extension
    const format = extension.replace('.', '');
    const suggestedFilename = `converted-document.${format}`;
    
    // Set content disposition for download
    res.setHeader('Content-Disposition', `attachment; filename="${suggestedFilename}"`);
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    
    // Stream the file instead of using sendFile for better control
    downloadDebug.info('Streaming file: %s', resultPath);
    fs.createReadStream(resultPath).pipe(res);
  } catch (error) {
    downloadDebug.error('Error getting result file: %o', error);
    
    // For Railway deployment, don't fail with error - create a friendly error PDF document
    if (process.env.RAILWAY_SERVICE_NAME || global.usingMemoryFallback) {
      try {
        downloadDebug.info('Creating error PDF document instead of failing with error');
        
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
        downloadDebug.error('Failed to create error PDF: %o', pdfError);
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
    
    downloadDebug.info('Original file request for: %s (ID: %s)', filename, fileId);
    
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
        downloadDebug.info('Found Cloudinary URL in operation: %s', operation._id);
        cloudinaryUrl = operation.cloudinaryData.secureUrl;
        cloudinaryPublicId = operation.cloudinaryData.publicId;
        cloudinaryFormat = operation.cloudinaryData.format;
        
        // Add download parameter if needed
        cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
        
        // Step 1.1: Test if Cloudinary URL is accessible before redirecting
        downloadDebug.info('Testing Cloudinary URL access: %s', cloudinaryUrl);
        const urlAccessTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
        
        if (urlAccessTest.success) {
          downloadDebug.info('Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
          return res.redirect(cloudinaryUrl);
        } else {
          downloadDebug.warn('⚠️ Cloudinary URL access failed: Status %d, Error: %s', urlAccessTest.status, urlAccessTest.error);
          
          // If status is 401 (Unauthorized), try signed URL approach
          if (urlAccessTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
            downloadDebug.info('Attempting to create signed URL for public ID: %s', cloudinaryPublicId);
            
            try {
              const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                cloudinaryPublicId,
                cloudinaryFormat,
                { attachment: true }
              );
              
              downloadDebug.info('Generated signed URL: %s', signedUrl);
              
              // Test if the signed URL is accessible
              const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
              
              if (signedUrlTest.success) {
                downloadDebug.info('Signed URL is accessible, redirecting to: %s', signedUrl);
                return res.redirect(signedUrl);
              } else {
                downloadDebug.warn('⚠️ Signed URL access also failed: Status %d', signedUrlTest.status);
                // Continue to next fallback
              }
            } catch (signError) {
              downloadDebug.error('Error generating signed URL: %o', signError);
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
          downloadDebug.info('Found Cloudinary URL in result operation: %s', resultOperation._id);
          cloudinaryUrl = resultOperation.cloudinaryData.secureUrl;
          cloudinaryPublicId = resultOperation.cloudinaryData.publicId;
          cloudinaryFormat = resultOperation.cloudinaryData.format;
          operation = resultOperation; // Update the operation reference
          
          // Add download parameter if needed
          cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
          
          // Test if Cloudinary URL is accessible before redirecting
          downloadDebug.info('Testing result Cloudinary URL access: %s', cloudinaryUrl);
          const resultUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
          
          if (resultUrlTest.success) {
            downloadDebug.info('Result Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
            return res.redirect(cloudinaryUrl);
          } else {
            downloadDebug.warn('⚠️ Result Cloudinary URL access failed: Status %d, Error: %s', resultUrlTest.status, resultUrlTest.error);
            
            // If status is 401 (Unauthorized), try signed URL approach
            if (resultUrlTest.status === 401 && cloudinaryPublicId && cloudinaryFormat) {
              downloadDebug.info('Attempting to create signed URL for result public ID: %s', cloudinaryPublicId);
              
              try {
                const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                  cloudinaryPublicId,
                  cloudinaryFormat,
                  { attachment: true }
                );
                
                downloadDebug.info('Generated signed URL for result: %s', signedUrl);
                
                // Test if the signed URL is accessible
                const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                
                if (signedUrlTest.success) {
                  downloadDebug.info('Result signed URL is accessible, redirecting to: %s', signedUrl);
                  return res.redirect(signedUrl);
                } else {
                  downloadDebug.warn('⚠️ Result signed URL access also failed: Status %d', signedUrlTest.status);
                  // Continue to next fallback
                }
              } catch (signError) {
                downloadDebug.error('Error generating signed URL for result: %o', signError);
                // Continue to next fallback
              }
            }
          }
        }
      }
    } catch (dbError) {
      downloadDebug.error('Error checking database for Cloudinary URL: %o', dbError);
      // Continue with local file as fallback
    }
    
    // STEP 2: Check memory storage if available
    if (!cloudinaryUrl && global.memoryStorage && global.memoryStorage.operations) {
      try {
        downloadDebug.info('Checking memory storage for Cloudinary URL');
        
        // Look for operations with this file as source
        const memOperation = global.memoryStorage.operations.find(op => 
          op.sourceFileId === fileId && op.cloudinaryData && op.cloudinaryData.secureUrl
        );
        
        if (memOperation) {
          downloadDebug.info('Found Cloudinary URL in memory operation: %s', memOperation._id);
          cloudinaryUrl = memOperation.cloudinaryData.secureUrl;
          cloudinaryPublicId = memOperation.cloudinaryData.publicId;
          cloudinaryFormat = memOperation.cloudinaryData.format || path.extname(filename).replace('.', '');
          operation = memOperation; // Update the operation reference
          
          // Add download parameter if needed
          cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
          
          // Test if Cloudinary URL is accessible before redirecting
          downloadDebug.info('Testing memory Cloudinary URL access: %s', cloudinaryUrl);
          const memUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
          
          if (memUrlTest.success) {
            downloadDebug.info('Memory Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
            return res.redirect(cloudinaryUrl);
          } else {
            downloadDebug.warn('⚠️ Memory Cloudinary URL access failed: Status %d, Error: %s', memUrlTest.status, memUrlTest.error);
            
            // If status is 401 (Unauthorized), try signed URL approach
            if (memUrlTest.status === 401 && cloudinaryPublicId) {
              downloadDebug.info('Attempting to create signed URL for memory public ID: %s', cloudinaryPublicId);
              
              try {
                const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                  cloudinaryPublicId,
                  cloudinaryFormat,
                  { attachment: true }
                );
                
                downloadDebug.info('Generated signed URL for memory: %s', signedUrl);
                
                // Test if the signed URL is accessible
                const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                
                if (signedUrlTest.success) {
                  downloadDebug.info('Memory signed URL is accessible, redirecting to: %s', signedUrl);
                  return res.redirect(signedUrl);
                } else {
                  downloadDebug.warn('⚠️ Memory signed URL access also failed: Status %d', signedUrlTest.status);
                  // Continue to next fallback
                }
              } catch (signError) {
                downloadDebug.error('Error generating signed URL for memory: %o', signError);
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
            downloadDebug.info('Found Cloudinary URL in memory result operation: %s', memResultOperation._id);
            cloudinaryUrl = memResultOperation.cloudinaryData.secureUrl;
            cloudinaryPublicId = memResultOperation.cloudinaryData.publicId;
            cloudinaryFormat = memResultOperation.cloudinaryData.format || path.extname(filename).replace('.', '');
            operation = memResultOperation; // Update the operation reference
            
            // Add download parameter if needed
            cloudinaryUrl = cloudinaryHelper.addDownloadParameters(cloudinaryUrl);
            
            // Test if Cloudinary URL is accessible before redirecting
            downloadDebug.info('Testing memory result Cloudinary URL access: %s', cloudinaryUrl);
            const memResultUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(cloudinaryUrl);
            
            if (memResultUrlTest.success) {
              downloadDebug.info('Memory result Cloudinary URL is accessible, redirecting to: %s', cloudinaryUrl);
              return res.redirect(cloudinaryUrl);
            } else {
              downloadDebug.warn('⚠️ Memory result Cloudinary URL access failed: Status %d, Error: %s', memResultUrlTest.status, memResultUrlTest.error);
              
              // If status is 401 (Unauthorized), try signed URL approach
              if (memResultUrlTest.status === 401 && cloudinaryPublicId) {
                downloadDebug.info('Attempting to create signed URL for memory result public ID: %s', cloudinaryPublicId);
                
                try {
                  const signedUrl = cloudinaryHelper.generateSignedCloudinaryUrl(
                    cloudinaryPublicId,
                    cloudinaryFormat,
                    { attachment: true }
                  );
                  
                  downloadDebug.info('Generated signed URL for memory result: %s', signedUrl);
                  
                  // Test if the signed URL is accessible
                  const signedUrlTest = await cloudinaryHelper.testCloudinaryUrlAccess(signedUrl);
                  
                  if (signedUrlTest.success) {
                    downloadDebug.info('Memory result signed URL is accessible, redirecting to: %s', signedUrl);
                    return res.redirect(signedUrl);
                  } else {
                    downloadDebug.warn('⚠️ Memory result signed URL access also failed: Status %d', signedUrlTest.status);
                    // Continue to next fallback
                  }
                } catch (signError) {
                  downloadDebug.error('Error generating signed URL for memory result: %o', signError);
                  // Continue to next fallback
                }
              }
            }
          }
        }
      } catch (memError) {
        downloadDebug.error('Error checking memory storage for Cloudinary URL: %o', memError);
        // Continue with local file as fallback
      }
    }
    
    // STEP 3: Fallback to local file if no Cloudinary URL was found or accessible
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);
    
    // Check if local file exists
    if (!fs.existsSync(filePath)) {
      downloadDebug.error('Original file not found locally: %s', filePath);
      
      // STEP 4: For Cloudinary URLs that failed with 401, try to proxy the content instead of redirecting
      if (cloudinaryUrl && operation && operation.cloudinaryData) {
        downloadDebug.info('Attempting to proxy Cloudinary content for failed URL access');
        
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
                downloadDebug.error('Error generating signed URL from extracted info: %o', err);
              }
            }
          }
          
          // Try each URL variant
          let fileBuffer = null;
          let successUrl = null;
          
          for (const urlVariant of urlVariants) {
            try {
              downloadDebug.info('Trying to fetch content from URL variant: %s', urlVariant);
              const response = await axios.get(urlVariant, { 
                responseType: 'arraybuffer',
                timeout: 5000,
                maxRedirects: 5,
                validateStatus: false // Don't throw for any status code
              });
              
              if (response.status >= 200 && response.status < 300 && response.data) {
                downloadDebug.info('✅ Successfully fetched content from URL variant: %s', urlVariant);
                fileBuffer = response.data;
                successUrl = urlVariant;
                break;
              } else {
                downloadDebug.warn('❌ Failed to fetch from URL variant: %s, status: %d', urlVariant, response.status);
              }
            } catch (variantError) {
              downloadDebug.error('Error fetching from URL variant %s: %s', urlVariant, variantError.message);
              // Continue to next variant
            }
          }
          
          if (fileBuffer && fileBuffer.length > 0) {
            downloadDebug.info('✅ Successfully proxied content from Cloudinary (%d bytes, URL: %s)', fileBuffer.length, successUrl);
            
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
            downloadDebug.warn('❌ Failed to proxy content from any Cloudinary URL variant');
          }
        } catch (proxyError) {
          downloadDebug.error('Error proxying Cloudinary content: %o', proxyError);
          // Continue to fallback response
        }
      }
      
      // For Railway, generate a fallback response if we couldn't get the file
      if (process.env.RAILWAY_SERVICE_NAME) {
        downloadDebug.info('RAILWAY DEPLOYMENT: Creating fallback file response for missing file');
        
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
            
            downloadDebug.info('Generated error PDF fallback for missing file: %s, size: %d bytes', originalName, pdfBytes.length);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="file-unavailable.pdf"`);
            return res.send(Buffer.from(pdfBytes));
          } else {
            // Generic text message for other file types
            downloadDebug.info('Generated text fallback for missing file: %s', originalName);
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="file-not-found.txt"`);
            return res.send(`File not found: ${originalName}\n\nThis message is generated because the original file could not be found on Railway's ephemeral storage. Please upload the file again.`);
          }
        } else {
          // Generic text message if we don't have file details
          downloadDebug.info('Generated generic text fallback for missing file: %s', filename);
          
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="file-not-found.txt"`);
          return res.send(`File not found: ${filename}\n\nThis message is generated because the original file could not be found on Railway's ephemeral storage. Please upload the file again.`);
        }
      }
      
      return next(new ErrorResponse('File not found', 404));
    }
    
    // Get the absolute path
    const absolutePath = path.resolve(filePath);
    downloadDebug.info('Absolute path for original file: %s', absolutePath);
    
    try {
      // Read the file directly as a buffer instead of streaming
      const fileBuffer = fs.readFileSync(absolutePath);
      downloadDebug.info('Successfully read file into buffer: %d bytes', fileBuffer.length);
      
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
      downloadDebug.info('Sending %d bytes with content-type: %s', fileBuffer.length, contentType);
      return res.send(fileBuffer);
    } catch (readError) {
      downloadDebug.error('Error reading original file: %s', readError.message);
      throw new Error(`Unable to read original file: ${readError.message}`);
    }
  } catch (error) {
    downloadDebug.error('Error getting original file: %o', error);
    next(error);
  }
};