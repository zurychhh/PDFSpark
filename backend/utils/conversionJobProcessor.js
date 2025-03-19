/**
 * ConversionJobProcessor
 * 
 * Specialized processor for PDF conversion jobs that works with 
 * the enhanced ProcessingQueue system.
 * 
 * This processor handles:
 * - Cloudinary uploads of source files
 * - PDF conversion operations
 * - Result file uploads to Cloudinary
 * - Operation status tracking
 * - Memory-aware processing
 * - Chunked processing for large files
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cloudinaryHelper = require('./cloudinaryHelper');
const logger = require('./logger');
const Operation = require('../models/Operation');
const { chunkedPdfProcessor } = require('./chunkedPdfProcessor');

class ConversionJobProcessor {
  constructor(options = {}) {
    this.options = {
      // Default options
      tempDir: process.env.TEMP_DIR || './temp',
      uploadDir: process.env.UPLOAD_DIR || './uploads',
      maxAttempts: 3,
      cloudinaryFolder: process.env.CLOUDINARY_FOLDER || 'pdfspark',
      railwayMode: !!process.env.RAILWAY_SERVICE_NAME,
      // Chunking options
      enableChunking: process.env.ENABLE_CHUNKING !== 'false',
      minChunkableSize: process.env.MIN_CHUNKABLE_SIZE || 10,
      // Override with provided options
      ...options
    };
    
    // Create a job-specific logger
    this.logger = logger.child({
      processor: 'ConversionJobProcessor'
    });
    
    // Initialize memory manager reference
    this.memoryManager = options.memoryManager;
    
    // Set reference to chunked processor
    this.chunkedPdfProcessor = chunkedPdfProcessor;
    if (this.memoryManager) {
      this.chunkedPdfProcessor.memoryManager = this.memoryManager;
    }
    
    this.logger.info('ConversionJobProcessor initialized', {
      railwayMode: this.options.railwayMode,
      cloudinaryFolder: this.options.cloudinaryFolder,
      enableChunking: this.options.enableChunking
    });
  }
  
  /**
   * Process a conversion job
   * @param {Object} job The job data
   * @returns {Promise<Object>} Processing result
   */
  async process(job) {
    // Get the operation from the job data
    const { operationId } = job;
    const correlationId = job.correlationId || uuidv4();
    
    // Create job-specific logger with correlation ID
    const jobLogger = this.logger.child({
      operationId,
      correlationId
    });
    
    jobLogger.info('Starting conversion job processing', { job });
    
    try {
      // 1. Find the operation
      const operation = await this.findOperation(operationId);
      if (!operation) {
        throw new Error(`Operation ${operationId} not found`);
      }
      
      // 2. Update operation status
      operation.status = 'processing';
      operation.progress = 10;
      await operation.save();
      
      // 3. Get source file
      const filePath = await this.findSourceFile(operation.sourceFileId);
      jobLogger.info('Found source file', { filePath });
      
      // 4. Upload to Cloudinary (if not already)
      let sourceCloudinaryData = operation.sourceCloudinaryData;
      if (!sourceCloudinaryData && filePath) {
        // Update progress
        operation.progress = 20;
        await operation.save();
        
        jobLogger.info('Uploading source file to Cloudinary', { filePath });
        
        // Upload to Cloudinary
        const cloudinaryResult = await cloudinaryHelper.reliableCloudinaryUpload(
          filePath,
          {
            folder: `${this.options.cloudinaryFolder}/sources`,
            correlationId,
            uploadId: `src_${operation._id}`,
            tags: ['source', operation.sourceFormat, `op_${operation._id}`],
            maxAttempts: this.options.maxAttempts,
            fallbackToLocal: true
          }
        );
        
        // Store Cloudinary information
        await operation.updateSourceCloudinaryData(cloudinaryResult);
        sourceCloudinaryData = operation.sourceCloudinaryData;
        
        jobLogger.info('Source file uploaded to Cloudinary', {
          publicId: cloudinaryResult.public_id
        });
        
        // Update progress
        operation.progress = 30;
        await operation.save();
      } else if (sourceCloudinaryData) {
        jobLogger.info('Source file already uploaded to Cloudinary', {
          publicId: sourceCloudinaryData.publicId
        });
      }
      
      // 5. Perform the conversion
      jobLogger.info('Starting conversion process', {
        sourceFormat: operation.sourceFormat,
        targetFormat: operation.targetFormat
      });
      
      // Update progress
      operation.progress = 50;
      await operation.save();
      
      // Get the file content - either from Cloudinary or local file
      let fileBuffer;
      if (sourceCloudinaryData && sourceCloudinaryData.publicId) {
        // Get from Cloudinary
        jobLogger.info('Downloading file from Cloudinary for processing');
        try {
          const cloudinaryUrl = sourceCloudinaryData.secureUrl;
          const response = await fetch(cloudinaryUrl);
          if (!response.ok) {
            throw new Error(`Failed to download from Cloudinary: ${response.status}`);
          }
          fileBuffer = Buffer.from(await response.arrayBuffer());
        } catch (downloadError) {
          jobLogger.error('Error downloading from Cloudinary, falling back to local file', {
            error: downloadError.message
          });
          
          // Fall back to local file if available
          if (filePath && fs.existsSync(filePath)) {
            fileBuffer = fs.readFileSync(filePath);
          } else {
            throw new Error('Failed to get file content for processing');
          }
        }
      } else if (filePath && fs.existsSync(filePath)) {
        // Read from local file
        fileBuffer = fs.readFileSync(filePath);
      } else {
        throw new Error('No source file available for processing');
      }
      
      // Result variables to be set by processing
      let resultCloudinaryResult;
      
      // Check if we should use chunked processing
      if (this.options.enableChunking && 
          operation.sourceFormat === 'pdf' &&
          await this.shouldUseChunking(fileBuffer, operation)) {
        
        jobLogger.info('Using chunked processing for large file', {
          fileSize: fileBuffer.length,
          targetFormat: operation.targetFormat
        });
        
        // Process the file in chunks
        const chunkResult = await this.processInChunks(operation, fileBuffer, job, correlationId);
        
        // Use the result from chunked processing
        resultCloudinaryResult = {
          public_id: chunkResult.cloudinaryPublicId,
          secure_url: chunkResult.cloudinaryUrl,
          resource_type: 'raw',
          format: operation.targetFormat,
          created_at: new Date().toISOString()
        };
        
        jobLogger.info('Chunked processing completed', {
          publicId: resultCloudinaryResult.public_id
        });
      } else {
        // Use regular (non-chunked) processing
        jobLogger.info('Using regular processing', {
          fileSize: fileBuffer.length
        });
        
        // For demo purposes - we'll simulate the conversion
        // In a real implementation, this would call the actual conversion service
        jobLogger.info('Simulating conversion process');
        
        // Wait to simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 6. Generate result file (simulated)
        const resultFileId = operation.resultFileId || uuidv4();
        const resultFilename = `${resultFileId}.${operation.targetFormat}`;
        const resultFilePath = path.join(this.options.tempDir, resultFilename);
        
        // In a real implementation, this would be the actual converted file
        // For now, we'll create a dummy file if needed for testing
        if (!fs.existsSync(resultFilePath)) {
          const dirExists = fs.existsSync(this.options.tempDir);
          if (!dirExists) {
            fs.mkdirSync(this.options.tempDir, { recursive: true });
          }
          fs.writeFileSync(resultFilePath, `Converted content for ${operation._id}`);
        }
        
        // 7. Upload result to Cloudinary
        jobLogger.info('Uploading conversion result to Cloudinary', { resultFilePath });
        
        // Update progress
        operation.progress = 80;
        await operation.save();
        
        // Upload to Cloudinary
        resultCloudinaryResult = fs.existsSync(resultFilePath) 
          ? await cloudinaryHelper.reliableCloudinaryUpload(
              resultFilePath,
              {
                folder: `${this.options.cloudinaryFolder}/results`,
                correlationId,
                uploadId: `result_${operation._id}`,
                tags: ['result', operation.targetFormat, `op_${operation._id}`],
                maxAttempts: this.options.maxAttempts,
                fallbackToLocal: true
              }
            )
          : // If file doesn't exist, generate a mock result
            this.generateMockCloudinaryResult(operation);
      }
      
      // 8. Update operation status
      await operation.complete(
        resultFileId,
        resultCloudinaryResult.secure_url,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
        resultCloudinaryResult
      );
      
      jobLogger.info('Conversion job completed successfully', {
        publicId: resultCloudinaryResult.public_id
      });
      
      // 9. Clean up local files if in Railway mode
      if (this.options.railwayMode) {
        this.cleanupLocalFiles([filePath, resultFilePath]);
      }
      
      // Return the result
      return {
        success: true,
        operationId: operation._id,
        resultUrl: resultCloudinaryResult.secure_url
      };
    } catch (error) {
      jobLogger.error('Conversion job processing failed', {
        error: error.message,
        stack: error.stack
      });
      
      // If we have the operation, update its status
      if (job.operationId) {
        try {
          const operation = await this.findOperation(job.operationId);
          if (operation) {
            await operation.fail(error.message);
          }
        } catch (updateError) {
          jobLogger.error('Failed to update operation status', {
            error: updateError.message
          });
        }
      }
      
      // Re-throw the error to let the queue handle it
      throw error;
    }
  }
  
  /**
   * Find an operation by ID with memory fallback support
   * @param {String} operationId Operation ID
   * @returns {Promise<Object>} Operation object
   */
  async findOperation(operationId) {
    // Check if we're in memory fallback mode
    if (global.usingMemoryFallback && global.memoryStorage) {
      const memoryOp = global.memoryStorage.findOperation(operationId);
      if (memoryOp) {
        return new Operation(memoryOp);
      }
    }
    
    // Otherwise use MongoDB
    return await Operation.findById(operationId);
  }
  
  /**
   * Find a source file by ID
   * @param {String} fileId File ID
   * @returns {Promise<String|null>} File path or null if not found
   */
  async findSourceFile(fileId) {
    const possiblePaths = [
      path.join(this.options.uploadDir, fileId),
      path.join(this.options.tempDir, fileId),
    ];
    
    // Check all possible locations
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    
    this.logger.warn(`Source file not found locally: ${fileId}`, {
      searchedPaths: possiblePaths
    });
    
    return null;
  }
  
  /**
   * Clean up local files
   * @param {Array<String>} filePaths Array of file paths to clean
   */
  cleanupLocalFiles(filePaths) {
    for (const filePath of filePaths) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          this.logger.info(`Cleaned up local file: ${filePath}`);
        } catch (error) {
          this.logger.warn(`Failed to clean up file: ${filePath}`, {
            error: error.message
          });
        }
      }
    }
  }
  
  /**
   * Generate a mock Cloudinary result for testing
   * @param {Object} operation The operation object
   * @returns {Object} Mock Cloudinary result
   */
  generateMockCloudinaryResult(operation) {
    const publicId = `${this.options.cloudinaryFolder}/results/mock_${operation._id}`;
    
    return {
      public_id: publicId,
      secure_url: `https://res.cloudinary.com/demo/raw/upload/${publicId}.${operation.targetFormat}`,
      format: operation.targetFormat,
      resource_type: 'raw',
      bytes: 1024,
      created_at: new Date().toISOString(),
      _isMock: true
    };
  }
  
  /**
   * Determine if a file should be processed in chunks
   * @param {Buffer} fileBuffer File buffer
   * @param {Object} operation Operation object
   * @returns {Promise<Boolean>} True if chunking is recommended
   */
  async shouldUseChunking(fileBuffer, operation) {
    // Only PDFs are supported for chunking
    if (operation.sourceFormat !== 'pdf') {
      return false;
    }
    
    // If in Railway mode, be more aggressive with chunking
    if (this.options.railwayMode) {
      // In Railway, chunk any file over 2MB
      if (fileBuffer.length > 2 * 1024 * 1024) {
        return true;
      }
    }
    
    // Use the specialized PDF chunker's decision logic
    return await this.chunkedPdfProcessor.shouldChunkPdf(
      fileBuffer, 
      operation.targetFormat
    );
  }
  
  /**
   * Process a file in chunks
   * @param {Object} operation Operation object
   * @param {Buffer} fileBuffer File buffer
   * @param {Object} job Job data
   * @param {String} correlationId Correlation ID for logging
   * @returns {Promise<Object>} Processing result
   */
  async processInChunks(operation, fileBuffer, job, correlationId) {
    const jobLogger = this.logger.child({
      operationId: operation._id,
      correlationId,
      method: 'processInChunks'
    });
    
    jobLogger.info('Starting chunked processing', {
      fileSize: fileBuffer.length,
      targetFormat: operation.targetFormat
    });
    
    try {
      // Define the chunk processor function
      const processChunk = async (chunkBuffer, chunkInfo) => {
        jobLogger.info(`Processing chunk ${chunkInfo.chunkIndex + 1}/${chunkInfo.totalChunks}`, {
          pageRange: chunkInfo.metadata?.pageRange
        });
        
        // For demo, we'll simulate processing the chunk
        // In a real implementation, this would do the actual conversion
        
        // Add some metadata to simulate real processing
        const metadataTag = chunkInfo.metadata?.pageRange 
          ? `pages_${chunkInfo.metadata.pageRange.start}-${chunkInfo.metadata.pageRange.end}`
          : `chunk_${chunkInfo.chunkIndex}`;
        
        // Simulate processing time based on chunk size
        const processingTime = chunkInfo.metadata?.pageCount 
          ? chunkInfo.metadata.pageCount * 100
          : 500;
        
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        // Upload chunk result to Cloudinary
        const chunkUploadId = `chunk_${operation._id}_${chunkInfo.chunkIndex}`;
        const chunkFilename = `${chunkUploadId}.${operation.targetFormat}`;
        
        // Generate mock chunk data for testing
        const mockChunkContent = Buffer.from(
          `Processed chunk ${chunkInfo.chunkIndex} from operation ${operation._id}`
        );
        
        // Create a temporary file for the chunk
        const chunkFilePath = path.join(this.options.tempDir, chunkFilename);
        fs.writeFileSync(chunkFilePath, mockChunkContent);
        
        // Upload chunk to Cloudinary
        const chunkCloudinaryResult = await cloudinaryHelper.reliableCloudinaryUpload(
          chunkFilePath,
          {
            folder: `${this.options.cloudinaryFolder}/chunks`,
            correlationId,
            uploadId: chunkUploadId,
            tags: ['chunk', operation.targetFormat, `op_${operation._id}`, metadataTag],
            maxAttempts: this.options.maxAttempts
          }
        );
        
        // Clean up temporary chunk file
        if (fs.existsSync(chunkFilePath)) {
          fs.unlinkSync(chunkFilePath);
        }
        
        // Return chunk result
        return {
          cloudinaryPublicId: chunkCloudinaryResult.public_id,
          cloudinaryUrl: chunkCloudinaryResult.secure_url,
          format: operation.targetFormat,
          pageRange: chunkInfo.metadata?.pageRange,
          isChunk: true
        };
      };
      
      // Use the chunked processor to handle the file
      return await this.chunkedPdfProcessor.processInChunks(
        operation,
        fileBuffer,
        processChunk,
        { targetFormat: operation.targetFormat }
      );
    } catch (error) {
      jobLogger.error('Chunked processing failed', {
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }
  
  /**
   * Estimate memory requirements for a job
   * @param {Object} job The job data
   * @returns {Object} Memory estimate in MB and resource classification
   */
  estimateResources(job) {
    // In a real implementation, this would estimate based on file size,
    // conversion type, etc. For now, we'll use simple defaults.
    
    // Base memory - 10MB for the process + target format considerations
    let memoryMB = 10;
    let cpuIntensity = 'medium';
    
    // Adjust based on file size if available
    if (job.fileSize) {
      // Roughly estimate 2x the file size in memory
      const fileSizeMB = job.fileSize / (1024 * 1024);
      memoryMB += fileSizeMB * 2;
    }
    
    // Adjust based on target format
    if (job.targetFormat) {
      switch (job.targetFormat.toLowerCase()) {
        case 'docx':
          memoryMB *= 1.5;
          cpuIntensity = 'high';
          break;
        case 'xlsx':
          memoryMB *= 2;
          cpuIntensity = 'high';
          break;
        case 'jpg':
        case 'png':
          memoryMB *= 1.2;
          cpuIntensity = 'medium';
          break;
      }
    }
    
    return {
      memoryMB,
      cpuIntensity,
      resourceClass: memoryMB > 100 ? 'large' : memoryMB > 50 ? 'medium' : 'small'
    };
  }
}

// Create and export a singleton instance
const conversionJobProcessor = new ConversionJobProcessor();

module.exports = {
  ConversionJobProcessor,
  conversionJobProcessor
};