/**
 * Chunked Processing System
 * 
 * A system for breaking large operations into manageable chunks
 * to prevent memory exhaustion in Railway's constrained environment.
 * 
 * This works in conjunction with the Queue-Based Processing and
 * Cloudinary-First strategies to create a comprehensive solution
 * for Railway deployment.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

/**
 * Base ChunkedProcessor class
 * Provides the framework for processing files in chunks
 */
class ChunkedProcessor {
  constructor(options = {}) {
    // Chunking configuration
    this.maxChunkSize = options.maxChunkSize || 5; // Default 5 units per chunk (pages, MB, etc.)
    this.minChunkableSize = options.minChunkableSize || 10; // Min size to trigger chunking
    this.maxConcurrentChunks = options.maxConcurrentChunks || 2; // Max chunks to process at once
    
    // File handling
    this.tempDir = options.tempDir || process.env.TEMP_DIR || './temp';
    this.chunkPrefix = options.chunkPrefix || 'chunk_';
    
    // Memory management
    this.memoryManager = options.memoryManager; // Optional memory manager for adaptive chunking
    this.railwayMode = options.railwayMode || !!process.env.RAILWAY_SERVICE_NAME;
    
    // Initialize
    this.ensureTempDir();
    
    logger.info('ChunkedProcessor initialized', {
      maxChunkSize: this.maxChunkSize,
      minChunkableSize: this.minChunkableSize,
      maxConcurrentChunks: this.maxConcurrentChunks,
      railwayMode: this.railwayMode
    });
  }
  
  /**
   * Ensure temp directory exists
   */
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  /**
   * Generate a unique chunk file path
   * @param {String} operationId The operation ID
   * @param {Number} chunkIndex The chunk index
   * @param {String} extension File extension
   * @returns {String} The chunk file path
   */
  getChunkPath(operationId, chunkIndex, extension) {
    return path.join(
      this.tempDir,
      `${this.chunkPrefix}${operationId}_${chunkIndex}${extension}`
    );
  }
  
  /**
   * Should this file be processed in chunks?
   * @param {Buffer|Object} file The file to check (buffer or object with size info)
   * @param {String} sourceFormat Source format
   * @param {String} targetFormat Target format
   * @returns {Boolean} True if chunking is recommended
   */
  shouldUseChunking(file, sourceFormat, targetFormat) {
    // Default implementation - override in subclasses
    const fileSize = file.length || file.size || 0;
    const memoryIntensive = ['docx', 'xlsx', 'pptx'].includes(targetFormat);
    
    // Check current memory status if manager is available
    let memoryLimited = false;
    if (this.memoryManager) {
      const memoryStatus = this.memoryManager.getMemoryStatus();
      memoryLimited = memoryStatus.usedPercentage > 0.7;
    }
    
    // Base threshold - 5MB for regular formats, 2MB for memory-intensive ones
    const baseThreshold = memoryIntensive ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    
    // In Railway mode, be more aggressive with chunking
    const thresholdMultiplier = this.railwayMode ? 0.5 : 1;
    const threshold = baseThreshold * thresholdMultiplier;
    
    return fileSize > threshold || memoryLimited;
  }
  
  /**
   * Calculate optimal chunk size
   * @param {Number} totalSize Total file size or number of units
   * @param {Object} options Options affecting chunk size
   * @returns {Number} The optimal chunk size
   */
  calculateChunkSize(totalSize, options = {}) {
    // Default min and max chunk sizes
    const minChunkSize = options.minChunkSize || 1;
    const maxChunkSize = options.maxChunkSize || this.maxChunkSize;
    
    // Check memory availability if manager is available
    let memoryFactor = 1;
    if (this.memoryManager) {
      const memoryStatus = this.memoryManager.getMemoryStatus();
      
      // Reduce chunk size as memory usage increases
      if (memoryStatus.usedPercentage > 0.8) {
        memoryFactor = 0.5; // Half size when memory is high
      } else if (memoryStatus.usedPercentage > 0.6) {
        memoryFactor = 0.7; // 70% size when memory is moderate
      }
    }
    
    // Calculate based on total size
    let chunkSize;
    
    if (totalSize <= this.minChunkableSize) {
      // File is too small to chunk, process as a single chunk
      chunkSize = totalSize;
    } else {
      // Start with default max chunk size
      chunkSize = maxChunkSize;
      
      // Apply memory factor
      chunkSize = Math.max(minChunkSize, Math.floor(chunkSize * memoryFactor));
      
      // Ensure we don't create too many tiny chunks
      const minChunks = 2; // at least split into 2 chunks if chunking at all
      const maxChunks = Math.ceil(totalSize / minChunkSize);
      const targetChunks = Math.min(
        maxChunks, 
        Math.max(minChunks, Math.ceil(totalSize / chunkSize))
      );
      
      // Recalculate for even distribution
      chunkSize = Math.ceil(totalSize / targetChunks);
    }
    
    return chunkSize;
  }
  
  /**
   * Process a file in chunks
   * This is the main method that orchestrates the chunked processing workflow
   * @param {Object} operation The operation object
   * @param {Buffer} fileBuffer The file buffer
   * @param {Function} processChunkFn Function to process each chunk
   * @param {Object} options Additional options
   * @returns {Promise<Object>} The combined result
   */
  async processInChunks(operation, fileBuffer, processChunkFn, options = {}) {
    const operationLogger = logger.child({
      operationId: operation._id,
      method: 'processInChunks'
    });
    
    operationLogger.info('Starting chunked processing');
    
    try {
      // Step 1: Split the file into chunks
      operationLogger.info('Splitting file into chunks');
      const { chunks, metadata } = await this.splitIntoChunks(fileBuffer, operation, options);
      
      operationLogger.info(`File split into ${chunks.length} chunks`, { metadata });
      
      // Step 2: Process each chunk
      const chunkResults = [];
      const failedChunks = [];
      let currentChunk = 0;
      
      // Update operation progress for chunking
      operation.status = 'processing';
      operation.progress = 10; // 10% for splitting
      operation.chunkedProcessing = {
        totalChunks: chunks.length,
        completedChunks: 0,
        failedChunks: 0
      };
      await operation.save();
      
      // Process chunks with limited concurrency
      const concurrentChunks = Math.min(this.maxConcurrentChunks, chunks.length);
      operationLogger.info(`Processing chunks with concurrency: ${concurrentChunks}`);
      
      // For simpler initial implementation, process sequentially
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkInfo = {
          chunkIndex: i,
          totalChunks: chunks.length,
          metadata: chunk.metadata,
          operationId: operation._id
        };
        
        operationLogger.info(`Processing chunk ${i+1}/${chunks.length}`, { 
          chunkInfo 
        });
        
        try {
          // Run actual chunk processing
          const result = await processChunkFn(chunk.buffer, chunkInfo);
          
          chunkResults.push({
            index: i,
            result
          });
          
          // Update operation progress
          operation.progress = 10 + Math.floor((i + 1) / chunks.length * 70); // 10-80%
          operation.chunkedProcessing.completedChunks++;
          await operation.save();
          
          // Clean up chunk buffer to save memory
          chunk.buffer = null;
          
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        } catch (chunkError) {
          operationLogger.error(`Error processing chunk ${i}`, {
            error: chunkError.message
          });
          
          failedChunks.push({
            index: i,
            error: chunkError.message
          });
          
          // Update operation
          operation.chunkedProcessing.failedChunks++;
          await operation.save();
        }
      }
      
      // Step 3: Handle failures
      if (failedChunks.length > 0) {
        operationLogger.warn(`${failedChunks.length} chunks failed processing`);
        
        // If too many chunks failed, throw error
        if (failedChunks.length > chunks.length / 2) {
          throw new Error(`Too many chunks failed: ${failedChunks.length}/${chunks.length}`);
        }
      }
      
      // Step 4: Combine results
      operationLogger.info('Combining chunk results');
      operation.progress = 80; // 80% for combining
      await operation.save();
      
      const combinedResult = await this.combineResults(chunkResults, failedChunks, metadata);
      
      // Step 5: Final cleanup
      operation.progress = 90;
      await operation.save();
      
      operationLogger.info('Chunked processing completed successfully');
      return combinedResult;
    } catch (error) {
      operationLogger.error('Error in chunked processing', {
        error: error.message,
        stack: error.stack
      });
      
      // Rethrow to be handled by caller
      throw error;
    }
  }
  
  /**
   * Split a file into chunks
   * This is a placeholder that should be implemented by subclasses
   * @param {Buffer} fileBuffer The file buffer
   * @param {Object} operation The operation object
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Object with chunks array and metadata
   */
  async splitIntoChunks(fileBuffer, operation, options = {}) {
    throw new Error('splitIntoChunks must be implemented by subclass');
  }
  
  /**
   * Combine chunk results
   * This is a placeholder that should be implemented by subclasses
   * @param {Array} chunkResults The results from processing each chunk
   * @param {Array} failedChunks Information about failed chunks
   * @param {Object} metadata Additional metadata from the splitting process
   * @returns {Promise<Object>} The combined result
   */
  async combineResults(chunkResults, failedChunks, metadata) {
    throw new Error('combineResults must be implemented by subclass');
  }
  
  /**
   * Clean up temporary files and resources
   * @param {String} operationId The operation ID
   */
  async cleanup(operationId) {
    try {
      // Find all chunk files for this operation
      const chunkPattern = `${this.chunkPrefix}${operationId}_`;
      const files = fs.readdirSync(this.tempDir).filter(file => file.startsWith(chunkPattern));
      
      // Delete each file
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        await fs.promises.unlink(filePath);
      }
      
      logger.info(`Cleaned up ${files.length} temporary files for operation ${operationId}`);
    } catch (error) {
      logger.error(`Error cleaning up chunk files for operation ${operationId}`, {
        error: error.message
      });
    }
  }
}

module.exports = { ChunkedProcessor };