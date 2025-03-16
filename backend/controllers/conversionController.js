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
    const operation = await Operation.create({
      userId: req.user?._id,
      sessionId: req.sessionId,
      operationType: targetFormat === 'pdf' ? 'compression' : 'conversion',
      sourceFormat,
      targetFormat,
      status: 'queued',
      progress: 0,
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
        initiatedAt: new Date().toISOString()
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
      operation = global.memoryStorage.findOperation(req.params.id);
      
      if (!operation) {
        console.log(`Operation ${req.params.id} not found in memory storage`);
        return next(new ErrorResponse('Operation not found', 404));
      }
      
      console.log(`Found operation in memory: ${operation._id}, status: ${operation.status}`);
    } else {
      // Use standard MongoDB lookup
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
      console.log(`Session ID mismatch. Request: ${req.sessionId}, Operation: ${operation.sessionId}`);
      return next(new ErrorResponse('Not authorized to access this operation', 403));
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
    let isOwner = false;
    if (req.user && operation.userId) {
      // In memory mode, we need to compare as strings
      const userIdStr = req.user._id.toString();
      const opUserIdStr = operation.userId.toString ? operation.userId.toString() : operation.userId;
      isOwner = userIdStr === opUserIdStr;
    }
    
    if (!isOwner && operation.sessionId !== req.sessionId) {
      console.log(`Session mismatch. Operation session: ${operation.sessionId}, Request session: ${req.sessionId}`);
      return next(new ErrorResponse('Not authorized to access this operation', 403));
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
    
    // Check if we have a Cloudinary URL in the operation
    let downloadUrl = '';
    if (operation.cloudinaryData && operation.cloudinaryData.secureUrl) {
      downloadUrl = operation.cloudinaryData.secureUrl;
      console.log(`Using Cloudinary URL for download: ${downloadUrl}`);
    } else {
      // Fall back to local file URL
      console.log(`Checking result files in multiple locations...`);
      
      // 1. Check the metadata path first
      let fileExists = false;
      if (resultFilePath && fs.existsSync(resultFilePath)) {
        fileExists = true;
        console.log(`File found at stored path: ${resultFilePath}`);
      } else {
        console.log(`File not found at stored path: ${resultFilePath}`);
        
        // 2. Try with different extensions
        const possibleExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.jpg', '.txt'];
        const baseName = operation.resultFileId;
        const tempDir = process.env.TEMP_DIR || './temp';
        
        for (const ext of possibleExtensions) {
          const testPath = path.join(tempDir, `${baseName}${ext}`);
          console.log(`Trying path: ${testPath}`);
          
          if (fs.existsSync(testPath)) {
            resultFilePath = testPath;
            fileExists = true;
            console.log(`File found with extension ${ext}: ${resultFilePath}`);
            break;
          }
        }
        
        // 3. Try to find a file that starts with the ID (fuzzy match)
        if (!fileExists && fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          console.log(`Looking for files starting with ${baseName} in ${tempDir}`);
          console.log(`Found ${files.length} files in dir: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
          
          const matchingFile = files.find(file => file.startsWith(baseName));
          if (matchingFile) {
            resultFilePath = path.join(tempDir, matchingFile);
            fileExists = true;
            console.log(`Found matching file: ${resultFilePath}`);
          }
        }
      }
      
      // Generate download URL regardless of whether file exists to avoid breaking frontend
      downloadUrl = pdfService.getFileUrl(filename, 'result');
      console.log(`Using local file URL for download: ${downloadUrl}`);
      
      // Only log a warning if file doesn't exist
      if (!fileExists) {
        console.error(`Result file not found at any location. Download may fail.`);
        if (global.usingMemoryFallback) {
          console.warn('Memory mode active: continuing despite missing file');
        } else if (process.env.RAILWAY_SERVICE_NAME) {
          console.warn('Railway deployment: continuing despite missing file');
        }
        // Not returning error to avoid breaking frontend
      }
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
    
    // Return the result
    res.status(200).json({
      success: true,
      downloadUrl,
      expiryTime: expiryTime.toISOString(),
      fileName: filename,
      fileSize: resultSize || operation.options?.resultSize || 0,
      originalSize: operation.fileSize,
      resultSize: resultSize || operation.options?.resultSize || 0,
      compressionRatio: operation.compressionStats?.compressionRatio,
      fileId: operation.resultFileId
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
      switch (operation.targetFormat) {
        case 'docx':
          result = await pdfService.convertPdfToWord(sourceFilePath, operation.options);
          break;
        case 'xlsx':
          result = await pdfService.convertPdfToExcel(sourceFilePath, operation.options);
          break;
        case 'pptx':
          result = await pdfService.convertPdfToPowerPoint(sourceFilePath, operation.options);
          break;
        case 'jpg':
          result = await pdfService.convertPdfToImage(sourceFilePath, operation.options);
          break;
        case 'txt':
          result = await pdfService.convertPdfToText(sourceFilePath, operation.options);
          break;
        case 'pdf':
          // Compression operation
          result = await pdfService.compressPdf(sourceFilePath, operation.options);
          
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
      
      // Upload result to Cloudinary
      console.log('Uploading conversion result to Cloudinary');
      const cloudinaryService = require('../services/cloudinaryService');
      
      try {
        // Upload the result file to Cloudinary
        const cloudinaryResult = await cloudinaryService.uploadFile(
          { path: result.outputPath, originalname: outputFilename },
          { 
            folder: 'pdfspark_results',
            public_id: outputFilename.split('.')[0], // Use the filename without extension as public_id
            resource_type: 'auto'
          }
        );
        
        console.log('Conversion result uploaded to Cloudinary:', cloudinaryResult.public_id);
        
        // Store Cloudinary information in the operation
        operation.cloudinaryData = {
          publicId: cloudinaryResult.public_id,
          url: cloudinaryResult.url,
          secureUrl: cloudinaryResult.secure_url,
          format: cloudinaryResult.format,
          resourceType: cloudinaryResult.resource_type
        };
      } catch (cloudinaryError) {
        console.error('Error uploading result to Cloudinary:', cloudinaryError);
        // Continue with local file as fallback - don't fail the conversion
      }
      
      // Update the operation with the result
      operation.status = 'completed';
      operation.progress = 100;
      operation.completedAt = new Date();
      
      // Ensure the result file ID is set correctly
      const resultFileId = path.parse(outputFilename).name;
      operation.resultFileId = resultFileId;
      
      // Make sure options is initialized
      operation.options = operation.options || {};
      operation.options.resultSize = result.resultSize;
      
      // Add additional metadata for debugging
      operation.metadata = operation.metadata || {};
      operation.metadata.resultFilePath = result.outputPath;
      operation.metadata.resultFileExists = fs.existsSync(result.outputPath);
      operation.metadata.completedAt = new Date().toISOString();
      
      // Log operation update for debugging
      console.log(`Saving operation with resultFileId: ${resultFileId}`);
      console.log(`Result file exists at ${result.outputPath}: ${fs.existsSync(result.outputPath)}`);
      
      // Save the operation
      await operation.save();
      
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