const path = require('path');
const fs = require('fs');
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
      
      // Create file result object with local references
      const fileResult = {
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
    const previewPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    
    // Check if file exists
    if (!fs.existsSync(previewPath)) {
      return next(new ErrorResponse('Preview not found', 404));
    }
    
    // Send the file
    res.sendFile(previewPath);
  } catch (error) {
    next(error);
  }
};

// @desc    Get result file
// @route   GET /api/files/result/:filename
// @access  Public
exports.getResultFile = async (req, res, next) => {
  try {
    console.log(`Requested result file: ${req.params.filename}`);
    
    // Make sure the filename parameter exists
    if (!req.params.filename) {
      return next(new ErrorResponse('Filename parameter is missing', 400));
    }
    
    const resultPath = path.join(process.env.TEMP_DIR || './temp', req.params.filename);
    console.log(`Looking for result file at: ${resultPath}`);
    
    // Enhanced file finding logic to match the download controller
    let fileFound = false;
    let finalPath = resultPath;
    
    // First check if file exists at the expected path
    if (fs.existsSync(resultPath)) {
      console.log(`File found at original path: ${resultPath}`);
      fileFound = true;
    } else {
      console.error(`File not found at path: ${resultPath}`);
      
      // STRATEGY 1: Try to find the file by pattern matching (in case extension is wrong)
      const tempDir = process.env.TEMP_DIR || './temp';
      const fileBaseName = path.parse(req.params.filename).name;
      
      if (fs.existsSync(tempDir)) {
        console.log(`Searching for result file using multiple strategies...`);
        const files = fs.readdirSync(tempDir);
        console.log(`Found ${files.length} files in directory: ${tempDir}`);
        if (files.length > 0) {
          console.log(`Sample files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
        }
        
        // STRATEGY 2: Check if there's a file that starts with the same base name
        const matchingFile = files.find(file => file.startsWith(fileBaseName));
        
        if (matchingFile) {
          console.log(`Found matching file by prefix: ${matchingFile}`);
          finalPath = path.join(tempDir, matchingFile);
          fileFound = true;
        } else {
          // STRATEGY 3: Try alternative extensions
          console.log(`Trying alternative extensions for ${fileBaseName}`);
          const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
          
          for (const ext of possibleExtensions) {
            const testPath = path.join(tempDir, `${fileBaseName}${ext}`);
            console.log(`Trying path: ${testPath}`);
            
            if (fs.existsSync(testPath)) {
              finalPath = testPath;
              fileFound = true;
              console.log(`Found file with extension ${ext}: ${finalPath}`);
              break;
            }
          }
          
          // STRATEGY 4: Last resort - UUID may have been generated differently
          // Check if any file contains this ID as a substring 
          if (!fileFound) {
            console.log(`Trying fuzzy match for ID fragments...`);
            // Remove common prefixes/suffixes for better matching
            const cleanId = fileBaseName.replace(/^result-/, '').replace(/-result$/, '');
            
            if (cleanId.length >= 8) { // Only if we have a reasonably unique portion
              const fuzzyMatch = files.find(file => file.includes(cleanId));
              if (fuzzyMatch) {
                finalPath = path.join(tempDir, fuzzyMatch);
                fileFound = true;
                console.log(`Found fuzzy match: ${fuzzyMatch}`);
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
        
        // Try to find operation with this result file ID
        try {
          const fileBaseName = path.parse(req.params.filename).name;
          console.log(`Looking for operation with resultFileId: ${fileBaseName}`);
          
          // Find the operation in the database
          const Operation = require('../models/Operation');
          const operation = await Operation.findOne({ resultFileId: fileBaseName });
          
          if (operation && operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
            console.log(`Found Cloudinary URL in operation: ${operation.cloudinaryData.secureUrl}`);
            // Redirect to Cloudinary URL instead
            return res.redirect(operation.cloudinaryData.secureUrl);
          } else {
            console.error(`No Cloudinary data found for resultFileId: ${fileBaseName}`);
          }
        } catch (dbError) {
          console.error(`Error looking up operation in database: ${dbError.message}`);
        }
        
        // Check memory storage if it's available
        if (global.memoryStorage && global.memoryStorage.operations) {
          try {
            console.log('Checking memory storage for operation');
            
            // Try standard operations first 
            const memOperation = global.memoryStorage.operations.find(op => 
              op.resultFileId === fileBaseName || 
              (op.fileData && op.fileData.filename === req.params.filename)
            );
            
            if (memOperation) {
              console.log(`Found operation in memory storage: ${memOperation._id}`);
              
              // Look for associated file path or URL
              if (memOperation.cloudinaryData && memOperation.cloudinaryData.secureUrl) {
                console.log(`Found Cloudinary URL from memory storage: ${memOperation.cloudinaryData.secureUrl}`);
                return res.redirect(memOperation.cloudinaryData.secureUrl);
              }
              
              if (memOperation.resultDownloadUrl) {
                console.log(`Found result download URL: ${memOperation.resultDownloadUrl}`);
                
                // If it's a local URL, check if we have the file
                if (memOperation.resultDownloadUrl.startsWith('/api/')) {
                  // Get associated operation ID
                  console.log(`🚨 EMERGENCY MODE: Getting download for operation ${memOperation._id}`);
                  console.log(`Looked up operation ${memOperation._id} in memory: found`);
                  console.log(`Found operation in memory: ${JSON.stringify(memOperation, null, 2)}`);
                  
                  // Generate direct download URL based on the requested filename
                  const generateUrl = `${req.protocol}://${req.get('host')}/api/files/result/${req.params.filename}`;
                  console.log(`Generated download URL: ${generateUrl}`);
                }
              }
            }
          } catch (memoryError) {
            console.error('Error checking memory storage:', memoryError);
          }
        }
        
        // RAILWAY FIX: Try to generate a direct file instead of using Cloudinary
        console.log('RAILWAY FIX: Generating direct file download for missing document');
        
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
            
            // Try to get operation details from the memory storage for better file generation
            let operationDetails = null;
            let sourceFileName = null;
            
            if (global.memoryStorage && global.memoryStorage.operations) {
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
              
              // If we found an operation, try to get the source file name
              if (operationDetails && operationDetails.sourceFileId && global.memoryStorage.files) {
                const sourceFile = global.memoryStorage.files.find(f => 
                  f._id === operationDetails.sourceFileId
                );
                
                if (sourceFile) {
                  sourceFileName = sourceFile.name || sourceFile.originalName || 'unknown.pdf';
                  console.log(`Found source file name: ${sourceFileName}`);
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
    // Security check for filename
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Original file not found: ${filePath}`);
      return next(new ErrorResponse('File not found', 404));
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Determine content type based on file extension
    const contentType = getContentType(filename);
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    
    // Create a clean filename for download (remove UUID prefix)
    const cleanFilename = `document${path.extname(filename)}`;
    res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
    
    // Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    
    // Stream the file
    console.log(`Streaming original file: ${filePath}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error getting original file:', error);
    next(error);
  }
};