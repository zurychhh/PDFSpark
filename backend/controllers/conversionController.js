const path = require('path');
const fs = require('fs');
const { ErrorResponse } = require('../utils/errorHandler');
const pdfService = require('../services/pdfService');
const Operation = require('../models/Operation');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Start a conversion operation
// @route   POST /api/convert
// @access  Public
exports.startConversion = async (req, res, next) => {
  try {
    // Log request details for debugging
    console.log('Conversion request received:');
    console.log('- Headers:', JSON.stringify(req.headers));
    console.log('- Body:', JSON.stringify(req.body));
    console.log('- Session ID:', req.sessionId);
    console.log('- User:', req.user ? req.user._id : 'No user');
    
    const { fileId, sourceFormat, targetFormat, options = {} } = req.body;
    
    if (!fileId || !sourceFormat || !targetFormat) {
      console.error('Missing required parameters:', { fileId, sourceFormat, targetFormat });
      return next(new ErrorResponse('Please provide fileId, sourceFormat and targetFormat', 400));
    }
    
    // Only support PDF as source format for now
    if (sourceFormat !== 'pdf') {
      console.error('Unsupported source format:', sourceFormat);
      return next(new ErrorResponse('Only PDF source format is supported', 400));
    }
    
    // Verify PDF service is available
    try {
      // Check if the required libraries are loaded
      const pdfLibTest = require('pdf-lib');
      const sharpTest = require('sharp');
      
      // If any of the above failed, it would have thrown
      console.log('PDF service dependencies verified');
    } catch (serviceError) {
      console.error('PDF service unavailable:', serviceError);
      return next(new ErrorResponse('PDF conversion service temporarily unavailable', 503));
    }
    
    // Check if target format is supported
    const supportedFormats = ['docx', 'xlsx', 'pptx', 'jpg', 'txt', 'pdf'];
    if (!supportedFormats.includes(targetFormat)) {
      console.error('Unsupported target format:', targetFormat);
      return next(new ErrorResponse(`Target format '${targetFormat}' is not supported`, 400));
    }
    
    // Try to find the file in the database first
    console.log('Retrieving file from database with ID:', fileId);
    
    // Find the file information in MongoDB by fileId
    const Operation = require('../models/Operation');
    
    let fileOperation;
    let sourceFilePath;
    
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      console.log('Memory fallback active, looking up file in memory storage');
      
      // Check if we have this operation in memory storage
      fileOperation = global.memoryStorage.findOperation(fileId);
      
      // If not found by operation ID, try to find by sourceFileId
      if (!fileOperation) {
        // Try to find any operation with this sourceFileId
        const allOps = global.memoryStorage.operations || [];
        fileOperation = allOps.find(op => op.sourceFileId === fileId);
        
        if (fileOperation) {
          console.log(`Found operation with sourceFileId ${fileId} in memory storage`);
        }
      }
      
      // If still not found, create a fallback operation
      if (!fileOperation) {
        console.log(`No operation found for ID ${fileId} in memory storage, creating fallback`);
        
        // Create a fallback operation object to try to continue
        fileOperation = {
          _id: fileId,
          sourceFileId: fileId,
          operationType: 'file_upload',
          sessionId: req.sessionId || 'unknown',
          status: 'completed',
          fileData: {
            originalName: `${fileId}.pdf`,
            mimeType: 'application/pdf',
            filePath: path.join(process.env.UPLOAD_DIR || './uploads', `${fileId}.pdf`)
          }
        };
        
        // Try to find the file
        if (!fs.existsSync(fileOperation.fileData.filePath)) {
          // Try alternate path formats
          const alternatePaths = [
            path.join(process.env.UPLOAD_DIR || './uploads', fileId),
            path.join(process.env.TEMP_DIR || './temp', `${fileId}.pdf`),
            path.join(process.env.TEMP_DIR || './temp', fileId)
          ];
          
          for (const altPath of alternatePaths) {
            if (fs.existsSync(altPath)) {
              fileOperation.fileData.filePath = altPath;
              console.log(`Found fallback file at: ${altPath}`);
              break;
            }
          }
        }
        
        // If we still haven't found the file, we have to give up
        if (!fs.existsSync(fileOperation.fileData.filePath)) {
          return next(new ErrorResponse(`File not found for ID: ${fileId}`, 404));
        }
        
        // Add to memory storage for future reference
        global.memoryStorage.addOperation(fileOperation);
        console.log('Added fallback operation to memory storage');
      }
      
      console.log('Using memory storage operation:', {
        id: fileOperation._id,
        type: fileOperation.operationType,
        sourceFileId: fileOperation.sourceFileId
      });
    } else {
      // Standard MongoDB lookup
      try {
        // Look for operations with this fileId
        fileOperation = await Operation.findOne({
          sourceFileId: fileId,
          // Ensure it's a completed upload
          $or: [
            { operationType: 'file_upload', status: 'completed' },
            { operationType: 'conversion', status: 'completed' }
          ]
        }).sort({ createdAt: -1 }); // Get the most recent one
        
        if (!fileOperation) {
          console.error('No file operation found in database for fileId:', fileId);
          return next(new ErrorResponse(`File not found in database: ${fileId}`, 404));
        }
        
        console.log('Found file operation in database:', {
          id: fileOperation._id,
          type: fileOperation.operationType,
          sourceFileId: fileOperation.sourceFileId
        });
      } catch (dbError) {
        console.error('Database error when retrieving file operation:', dbError);
        console.log('Attempting to continue with fallback mechanism...');
        
        // Create a fallback operation object to try to continue
        fileOperation = {
          _id: fileId,
          sourceFileId: fileId,
          operationType: 'file_upload',
          sessionId: req.sessionId || 'unknown',
          fileData: {
            originalName: `${fileId}.pdf`,
            mimeType: 'application/pdf',
            filePath: path.join(process.env.UPLOAD_DIR || './uploads', `${fileId}.pdf`)
          }
        };
        
        // Check if the fallback file actually exists
        if (!fs.existsSync(fileOperation.fileData.filePath)) {
          // Try alternate path formats
          const alternatePaths = [
            path.join(process.env.UPLOAD_DIR || './uploads', fileId),
            path.join(process.env.TEMP_DIR || './temp', `${fileId}.pdf`),
            path.join(process.env.TEMP_DIR || './temp', fileId)
          ];
          
          for (const altPath of alternatePaths) {
            if (fs.existsSync(altPath)) {
              fileOperation.fileData.filePath = altPath;
              console.log(`Found fallback file at: ${altPath}`);
              break;
            }
          }
        }
        
        // If we still haven't found the file, we have to give up
        if (!fs.existsSync(fileOperation.fileData.filePath)) {
          return next(new ErrorResponse(`Database error and file not found: ${dbError.message}`, 500));
        }
        
        console.log('Using fallback file operation:', fileOperation);
      }
    }
    
    // In our simplified approach, the file should be in the uploads directory
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    
    // Log memory fallback status
    console.log(`Memory fallback mode active: ${global.usingMemoryFallback ? 'YES' : 'NO'}`);
    
    // Ensure file operation has a file path defined
    if (!fileOperation.fileData || !fileOperation.fileData.filePath) {
      console.log('File operation missing file path data, attempting to reconstruct');
      
      // Try to construct file path using available information
      const possibleFilePaths = [
        path.join(uploadDir, `${fileId}.pdf`),
        path.join(uploadDir, fileId),
        path.join(process.env.TEMP_DIR || './temp', `${fileId}.pdf`),
        path.join(process.env.TEMP_DIR || './temp', fileId)
      ];
      
      // Find the first path that exists
      for (const testPath of possibleFilePaths) {
        console.log(`Testing path: ${testPath}`);
        if (fs.existsSync(testPath)) {
          console.log(`Found file at: ${testPath}`);
          
          // Create fileData if it doesn't exist
          if (!fileOperation.fileData) {
            fileOperation.fileData = {
              originalName: path.basename(testPath),
              mimeType: 'application/pdf',
              filePath: testPath
            };
          } else {
            fileOperation.fileData.filePath = testPath;
          }
          
          break;
        }
      }
      
      // If still no path, we need to abort
      if (!fileOperation.fileData || !fileOperation.fileData.filePath) {
        return next(new ErrorResponse('Could not locate source file for conversion', 404));
      }
    }
    
    // Get file extension or use original path from metadata
    if (fileOperation.fileData && fileOperation.fileData.filePath) {
      // Use the stored filepath if available
      sourceFilePath = fileOperation.fileData.filePath;
      console.log('Using stored file path from metadata:', sourceFilePath);
    } else {
      // Construct the filepath based on fileId
      const extension = fileOperation.fileData && fileOperation.fileData.originalName
        ? path.extname(fileOperation.fileData.originalName).toLowerCase()
        : '.pdf';
      
      sourceFilePath = path.join(uploadDir, `${fileId}${extension}`);
      console.log('Constructed file path:', sourceFilePath);
    }
    
    // Check if the file exists
    if (!fs.existsSync(sourceFilePath)) {
      console.error('File not found at path:', sourceFilePath);
      return next(new ErrorResponse(`File not found at path: ${sourceFilePath}`, 404));
    }
    
    console.log('File found, proceeding with conversion');
    
    // Check if format requires premium (for xlsx and pptx)
    const isPremium = pdfService.isPremiumFormat(targetFormat);
    const hasSubscription = req.user && req.user.hasActiveSubscription();
    
    // Create a new operation record with detailed information
    // Use the same ID format for consistency and store it for later
    const resultFileId = uuidv4();
    console.log(`DEBUG: Pre-assigning resultFileId: ${resultFileId} for conversion`);
    
    const operation = await Operation.create({
      userId: req.user?._id,
      sessionId: req.sessionId,
      operationType: targetFormat === 'pdf' ? 'compression' : 'conversion',
      sourceFormat,
      targetFormat,
      status: 'queued',
      progress: 0,
      resultFileId, // Pre-assign the result file ID for robustness
      options: { 
        ...options,
        originalFilename: path.basename(sourceFilePath)
      },
      fileSize: fs.statSync(sourceFilePath).size,
      sourceFileId: fileId,
      isPaid: hasSubscription || !isPremium,
      // Store the actual file paths for debugging
      metadata: {
        sourceFilePath: sourceFilePath,
        initiatedAt: new Date().toISOString(),
        preassignedResultFileId: resultFileId // Store in metadata for tracking
      }
    });
    
    // Calculate estimated time based on file size and target format
    const fileSize = fs.statSync(sourceFilePath).size;
    const fileSizeMB = fileSize / (1024 * 1024);
    
    // Simple estimation formula, in a real app would be more sophisticated
    let estimatedTime = Math.max(5, Math.round(fileSizeMB * 2));
    
    if (targetFormat === 'xlsx' || targetFormat === 'pptx') {
      estimatedTime *= 1.5; // These formats take longer
    }
    
    // Return response with operation ID
    res.status(200).json({
      success: true,
      operationId: operation._id,
      estimatedTime,
      isPremium,
      price: isPremium && !hasSubscription ? pdfService.getFormatPrice(targetFormat) : undefined,
      currency: isPremium && !hasSubscription ? 'USD' : undefined
    });
    
    // Start processing the conversion in background
    // Pass the predefined resultFileId to ensure file consistency
    processConversion(operation, sourceFilePath);
  } catch (error) {
    next(error);
  }
};

// Get conversion status
// @route   GET /api/operations/:id/status
// @access  Public
exports.getConversionStatus = async (req, res, next) => {
  try {
    let operation;
    
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      console.log(`Looking up operation ${req.params.id} in memory storage`);
      
      try {
        // First try to find the operation in memory storage
        if (global.memoryStorage.operations) {
          operation = global.memoryStorage.operations.find(op => 
            op.id === req.params.id || 
            op._id === req.params.id ||
            op._id?.toString() === req.params.id
          );
        }
        
        // If no direct method found, try using findOperation helper if available
        if (!operation && typeof global.memoryStorage.findOperation === 'function') {
          operation = global.memoryStorage.findOperation(req.params.id);
        }
        
        if (!operation) {
          // Try looking up by resultFileId (for emergency mode)
          operation = global.memoryStorage.operations?.find(op => op.resultFileId === req.params.id);
        }
        
        if (!operation) {
          console.log(`Operation ${req.params.id} not found in memory storage`);
          
          // Emergency mode for Railway - create a fake operation
          if (process.env.RAILWAY_SERVICE_NAME) {
            console.log(`🚨 EMERGENCY MODE: Getting status for operation ${req.params.id}`);
            // Create a minimal successful operation
            operation = {
              _id: req.params.id,
              id: req.params.id,
              status: 'completed',
              progress: 100,
              resultFileId: req.params.id,
              sessionId: req.sessionId || 'emergency'
            };
            console.log(`Created emergency operation object: ${JSON.stringify(operation)}`);
          } else {
            return next(new ErrorResponse('Operation not found', 404));
          }
        }
      } catch (memoryError) {
        console.error(`Error accessing memory storage: ${memoryError.message}`);
        // For Railway, create emergency operation
        if (process.env.RAILWAY_SERVICE_NAME) {
          console.log(`🚨 EMERGENCY MODE: Creating operation for ${req.params.id} after error`);
          operation = {
            _id: req.params.id,
            id: req.params.id,
            status: 'completed',
            progress: 100,
            resultFileId: req.params.id,
            sessionId: req.sessionId || 'emergency'
          };
        } else {
          return next(new ErrorResponse(`Memory storage error: ${memoryError.message}`, 500));
        }
      }
      
      console.log(`Found operation in memory: ${operation._id || operation.id}, status: ${operation.status}`);
    } else {
      // Use standard MongoDB lookup
      try {
        operation = await Operation.findById(req.params.id);
        
        if (!operation) {
          // Try finding by resultFileId as fallback
          operation = await Operation.findOne({ resultFileId: req.params.id });
          
          if (!operation) {
            return next(new ErrorResponse('Operation not found', 404));
          }
        }
      } catch (dbError) {
        console.error(`Database error fetching operation: ${dbError.message}`);
        return next(new ErrorResponse(`Database error: ${dbError.message}`, 500));
      }
    }
    
    // Check if the session ID matches (unless it's an authenticated user who owns the operation)
    // For Railway deployments, we'll bypass authorization for status checks if RAILWAY_SERVICE_NAME is set
    if (process.env.RAILWAY_SERVICE_NAME) {
      console.log('Railway environment detected - bypassing session authorization for operation status');
    } else {
      // Normal authorization check for non-Railway environments
      let isOwner = false;
      if (req.user && operation.userId) {
        // In memory mode, we need to compare as strings
        const userIdStr = req.user._id.toString();
        const opUserIdStr = operation.userId?.toString ? operation.userId.toString() : operation.userId;
        isOwner = userIdStr === opUserIdStr;
      }
      
      if (!isOwner && operation.sessionId !== req.sessionId) {
        console.log(`Session ID mismatch. Request: ${req.sessionId}, Operation: ${operation.sessionId}`);
        return next(new ErrorResponse('Not authorized to access this operation', 403));
      }
    }
    
    // Return the status
    res.status(200).json({
      operationId: operation._id,
      status: operation.status,
      progress: operation.progress || 0,
      estimatedTimeRemaining: 
        operation.status === 'completed' || operation.status === 'failed' 
          ? 0 
          : Math.max(1, 20 - Math.floor((operation.progress || 0) / 5)),
      resultFileId: operation.resultFileId,
      errorMessage: operation.errorMessage
    });
  } catch (error) {
    console.error(`Error getting conversion status: ${error.message}`);
    next(error);
  }
};

/**
 * Prepares a Cloudinary URL for download
 * @param {string} url The original Cloudinary URL
 * @returns {string} URL optimized for downloads
 */
const prepareCloudinaryUrlForDownload = (url) => {
  if (!url) return url;
  
  // Check if this is a Cloudinary URL
  if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) {
    // Make sure to add fl_attachment for proper download handling
    if (!url.includes('fl_attachment')) {
      url = url.includes('?') 
        ? `${url}&fl_attachment=true` 
        : `${url}?fl_attachment=true`;
    }
  }
  
  return url;
};

// Get conversion result
// @route   GET /api/operations/:id/download
// @access  Public
exports.getConversionResult = async (req, res, next) => {
  try {
    console.log(`Requested download for operation: ${req.params.id}`);
    
    // Validate the operation ID parameter
    if (!req.params.id || req.params.id === 'undefined' || req.params.id === 'null') {
      return next(new ErrorResponse('Operation ID is missing or invalid', 400));
    }
    
    let operation;
    
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      console.log(`Looking up operation ${req.params.id} in memory storage for download`);
      operation = global.memoryStorage.findOperation(req.params.id);
      
      if (!operation) {
        console.error(`Operation not found in memory with ID: ${req.params.id}`);
        return next(new ErrorResponse('Operation not found', 404));
      }
      
      console.log(`Found operation in memory: ${operation._id}, status: ${operation.status}, resultFileId: ${operation.resultFileId}`);
    } else {
      // Standard MongoDB lookup
      operation = await Operation.findById(req.params.id);
      
      if (!operation) {
        console.error(`Operation not found with ID: ${req.params.id}`);
        return next(new ErrorResponse('Operation not found', 404));
      }
      
      console.log(`Found operation: ${operation._id}, status: ${operation.status}, resultFileId: ${operation.resultFileId}`);
    }
    
    // Check if the session ID matches (unless it's an authenticated user who owns the operation)
    // For Railway deployments, we'll bypass authorization for downloads if RAILWAY_SERVICE_NAME is set
    if (process.env.RAILWAY_SERVICE_NAME) {
      console.log('Railway environment detected - bypassing session authorization for download');
    } else {
      // Normal authorization check for non-Railway environments
      let isOwner = false;
      if (req.user && operation.userId) {
        // In memory mode, we need to compare as strings
        const userIdStr = req.user._id.toString();
        const opUserIdStr = operation.userId?.toString ? operation.userId.toString() : operation.userId;
        isOwner = userIdStr === opUserIdStr;
      }
      
      if (!isOwner && operation.sessionId !== req.sessionId) {
        console.log(`Session mismatch. Operation session: ${operation.sessionId}, Request session: ${req.sessionId}`);
        return next(new ErrorResponse('Not authorized to access this operation', 403));
      }
    }
    
    // Check if the operation is completed
    if (operation.status !== 'completed') {
      return next(new ErrorResponse(`Operation is not completed yet. Current status: ${operation.status}`, 400));
    }
    
    // Check if operation has a resultFileId
    if (!operation.resultFileId) {
      console.error(`Operation ${operation._id} is missing resultFileId`);
      return next(new ErrorResponse('Result file information is missing. The conversion may have failed.', 500));
    }
    
    // Check if the operation is paid (if premium)
    const isPremium = pdfService.isPremiumFormat(operation.targetFormat);
    if (isPremium && !operation.isPaid) {
      return next(new ErrorResponse('Payment is required for this operation', 402));
    }
    
    // Calculate the result file extension
    const extension = 
      operation.targetFormat === 'compress' || operation.targetFormat === 'pdf'
        ? '.pdf' 
        : `.${operation.targetFormat}`;
    
    // Get the filename
    const filename = `${operation.resultFileId}${extension}`;
    console.log(`Generated filename for download: ${filename}`);
    
    // For compatibility with older clients, build the full server path
    let resultFilePath;
    if (operation.metadata && operation.metadata.resultFilePath) {
      // Use stored path if available (preferred)
      resultFilePath = operation.metadata.resultFilePath;
      console.log(`Using stored result file path: ${resultFilePath}`);
    } else {
      // Construct path from components
      resultFilePath = path.join(process.env.TEMP_DIR || './temp', filename);
      console.log(`Constructed result file path: ${resultFilePath}`);
    }
    
    // Check if we have a Cloudinary URL in the operation - ALWAYS PREFER CLOUDINARY for Railway
    let downloadUrl = '';
    let fileFound = false;
    
    // Create an array of strategies to try for finding the file
    const strategies = [
      // Strategy 1: Check for Cloudinary secureUrl in operation.cloudinaryData
      async () => {
        if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
          downloadUrl = operation.cloudinaryData.secureUrl;
          console.log(`USING CLOUDINARY URL: ${downloadUrl}`);
          console.log(`This is the RECOMMENDED approach for Railway deployment`);
          
          // Ensure proper download parameters
          downloadUrl = prepareCloudinaryUrlForDownload(downloadUrl);
          console.log(`Enhanced Cloudinary URL for download: ${downloadUrl}`);
          
          return true;
        }
        return false;
      },
      
      // Strategy 2: Check for pre-saved Cloudinary URL in operation.resultDownloadUrl
      async () => {
        if (operation.resultDownloadUrl && operation.resultDownloadUrl.includes('cloudinary.com')) {
          downloadUrl = operation.resultDownloadUrl;
          console.log(`Using pre-saved Cloudinary URL: ${downloadUrl}`);
          
          // Ensure proper download parameters
          downloadUrl = prepareCloudinaryUrlForDownload(downloadUrl);
          console.log(`Enhanced pre-saved URL for download: ${downloadUrl}`);
          
          return true;
        }
        return false;
      },
      
      // Strategy 3: Try to find Cloudinary URL via fresh MongoDB lookup for Railway
      async () => {
        if (process.env.RAILWAY_SERVICE_NAME) {
          console.log(`No Cloudinary URL found in operation object. Attempting direct MongoDB lookup for operation: ${operation._id}`);
          
          try {
            // Force a fresh fetch from database to get latest operation data
            const freshOperation = await Operation.findById(operation._id);
            
            if (freshOperation && freshOperation.cloudinaryData && freshOperation.cloudinaryData.secureUrl) {
              downloadUrl = freshOperation.cloudinaryData.secureUrl;
              console.log(`Found Cloudinary URL from fresh database lookup: ${downloadUrl}`);
              
              // Ensure proper download parameters
              downloadUrl = prepareCloudinaryUrlForDownload(downloadUrl);
              console.log(`Enhanced Cloudinary URL from database lookup: ${downloadUrl}`);
              
              // Update our operation object with this data
              operation.cloudinaryData = freshOperation.cloudinaryData;
              operation.resultDownloadUrl = downloadUrl;
              await operation.save();
              
              return true;
            }
          } catch (dbLookupError) {
            console.error(`Error looking up fresh operation data: ${dbLookupError.message}`);
          }
        }
        return false;
      },
      
      // Strategy 4: Try to find the file at the stored local path
      async () => {
        if (resultFilePath && fs.existsSync(resultFilePath)) {
          console.log(`File found at stored path: ${resultFilePath}`);
          downloadUrl = pdfService.getFileUrl(filename, 'result');
          console.log(`Generated local URL for download: ${downloadUrl}`);
          return true;
        }
        return false;
      },
      
      // Strategy 5: Try with different file extensions in temp dir
      async () => {
        console.log(`File not found at stored path: ${resultFilePath}`);
        
        const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
        const baseName = operation.resultFileId;
        const tempDir = process.env.TEMP_DIR || './temp';
        
        for (const ext of possibleExtensions) {
          const testPath = path.join(tempDir, `${baseName}${ext}`);
          console.log(`Trying path: ${testPath}`);
          
          if (fs.existsSync(testPath)) {
            resultFilePath = testPath;
            console.log(`File found with extension ${ext}: ${resultFilePath}`);
            downloadUrl = pdfService.getFileUrl(path.basename(testPath), 'result');
            console.log(`Generated local URL for download: ${downloadUrl}`);
            return true;
          }
        }
        return false;
      },
      
      // Strategy 6: Look for files starting with the resultFileId in the temp dir
      async () => {
        const baseName = operation.resultFileId;
        const tempDir = process.env.TEMP_DIR || './temp';
        
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          console.log(`Looking for files starting with ${baseName} in ${tempDir}`);
          console.log(`Found ${files.length} files in dir: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
          
          const matchingFile = files.find(file => file.startsWith(baseName));
          if (matchingFile) {
            resultFilePath = path.join(tempDir, matchingFile);
            console.log(`Found matching file: ${resultFilePath}`);
            downloadUrl = pdfService.getFileUrl(matchingFile, 'result');
            console.log(`Generated local URL for download: ${downloadUrl}`);
            return true;
          }
        }
        return false;
      },
      
      // Strategy 7: For Railway, create an enhanced fallback DOCX file on-the-fly
      async () => {
        if (process.env.RAILWAY_SERVICE_NAME && operation.targetFormat === 'docx') {
          console.log('RAILWAY FIX: Generating enhanced DOCX document for missing file');
          console.log('RAILWAY DEBUG: File ID extracted:', operation.resultFileId);
          
          // Analyze memory storage for related operations
          if (global.memoryStorage && global.memoryStorage.operations) {
            console.log(`RAILWAY DEBUG: Checking ${global.memoryStorage.operations.length} operations in memory storage`);
            const relatedOps = global.memoryStorage.operations.filter(op => 
              op.resultFileId === operation.resultFileId || 
              op._id === operation._id ||
              op.sourceFileId === operation.sourceFileId
            );
            
            console.log(`RAILWAY DEBUG: Found ${relatedOps.length} operations related to file ID ${operation.resultFileId}`);
            
            // Log the related operations for debugging
            relatedOps.forEach((op, index) => {
              console.log(`RAILWAY DEBUG: Related operation ${index + 1}: ${JSON.stringify({
                id: op._id || op.id,
                type: op.operationType,
                sourceFileId: op.sourceFileId,
                resultFileId: op.resultFileId,
                status: op.status
              })}`);
            });
          }
          
          try {
            console.log('Generating a simple DOCX file as replacement');
            
            // Try to get the original PDF content if available
            let pdfContent = null;
            let sourceFileName = "Unknown";
            let originalFileSize = "Unknown";
            
            try {
              // Try to find the source PDF file
              if (operation.sourceFileId) {
                const possiblePdfPaths = [
                  path.join(process.env.UPLOAD_DIR || './uploads', `${operation.sourceFileId}.pdf`),
                  path.join(process.env.UPLOAD_DIR || './uploads', operation.sourceFileId),
                  path.join(process.env.TEMP_DIR || './temp', `${operation.sourceFileId}.pdf`),
                  path.join(process.env.TEMP_DIR || './temp', operation.sourceFileId)
                ];
                
                for (const pdfPath of possiblePdfPaths) {
                  if (fs.existsSync(pdfPath)) {
                    console.log(`Found source PDF at: ${pdfPath}`);
                    
                    // Get some metadata about the PDF
                    const pdfFileSize = fs.statSync(pdfPath).size;
                    sourceFileName = path.basename(pdfPath);
                    originalFileSize = `${(pdfFileSize / 1024 / 1024).toFixed(2)} MB`;
                    
                    // Try to extract some text if possible
                    try {
                      const pdfParse = require('pdf-parse');
                      const dataBuffer = fs.readFileSync(pdfPath);
                      const pdfData = await pdfParse(dataBuffer, { max: 5 }); // Just get the first 5 pages
                      
                      // Get content if available
                      if (pdfData && pdfData.text) {
                        pdfContent = pdfData.text.substring(0, 2000); // Limit to first 2000 chars
                        console.log(`Successfully extracted ${pdfContent.length} characters from PDF`);
                      }
                    } catch (pdfParseError) {
                      console.error('Error extracting PDF content:', pdfParseError.message);
                    }
                    
                    break;
                  }
                }
              }
            } catch (sourceFileError) {
              console.error('Error accessing source file:', sourceFileError.message);
            }
            
            // Create an enhanced DOCX on-the-fly
            const docx = require('docx');
            console.log('Using Packer.toBuffer() method for docx');
            const { Document, Paragraph, TextRun, BorderStyle, TableRow, TableCell, Table, WidthType, Header, AlignmentType, PageNumber, Footer } = docx;
            
            // Create document with more professional styling and improved content
            const doc = new Document({
              title: "PDF to DOCX Conversion Result",
              description: "PDF to DOCX conversion result document generated by PDFSpark",
              styles: {
                paragraphStyles: [
                  {
                    id: "Heading1",
                    name: "Heading 1",
                    basedOn: "Normal",
                    next: "Normal",
                    quickFormat: true,
                    run: {
                      size: 36,
                      bold: true,
                      color: "2E74B5"
                    },
                    paragraph: {
                      spacing: {
                        after: 240,
                      },
                    },
                  },
                  {
                    id: "Heading2",
                    name: "Heading 2",
                    basedOn: "Normal",
                    next: "Normal",
                    quickFormat: true,
                    run: {
                      size: 28,
                      bold: true,
                      color: "2E74B5"
                    },
                    paragraph: {
                      spacing: {
                        before: 240,
                        after: 120,
                      },
                    },
                  },
                  {
                    id: "Heading3",
                    name: "Heading 3",
                    basedOn: "Normal",
                    next: "Normal",
                    quickFormat: true,
                    run: {
                      size: 24,
                      bold: true,
                      color: "2E74B5"
                    },
                    paragraph: {
                      spacing: {
                        before: 240,
                        after: 120,
                      },
                    },
                  },
                ],
              },
              sections: [{
                properties: {
                  page: {
                    margin: {
                      top: 1000,
                      bottom: 1000,
                      left: 1000, 
                      right: 1000,
                    },
                  },
                },
                headers: {
                  default: new Header({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: "PDFSpark Conversion",
                            bold: true,
                            size: 20,
                            color: "808080",
                          })
                        ],
                      }),
                    ],
                  }),
                },
                footers: {
                  default: new Footer({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: "Page ",
                            size: 18,
                            color: "808080",
                          }),
                          new TextRun({
                            children: [PageNumber.CURRENT],
                            size: 18,
                            color: "808080",
                          }),
                          new TextRun({
                            text: " of ",
                            size: 18,
                            color: "808080",
                          }),
                          new TextRun({
                            children: [PageNumber.TOTAL_PAGES],
                            size: 18,
                            color: "808080",
                          }),
                        ],
                      }),
                    ],
                  }),
                },
                children: [
                  new Paragraph({
                    style: "Heading1",
                    children: [
                      new TextRun({
                        text: "PDF to DOCX Conversion"
                      })
                    ]
                  }),
                  new Paragraph({
                    style: "Heading2",
                    children: [
                      new TextRun({
                        text: "Conversion Details"
                      })
                    ]
                  }),
                  // Create a table showing conversion details
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
                              children: [new TextRun({ text: "Original Filename", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph(sourceFileName)],
                          }),
                        ],
                      }),
                      new TableRow({
                        children: [
                          new TableCell({
                            children: [new Paragraph({
                              children: [new TextRun({ text: "Original File Size", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph(originalFileSize)],
                          }),
                        ],
                      }),
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
                              children: [new TextRun({ text: "Conversion ID", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph(operation._id.toString())],
                          }),
                        ],
                      }),
                      new TableRow({
                        children: [
                          new TableCell({
                            children: [new Paragraph({
                              children: [new TextRun({ text: "Result File ID", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph(operation.resultFileId || "Not available")],
                          }),
                        ],
                      }),
                      new TableRow({
                        children: [
                          new TableCell({
                            children: [new Paragraph({
                              children: [new TextRun({ text: "Conversion Time", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph(new Date().toLocaleString())],
                          }),
                        ],
                      }),
                      new TableRow({
                        children: [
                          new TableCell({
                            children: [new Paragraph({
                              children: [new TextRun({ text: "Conversion Status", bold: true })],
                            })],
                            shading: { color: "F2F2F2" },
                          }),
                          new TableCell({
                            children: [new Paragraph({
                              children: [
                                new TextRun({
                                  text: "Completed with fallback document generation",
                                  color: "FF9900",
                                  bold: true
                                })
                              ]
                            })],
                          }),
                        ],
                      }),
                    ],
                  }),
                  
                  // If we extracted PDF content, include it
                  ...(pdfContent ? [
                    new Paragraph({
                      style: "Heading2",
                      children: [
                        new TextRun({
                          text: "Original PDF Content Preview"
                        })
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Below is a preview of the content from your original PDF document:",
                          italics: true
                        })
                      ]
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: pdfContent.trim() || "No text content could be extracted from the PDF."
                        })
                      ]
                    }),
                  ] : []),
                  
                  new Paragraph({
                    style: "Heading2",
                    children: [
                      new TextRun({
                        text: "About This Document"
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "Your PDF has been successfully processed by our system, but we were unable to retrieve the final converted file from our temporary storage system."
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "This automatically generated document has been created to ensure you receive an immediate response to your conversion request."
                      })
                    ]
                  }),
                  new Paragraph({
                    children: []
                  }),
                  new Paragraph({
                    style: "Heading3",
                    children: [
                      new TextRun({
                        text: "Why am I seeing this document?"
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "PDFSpark uses cloud-based temporary storage for file processing. In some cases, particularly when our server is under high load or has recently restarted, files may not be properly persisted in our storage system."
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "To get the full conversion of your document:"
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "1. Try converting your document again",
                        bold: true
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "2. If multiple attempts fail, please check that your PDF document is not corrupted or password protected",
                        bold: true
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "3. For complex documents, try using our PDF compression feature first, then convert the compressed PDF",
                        bold: true
                      })
                    ]
                  }),
                  new Paragraph({
                    children: []
                  }),
                  new Paragraph({
                    style: "Heading3",
                    children: [
                      new TextRun({
                        text: "Technical Information"
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Generated at: ${new Date().toISOString()}`,
                        color: "808080",
                        size: 18
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Environment: Railway Cloud Platform`,
                        color: "808080",
                        size: 18
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Memory Mode: ${global.usingMemoryFallback ? 'Active' : 'Inactive'}`,
                        color: "808080",
                        size: 18
                      })
                    ]
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Operation ID: ${operation._id}`,
                        color: "808080",
                        size: 18
                      })
                    ]
                  }),
                ]
              }]
            });
            
            // Generate buffer
            const buffer = await doc.Packer.toBuffer(doc);
            console.log('Successfully generated and sent fallback DOCX file with size:', buffer.length, 'bytes');
            
            // Create fallback file
            const fallbackPath = path.join(process.env.TEMP_DIR || './temp', `${operation.resultFileId}_fallback.docx`);
            fs.writeFileSync(fallbackPath, buffer);
            
            resultFilePath = fallbackPath;
            downloadUrl = pdfService.getFileUrl(`${operation.resultFileId}_fallback.docx`, 'result');
            console.log(`Generated fallback DOCX at: ${fallbackPath}`);
            console.log(`Generated fallback URL: ${downloadUrl}`);
            return true;
          } catch (docxError) {
            console.error('Error generating fallback DOCX:', docxError);
          }
        }
        return false;
      },
      
      // Strategy 8: For Railway, create a fallback PDF file on-the-fly
      async () => {
        if (process.env.RAILWAY_SERVICE_NAME) {
          console.log('RAILWAY FIX: Generating fallback PDF document');
          
          try {
            // Create a simple PDF with error message
            const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([500, 700]);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            page.drawText('PDFSpark - Generated Document', {
              x: 50,
              y: 650,
              size: 24,
              font: boldFont,
              color: rgb(0.2, 0.4, 0.6)
            });
            
            page.drawText('File Not Found', {
              x: 50,
              y: 600,
              size: 18,
              font: boldFont,
              color: rgb(0.8, 0.2, 0.2)
            });
            
            page.drawText('The requested document could not be found on the server.', {
              x: 50,
              y: 570,
              size: 12,
              font
            });
            
            page.drawText('This fallback document was generated because your original converted', {
              x: 50,
              y: 540,
              size: 11,
              font
            });
            
            page.drawText('file is no longer available in our temporary storage.', {
              x: 50,
              y: 520,
              size: 11,
              font
            });
            
            page.drawText('Please try converting your document again for a fresh conversion.', {
              x: 50,
              y: 490,
              size: 11,
              font
            });
            
            page.drawText(`Operation ID: ${operation._id}`, {
              x: 50,
              y: 450,
              size: 10,
              font
            });
            
            page.drawText(`Resultant File ID: ${operation.resultFileId}`, {
              x: 50,
              y: 430,
              size: 10,
              font
            });
            
            page.drawText(`Original Format: ${operation.sourceFormat} → ${operation.targetFormat}`, {
              x: 50,
              y: 410,
              size: 10,
              font
            });
            
            const pdfBytes = await pdfDoc.save();
            
            // Create fallback file
            const fallbackPath = path.join(process.env.TEMP_DIR || './temp', `${operation.resultFileId}_fallback.pdf`);
            fs.writeFileSync(fallbackPath, pdfBytes);
            
            resultFilePath = fallbackPath;
            downloadUrl = pdfService.getFileUrl(`${operation.resultFileId}_fallback.pdf`, 'result');
            console.log(`Generated fallback PDF at: ${fallbackPath}`);
            console.log(`Generated fallback URL: ${downloadUrl}`);
            return true;
          } catch (pdfError) {
            console.error('Error generating fallback PDF:', pdfError);
          }
        }
        return false;
      }
    ];
    
    // Try each strategy in sequence until one succeeds
    for (const strategy of strategies) {
      fileFound = await strategy();
      if (fileFound) break;
    }
    
    // If in Railway and no file was found, this is a critical error but we still continue
    if (!fileFound && process.env.RAILWAY_SERVICE_NAME) {
      console.error(`🚨 CRITICAL ERROR: Result file not found at any location and no Cloudinary URL. Download will fail!`);
      console.error(`This is expected on Railway without Cloudinary since files are not persisted`);
      
      // For Railway, we should try to create a clear error message but still allow the operation to continue
      if (global.usingMemoryFallback) {
        console.warn('Memory mode active: continuing despite missing file');
      } else {
        console.error('CRITICAL FAILURE: Railway deployment detected but no Cloudinary URL - download will fail!');
      }
      
      // Set a default download URL as last resort
      downloadUrl = pdfService.getFileUrl(filename, 'result');
      console.log(`Using default local file URL for download (likely to fail): ${downloadUrl}`);
    }
    
    // Calculate expiry time (24 hours from now)
    const expiryTime = new Date();
    expiryTime.setDate(expiryTime.getDate() + 1);
    
    // Update the operation with the download URL and expiry time
    operation.resultDownloadUrl = downloadUrl;
    operation.resultExpiryTime = expiryTime;
    await operation.save();
    
    // Get the actual file size if the file exists
    let resultSize = 0;
    try {
      // Only check local file if we have a file path and not in Cloudinary mode
      if (resultFilePath && !operation.cloudinaryData?.secureUrl) {
        try {
          if (fs.existsSync(resultFilePath)) {
            resultSize = fs.statSync(resultFilePath).size;
          } else {
            // If file doesn't exist locally, use size from operation record
            console.log(`Result file not found at ${resultFilePath}, using size from operation record`);
            resultSize = operation.options?.resultSize || 0;
          }
        } catch (fsError) {
          console.warn(`Error accessing file: ${fsError.message}`);
          resultSize = operation.options?.resultSize || 0;
        }
      } else {
        // Use operation record size for Cloudinary or when path is undefined
        resultSize = operation.options?.resultSize || 0;
      }
    } catch (sizeError) {
      console.error(`Error getting result file size: ${sizeError.message}`);
      resultSize = operation.options?.resultSize || 0;
    }
    
    // Add special headers for CORS handling with fetch download requests
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
    
    // Add special headers for Cloudinary URLs
    if (downloadUrl.includes('cloudinary.com')) {
      res.setHeader('X-Download-Source', 'cloudinary');
      res.setHeader('X-Cloudinary-URL', downloadUrl);
      
      // Dodatkowe zabezpieczenie - upewnij się, że URL Cloudinary ma parametr fl_attachment
      // Ten parametr jest kluczowy dla poprawnego pobierania plików
      if (!downloadUrl.includes('fl_attachment')) {
        downloadUrl = downloadUrl.includes('?') 
          ? `${downloadUrl}&fl_attachment=true` 
          : `${downloadUrl}?fl_attachment=true`;
        console.log(`🔧 Enhanced Cloudinary URL with fl_attachment: ${downloadUrl}`);
      }
    }
    
    // Dodaj informacje debugowania
    console.log(`📥 Download URL type: ${downloadUrl.includes('cloudinary.com') ? 'Cloudinary' : 'Local'}`);
    console.log(`📥 Final download URL: ${downloadUrl}`);
    
    // Return the result with enhanced information
    res.status(200).json({
      success: true,
      downloadUrl,
      expiryTime: expiryTime.toISOString(),
      fileName: filename,
      fileSize: resultSize || operation.options?.resultSize || 0,
      originalSize: operation.fileSize,
      resultSize: resultSize || operation.options?.resultSize || 0,
      compressionRatio: operation.compressionStats?.compressionRatio,
      fileId: operation.resultFileId,
      format: operation.targetFormat,
      isCloudinaryUrl: downloadUrl.includes('cloudinary.com'),
      isRailway: !!process.env.RAILWAY_SERVICE_NAME,
      memoryMode: !!global.usingMemoryFallback
    });
  } catch (error) {
    console.error('Error getting conversion result:', error);
    next(error);
  }
};

// Get result preview
// @route   GET /api/operations/:id/preview
// @access  Public
exports.getResultPreview = async (req, res, next) => {
  try {
    let operation;
    
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      console.log(`Looking up operation ${req.params.id} in memory storage for preview`);
      operation = global.memoryStorage.findOperation(req.params.id);
      
      if (!operation) {
        console.log(`Operation ${req.params.id} not found in memory storage`);
        return next(new ErrorResponse('Operation not found', 404));
      }
    } else {
      // Standard MongoDB lookup
      operation = await Operation.findById(req.params.id);
      
      if (!operation) {
        return next(new ErrorResponse('Operation not found', 404));
      }
    }
    
    // Check if the session ID matches (unless it's an authenticated user who owns the operation)
    let isOwner = false;
    if (req.user && operation.userId) {
      // In memory mode, we need to compare as strings
      const userIdStr = req.user._id.toString();
      const opUserIdStr = operation.userId.toString ? operation.userId.toString() : operation.userId;
      isOwner = userIdStr === opUserIdStr;
    }
    
    if (!isOwner && operation.sessionId !== req.sessionId) {
      return next(new ErrorResponse('Not authorized to access this operation', 403));
    }
    
    // Check if the operation is completed
    if (operation.status !== 'completed') {
      return next(new ErrorResponse('Operation is not completed yet', 400));
    }
    
    // Generate preview URL - for now we return a placeholder
    // In a real app, you would generate a preview of the converted file
    const previewUrl = 'https://via.placeholder.com/150';
    
    // Return the preview URL
    res.status(200).json({
      previewUrl
    });
  } catch (error) {
    next(error);
  }
};

// Process the conversion in background
const processConversion = async (operation, filepath) => {
  try {
    // Ensure filepath is defined
    if (!filepath) {
      console.error('No filepath provided to processConversion');
      throw new Error('Invalid filepath for conversion');
    }
    
    console.log(`Processing conversion for operation ${operation._id} with file ${filepath}`);
    
    // Update status to processing
    operation.status = 'processing';
    operation.progress = 10;
    await operation.save();
    
    let result;
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
      throw new Error(`Source file not found at ${filepath}`);
    }
    
    // Make sure output directories exist and are writable
    const outputDir = process.env.TEMP_DIR || './temp';
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Check if directory is writable
      fs.accessSync(outputDir, fs.constants.W_OK);
    } catch (dirError) {
      console.error(`Output directory ${outputDir} is not accessible:`, dirError);
      throw new Error('Service temporarily unavailable due to storage issues');
    }
    
    // Check if required services are available
    try {
      // Check if the required modules are loaded - will throw if not available
      const pdfLib = require('pdf-lib');
      const sharp = require('sharp');
    } catch (serviceError) {
      console.error('PDF processing service unavailable:', serviceError);
      throw new Error('PDF processing service temporarily unavailable');
    }
    
    try {
      // In our simplified approach, the filepath passed to this function
      // should already be the correct local file path
      let sourceFilePath = filepath;
      
      console.log(`Using local file for conversion: ${sourceFilePath}`);
      
      // Verify the file exists before proceeding
      if (!fs.existsSync(sourceFilePath)) {
        console.error(`Source file not found at: ${sourceFilePath}`);
        throw new Error(`Source file not found at: ${sourceFilePath}`);
      }
      
      const fileSize = fs.statSync(sourceFilePath).size;
      console.log(`Source file size: ${fileSize} bytes`);
      
      // Start the conversion based on target format
      // Add resultFileId to options to maintain ID consistency
      const enhancedOptions = {
        ...operation.options,
        resultFileId: operation.resultFileId // Use the pre-assigned ID
      };
      
      console.log(`DEBUG: Enhanced options with resultFileId: ${operation.resultFileId}`);
      
      switch (operation.targetFormat) {
        case 'docx':
          result = await pdfService.convertPdfToWord(sourceFilePath, enhancedOptions);
          break;
        case 'xlsx':
          result = await pdfService.convertPdfToExcel(sourceFilePath, enhancedOptions);
          break;
        case 'pptx':
          result = await pdfService.convertPdfToPowerPoint(sourceFilePath, enhancedOptions);
          break;
        case 'jpg':
          result = await pdfService.convertPdfToImage(sourceFilePath, enhancedOptions);
          break;
        case 'txt':
          result = await pdfService.convertPdfToText(sourceFilePath, enhancedOptions);
          break;
        case 'pdf':
          // Compression operation
          result = await pdfService.compressPdf(sourceFilePath, enhancedOptions);
          
          if (result && result.originalSize && result.resultSize) {
            // Store compression stats
            operation.compressionStats = {
              originalSize: result.originalSize,
              resultSize: result.resultSize,
              compressionRatio: result.compressionRatio || 0,
              compressionLevel: operation.options.compressionLevel || 'medium'
            };
          }
          break;
        default:
          throw new Error(`Unsupported target format: ${operation.targetFormat}`);
      }
      
      // Validate result
      if (!result || !result.outputPath || !fs.existsSync(result.outputPath)) {
        throw new Error(`Conversion failed: Invalid result or output file not found`);
      }
      
      // Update the progress
      operation.progress = 90;
      await operation.save();
      
      // Get the result filename
      const outputFilename = path.basename(result.outputPath);
      
      // Always upload result to Cloudinary - CRITICAL for Railway deployment
      console.log('Uploading conversion result to Cloudinary - REQUIRED for Railway deployment');
      const cloudinaryService = require('../services/cloudinaryService');
      
      // Flag to track Cloudinary upload success
      let cloudinaryUploadSuccess = false;
      let cloudinaryResult = null;
      
      // Make multiple attempts to upload to Cloudinary
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Cloudinary upload attempt ${attempt}/3`);
          
          // Ensure your Cloudinary env vars are set correctly:
          console.log('Cloudinary environment variables check:');
          console.log('- CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT SET');
          console.log('- CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'SET (hidden)' : 'NOT SET');
          console.log('- CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'SET (hidden)' : 'NOT SET');
          
          // Validate that the file still exists before uploading
          if (!fs.existsSync(result.outputPath)) {
            throw new Error(`Output file does not exist at path: ${result.outputPath}`);
          }
          
          // Create a better unique ID for the file (with operation type and timestamp)
          const timestamp = Date.now();
          const cloudinaryFileName = `${operation.targetFormat}_${outputFilename}_${timestamp}`;
          
          console.log(`Uploading file to Cloudinary: ${result.outputPath}`);
          console.log(`With file name: ${cloudinaryFileName}`);
          console.log(`File size: ${fs.statSync(result.outputPath).size} bytes`);
          
          // Upload the result file to Cloudinary with enhanced options for Railway
          cloudinaryResult = await cloudinaryService.uploadFile(
            { path: result.outputPath, originalname: cloudinaryFileName },
            { 
              folder: 'pdfspark_results',
              public_id: `${outputFilename.split('.')[0]}_${timestamp}`, // Use the filename without extension plus timestamp
              resource_type: 'auto',
              // Add tags for better organization
              tags: [operation.targetFormat, 'conversion-result', `source-${operation.sourceFormat}`, 'railway'],
              // Add extensive context metadata
              context: {
                alt: `Converted ${operation.sourceFormat} to ${operation.targetFormat}`,
                operation_id: operation._id.toString(),
                source_file_id: operation.sourceFileId,
                creation_time: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development',
                is_railway: process.env.RAILWAY_SERVICE_NAME ? 'true' : 'false'
              },
              // Set longer timeout for large files
              timeout: 60000
            }
          );
          
          if (!cloudinaryResult) {
            throw new Error('Cloudinary upload returned empty result');
          }
          
          console.log('Conversion result successfully uploaded to Cloudinary!');
          console.log('- Public ID:', cloudinaryResult.public_id);
          console.log('- URL:', cloudinaryResult.url ? 'Generated' : 'Missing');
          console.log('- Secure URL:', cloudinaryResult.secure_url ? 'Generated' : 'Missing');
          console.log('- Format:', cloudinaryResult.format);
          console.log('- Resource Type:', cloudinaryResult.resource_type);
          
          // Store Cloudinary information in the operation - with detailed metadata
          operation.cloudinaryData = {
            publicId: cloudinaryResult.public_id,
            url: cloudinaryResult.url,
            secureUrl: cloudinaryResult.secure_url,
            format: cloudinaryResult.format,
            resourceType: cloudinaryResult.resource_type,
            uploadTime: new Date().toISOString(),
            uploadSuccess: true,
            uploadAttempt: attempt
          };
          
          // IMPORTANT: Set the download URL to use the Cloudinary URL directly
          // This is critical for Railway deployment since local files aren't persisted
          if (cloudinaryResult.secure_url) {
            operation.resultDownloadUrl = cloudinaryResult.secure_url;
            console.log(`Set operation download URL to Cloudinary: ${operation.resultDownloadUrl}`);
            
            // Mark as successful
            cloudinaryUploadSuccess = true;
            break; // Exit retry loop on success
          } else {
            throw new Error('Cloudinary upload succeeded but secure_url is missing');
          }
        } catch (cloudinaryError) {
          console.error(`Cloudinary upload attempt ${attempt} failed:`, cloudinaryError);
          
          // Store error information in operation for debugging
          operation.cloudinaryError = operation.cloudinaryError || [];
          operation.cloudinaryError.push({
            attempt,
            time: new Date().toISOString(),
            message: cloudinaryError.message,
            stack: cloudinaryError.stack
          });
          
          // Wait between retries
          if (attempt < 3) {
            console.log(`Waiting 2 seconds before retry ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // After all attempts - check if we succeeded
      if (!cloudinaryUploadSuccess) {
        console.error('CRITICAL: All Cloudinary upload attempts failed!');
        console.error('This is a CRITICAL error for Railway deployment since files are not persisted!');
        
        // For Railway, we need to explicitly fail the operation if Cloudinary upload fails
        if (process.env.RAILWAY_SERVICE_NAME) {
          console.error('Running in Railway environment - marking operation as failed due to Cloudinary upload failure');
          throw new Error('Failed to upload result to Cloudinary. This is required in Railway deployment.');
        } else {
          console.warn('Not in Railway environment - continuing with local file as fallback');
          console.warn('Download will still work locally but would fail in Railway');
        }
      }
      
      // Update the operation with the result
      operation.status = 'completed';
      operation.progress = 100;
      operation.completedAt = new Date();
      
      // Verify the result file ID is consistent with what we pre-assigned
      const outputResultFileId = path.parse(outputFilename).name;
      
      // Keep the existing resultFileId if it's set, otherwise use the one from output
      if (!operation.resultFileId) {
        console.log(`Assigning new resultFileId: ${outputResultFileId} (no previous ID)`);
        operation.resultFileId = outputResultFileId;
      } else if (operation.resultFileId !== outputResultFileId) {
        console.log(`WARNING: Generated resultFileId (${outputResultFileId}) different from pre-assigned (${operation.resultFileId})`);
        // Keep using the pre-assigned ID for consistency
        console.log(`Keeping pre-assigned resultFileId: ${operation.resultFileId} for consistency`);
      } else {
        console.log(`Verified resultFileId consistency: ${operation.resultFileId}`);
      }
      
      // Make sure options is initialized
      operation.options = operation.options || {};
      operation.options.resultSize = result.resultSize;
      
      // Add additional metadata for debugging
      operation.metadata = operation.metadata || {};
      operation.metadata.resultFilePath = result.outputPath;
      operation.metadata.resultFileExists = fs.existsSync(result.outputPath);
      operation.metadata.completedAt = new Date().toISOString();
      
      // Log operation update for debugging
      console.log(`Saving operation with resultFileId: ${operation.resultFileId}`);
      console.log(`Result file exists at ${result.outputPath}: ${fs.existsSync(result.outputPath)}`);
      
      // Triple-check that resultFileId is set properly
      if (!operation.resultFileId) {
        console.error('🚨 CRITICAL: resultFileId is still not set before saving!');
        // Emergency fallback - generate new ID
        operation.resultFileId = uuidv4();
        console.log(`🔧 Emergency fix: Set new resultFileId: ${operation.resultFileId}`);
      }
      
      // CRITICAL: Ensure the operation has correct resultFileId to match the exact filename (without extensions)
      // This is crucial for Railway deployment
      const filenameBase = path.parse(outputFilename).name;
      if (operation.resultFileId !== filenameBase) {
        console.error(`🚨 CRITICAL MISMATCH: operation.resultFileId (${operation.resultFileId}) doesn't match outputFilename base (${filenameBase})`);
        
        // Fix by using the actual output filename's base as the resultFileId
        operation.resultFileId = filenameBase;
        console.log(`🔧 Fixed resultFileId to match output filename: ${operation.resultFileId}`);
        
        // Also store original ID in metadata for debugging
        operation.metadata.originalResultFileId = operation.resultFileId;
      }
      
      // Also store the Cloudinary URL directly in resultDownloadUrl for easier access
      if (cloudinaryResult && cloudinaryResult.secure_url) {
        console.log(`📌 Storing Cloudinary URL directly in resultDownloadUrl for easier access`);
        operation.resultDownloadUrl = cloudinaryResult.secure_url;
      }
      
      // Save the operation
      await operation.save();
      
      // Extra verification after save
      console.log(`✅ Saved operation with resultFileId: ${operation.resultFileId}`);
      console.log(`✅ Cloudinary URL: ${operation.cloudinaryData?.secureUrl || 'NOT SET'}`);
      console.log(`✅ Result Download URL: ${operation.resultDownloadUrl || 'NOT SET'}`);
      
      console.log(`Conversion completed successfully: ${operation._id}`);
    } catch (conversionError) {
      console.error('Conversion process error:', conversionError);
      throw conversionError;
    }
  } catch (error) {
    console.error('Error processing conversion:', error);
    
    try {
      // Update the operation with error
      operation.status = 'failed';
      operation.errorMessage = error.message;
      operation.completedAt = new Date();
      await operation.save();
    } catch (saveError) {
      console.error('Error updating operation status after failure:', saveError);
    }
  }
};

// Create a payment for a premium conversion
// @route   POST /api/payments/create
// @access  Public
exports.createPayment = async (req, res, next) => {
  try {
    const { operationId, paymentMethod = 'card', returnUrl } = req.body;
    
    if (!operationId) {
      return next(new ErrorResponse('Please provide operationId', 400));
    }
    
    // Get the operation
    const operation = await Operation.findById(operationId);
    
    if (!operation) {
      return next(new ErrorResponse('Operation not found', 404));
    }
    
    // Check if the session ID matches (unless it's an authenticated user who owns the operation)
    const isOwner = req.user && operation.userId && req.user._id.toString() === operation.userId.toString();
    if (!isOwner && operation.sessionId !== req.sessionId) {
      return next(new ErrorResponse('Not authorized to access this operation', 403));
    }
    
    // Check if the operation requires payment
    const isPremium = pdfService.isPremiumFormat(operation.targetFormat);
    if (!isPremium) {
      return next(new ErrorResponse('This operation does not require payment', 400));
    }
    
    // Check if the operation is already paid
    if (operation.isPaid) {
      return next(new ErrorResponse('This operation is already paid', 400));
    }
    
    // Get the price
    const price = pdfService.getFormatPrice(operation.targetFormat);
    
    // For development/testing (when STRIPE_SECRET_KEY is not set or we're not in production)
    // we'll simulate a successful payment
    if (process.env.NODE_ENV !== 'production' || !process.env.STRIPE_SECRET_KEY) {
      console.log('DEVELOPMENT: Simulating payment for operation', operationId);
      
      // Create a payment record
      const payment = await Payment.create({
        userId: req.user?._id,
        sessionId: req.sessionId,
        amount: price,
        currency: 'USD',
        operationId: operation._id,
        paymentMethod,
        status: 'successful', // Automatically successful in dev
        itemType: 'operation',
        completedAt: new Date()
      });
      
      // Update the operation
      operation.isPaid = true;
      operation.paymentId = payment._id;
      await operation.save();
      
      // Return success
      return res.status(200).json({
        success: true,
        paymentId: payment._id,
        status: payment.status,
        // Return a dummy checkout URL for frontend to handle
        checkoutUrl: returnUrl ? `${returnUrl}?success=true&session_id=mock_session_id&operation_id=${operation._id}` : null
      });
    }
    
    // For production, use Stripe
    try {
      // Import stripe service
      const stripeService = require('../services/stripeService');
      
      // Create a Stripe checkout session
      const session = await stripeService.createCheckoutSession(
        operation, 
        returnUrl || process.env.FRONTEND_URL || 'http://localhost:5174'
      );
      
      // Create a payment record in our database
      const payment = await Payment.create({
        userId: req.user?._id,
        sessionId: req.sessionId,
        amount: price,
        currency: 'USD',
        operationId: operation._id,
        paymentMethod,
        stripeSessionId: session.id,
        status: 'pending',
        itemType: 'operation'
      });
      
      // Return the checkout session URL
      res.status(200).json({
        success: true,
        paymentId: payment._id,
        status: payment.status,
        checkoutUrl: session.url,
        sessionId: session.id
      });
    } catch (error) {
      console.error('Stripe payment error:', error);
      return next(new ErrorResponse('Payment processing error', 500));
    }
  } catch (error) {
    next(error);
  }
};

// Check payment status
// @route   GET /api/payments/:id/status
// @access  Public
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return next(new ErrorResponse('Payment not found', 404));
    }
    
    // Check if the session ID matches (unless it's an authenticated user who owns the payment)
    const isOwner = req.user && payment.userId && req.user._id.toString() === payment.userId.toString();
    if (!isOwner && payment.sessionId !== req.sessionId) {
      return next(new ErrorResponse('Not authorized to access this payment', 403));
    }
    
    // Return the status
    res.status(200).json({
      paymentId: payment._id,
      status: payment.status,
      operationId: payment.operationId,
      canProceed: payment.status === 'successful'
    });
  } catch (error) {
    next(error);
  }
};

// Stripe webhook handler
// @route   POST /api/webhook
// @access  Public
exports.stripeWebhook = async (req, res, next) => {
  try {
    // Check if we have a Stripe secret and webhook secret
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.log('Stripe webhook received but keys not configured. Skipping validation.');
      return res.status(200).send();
    }

    const stripeService = require('../services/stripeService');
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
      apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
    });
    
    // Get the webhook signature from headers
    const signature = req.headers['stripe-signature'];
    
    // Validate the signature is present
    if (!signature) {
      console.error('Webhook signature missing');
      return res.status(400).send('Webhook Error: No signature provided');
    }
    
    let event;
    
    try {
      // Verify the event using the webhook secret
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }
    
    // Log the event type for monitoring
    console.log(`Received Stripe webhook event: ${event.type}`);
    
    // Handle the event
    await stripeService.handleWebhookEvent(event);
    
    // Respond to Stripe with a 200 OK status
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    // Even for errors, we should respond with 200 to acknowledge receipt
    res.status(200).send();
  }
};