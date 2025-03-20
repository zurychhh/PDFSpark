/**
 * Enhanced Chunked PDF Processor
 * 
 * Specializes in processing PDF documents in chunks to prevent
 * memory exhaustion in Railway's constrained environment.
 * 
 * This implementation is integrated with the enhanced memory management system
 * for better resource utilization and stability.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { ChunkedProcessor } = require('./chunkedProcessor');
const logger = require('./logger');
const cloudinaryHelper = require('./cloudinaryHelper');
const { memoryManager } = require('./processingQueue');

/**
 * ChunkedPdfProcessor class
 * Handles splitting and combining PDF documents for chunked processing
 * with memory-aware adaptive behavior
 */
class ChunkedPdfProcessor extends ChunkedProcessor {
  constructor(options = {}) {
    // Integrate memory manager as default if available
    if (memoryManager && !options.memoryManager) {
      options.memoryManager = memoryManager;
    }
    
    super(options);
    
    // PDF-specific options
    this.pageBasedChunking = options.pageBasedChunking !== false;
    this.pdfPasswordProtected = options.pdfPasswordProtected || false;
    this.pdfPassword = options.pdfPassword || '';
    
    // Memory usage estimates per page for different formats
    this.formatMemoryEstimates = {
      'docx': 5,    // ~5MB per page for PDF to DOCX
      'xlsx': 7,    // ~7MB per page for PDF to XLSX
      'pptx': 4,    // ~4MB per page for PDF to PPTX
      'jpg': 2,     // ~2MB per page for PDF to JPG
      'png': 3,     // ~3MB per page for PDF to PNG
      'txt': 0.5    // ~0.5MB per page for PDF to TXT
    };
    
    // Format-specific chunk sizes - updated with more conservative values for Railway
    this.formatChunkSizes = {
      'docx': options.railwayMode ? 2 : 3,   // 2 pages per chunk for PDF to DOCX in Railway
      'xlsx': options.railwayMode ? 1 : 2,   // 1 page per chunk for PDF to XLSX in Railway
      'pptx': options.railwayMode ? 3 : 5,   // 3 pages per chunk for PDF to PPTX in Railway
      'jpg': options.railwayMode ? 5 : 10,   // 5 pages per chunk for PDF to JPG in Railway
      'png': options.railwayMode ? 4 : 8,    // 4 pages per chunk for PDF to PNG in Railway
      'txt': options.railwayMode ? 10 : 20   // 10 pages per chunk for PDF to TXT in Railway
    };
    
    // Allow memory manager emergency handlers to influence chunk sizes
    if (this.memoryManager) {
      this.memoryManager.registerWarningHandler(this.handleMemoryWarning.bind(this));
      
      // Register with memory manager for metrics tracking
      logger.info('ChunkedPdfProcessor registered with memory management system');
    }
    
    logger.info('Enhanced ChunkedPdfProcessor initialized', {
      pageBasedChunking: this.pageBasedChunking,
      formatChunkSizes: this.formatChunkSizes,
      memoryManagerIntegrated: !!this.memoryManager,
      railwayMode: options.railwayMode
    });
  }
  
  /**
   * Handle memory warning from memory manager
   * @param {Object} memoryStatus Current memory status
   */
  handleMemoryWarning(memoryStatus) {
    // Only adjust if memory is in warning or critical state
    if (memoryStatus.isWarning || memoryStatus.isCritical) {
      logger.info('Adjusting chunk sizes due to memory pressure', {
        memoryUsedPercentage: Math.round(memoryStatus.usedPercentage * 100)
      });
      
      // Temporarily reduce chunk sizes based on memory pressure
      const reductionFactor = memoryStatus.isCritical ? 0.5 : 0.7;
      
      // Store original values if not already stored
      if (!this._originalChunkSizes) {
        this._originalChunkSizes = { ...this.formatChunkSizes };
      }
      
      // Reduce all format chunk sizes
      for (const format in this.formatChunkSizes) {
        const originalSize = this._originalChunkSizes[format];
        const newSize = Math.max(1, Math.floor(originalSize * reductionFactor));
        
        if (this.formatChunkSizes[format] !== newSize) {
          logger.debug(`Reducing ${format} chunk size: ${this.formatChunkSizes[format]} -> ${newSize}`);
          this.formatChunkSizes[format] = newSize;
        }
      }
    } 
    // If memory is good and we have reduced chunk sizes, restore them
    else if (this._originalChunkSizes) {
      logger.info('Restoring original chunk sizes as memory pressure is resolved');
      this.formatChunkSizes = { ...this._originalChunkSizes };
      this._originalChunkSizes = null;
    }
  }
  
  /**
   * Determine if a PDF should be processed in chunks
   * @param {Buffer} pdfBuffer The PDF buffer
   * @param {String} targetFormat The target format
   * @param {Object} operation Optional operation data to include in logs
   * @returns {Promise<Boolean>} True if chunking is recommended
   */
  async shouldChunkPdf(pdfBuffer, targetFormat, operation = {}) {
    const operationId = operation._id || 'unknown';
    
    try {
      // Check current memory status first - fastest check
      let memoryStatus = null;
      let memoryLimited = false;
      
      if (this.memoryManager) {
        memoryStatus = this.memoryManager.getMemoryStatus();
        
        // More aggressive memory thresholds for chunking decision
        memoryLimited = memoryStatus.usedPercentage > 0.6; // Lower threshold than before
        
        // If memory is critical, immediately return true without loading PDF
        if (memoryStatus.isCritical) {
          logger.info(`Memory in critical state (${Math.round(memoryStatus.usedPercentage * 100)}%), forcing chunked processing`, {
            operationId,
            targetFormat
          });
          return true;
        }
      }
      
      // Check buffer size before loading PDF - faster than loading PDF
      const fileSizeMB = pdfBuffer.length / (1024 * 1024);
      
      // Get memory estimate for this format per page (conservative estimate)
      const memoryPerPageMB = this.formatMemoryEstimates[targetFormat] || 3; // Default 3MB per page
      
      // For very large files, don't even try to load for inspection
      if (fileSizeMB > 50) { // 50MB PDF is definitely huge and should be chunked
        logger.info(`PDF size (${fileSizeMB.toFixed(2)}MB) exceeds direct load threshold, forcing chunked processing`, {
          operationId,
          targetFormat
        });
        return true;
      }
      
      // Load PDF to check number of pages (with memory protection)
      const pdfLoadStartTime = Date.now();
      const pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: this.pdfPasswordProtected, 
        password: this.pdfPassword,
        updateMetadata: false, // Minimize memory usage during inspection
        capNumbers: true       // Additional memory optimization
      });
      
      const pageCount = pdfDoc.getPageCount();
      const pdfLoadTime = Date.now() - pdfLoadStartTime;
      
      // Get format-specific chunk size
      const formatMaxChunkSize = this.formatChunkSizes[targetFormat] || this.maxChunkSize;
      
      // Estimate total memory needed for full processing
      const estimatedTotalMemoryMB = pageCount * memoryPerPageMB;
      
      // Determine minimum page count that benefits from chunking (format-adaptive)
      const minChunkablePages = Math.max(formatMaxChunkSize * 2, this.minChunkableSize);
      
      // Check file size (for memory consideration)
      const fileSizeCheck = super.shouldUseChunking(pdfBuffer, 'pdf', targetFormat);
      
      // Additional memory indicators
      const pdfLoadWasSlow = pdfLoadTime > 500; // If PDF took longer than 500ms to load, it's likely large
      const highMemoryFormat = ['docx', 'xlsx'].includes(targetFormat); // These formats need more memory
      const isRailwayDeployment = this.railwayMode || !!process.env.RAILWAY_SERVICE_NAME;
      
      // Enhanced evaluation - multiple factors weighted
      const chunkingFactors = {
        // Primary factors
        pageCountExceedsMin: pageCount > minChunkablePages,
        fileSizeRequiresChunking: fileSizeCheck,
        memoryIsLimited: memoryLimited,
        
        // Secondary factors (additional indicators)
        estimatedMemoryHigh: estimatedTotalMemoryMB > 200, // Over 200MB estimated is high
        pdfLoadWasSlow: pdfLoadWasSlow,
        isHighMemoryFormat: highMemoryFormat,
        isRailwayDeployment: isRailwayDeployment
      };
      
      // Count primary and secondary factors
      const primaryFactors = Object.values(chunkingFactors).slice(0, 3).filter(Boolean).length;
      const secondaryFactors = Object.values(chunkingFactors).slice(3).filter(Boolean).length;
      
      // Enhanced decision logic
      let shouldChunk = false;
      
      // Always chunk if any primary factor is true
      if (primaryFactors > 0) {
        shouldChunk = true;
      }
      // Consider chunking if at least 2 secondary factors are true
      else if (secondaryFactors >= 2) {
        shouldChunk = true;
      }
      
      // In Railway, be more aggressive with chunking
      if (isRailwayDeployment && (pageCount > 10 || fileSizeMB > 10 || secondaryFactors >= 1)) {
        shouldChunk = true;
      }
      
      // Log comprehensive decision factors
      logger.info(`PDF chunking decision for ${targetFormat}: ${shouldChunk ? 'USE' : 'SKIP'} chunking`, {
        operationId,
        pageCount,
        fileSizeMB: fileSizeMB.toFixed(2),
        formatMaxChunkSize,
        estimatedMemoryMB: estimatedTotalMemoryMB.toFixed(2),
        memoryPercentage: memoryStatus ? Math.round(memoryStatus.usedPercentage * 100) : 'unknown',
        availableMemoryMB: memoryStatus ? memoryStatus.availableMB : 'unknown',
        chunking: shouldChunk,
        decisionFactors: chunkingFactors
      });
      
      return shouldChunk;
    } catch (error) {
      logger.error('Error analyzing PDF for chunking decision', {
        error: error.message,
        operationId,
        targetFormat
      });
      
      // Default to true if we can't analyze - better safe than OOM
      return true;
    } finally {
      // Suggest garbage collection after PDF analysis
      if (global.gc && this.memoryManager?.gcEnabled) {
        global.gc();
      }
    }
  }
  
  /**
   * Split a PDF into chunks with enhanced memory management
   * @param {Buffer} pdfBuffer The PDF buffer
   * @param {Object} operation The operation object
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Object with chunks array and metadata
   */
  async splitIntoChunks(pdfBuffer, operation, options = {}) {
    const targetFormat = operation.targetFormat;
    const operationId = operation._id;
    
    // Track memory before and after to measure impact
    let initialMemory = null;
    if (this.memoryManager) {
      initialMemory = process.memoryUsage().heapUsed;
    }
    
    try {
      // Check memory status before starting
      if (this.memoryManager) {
        const memoryStatus = this.memoryManager.getMemoryStatus();
        
        // If memory is already critical, attempt to free some before proceeding
        if (memoryStatus.isCritical) {
          logger.warn(`Memory in critical state before splitting PDF. Attempting to free memory.`, {
            operationId,
            memoryPercentage: Math.round(memoryStatus.usedPercentage * 100)
          });
          
          // Try to free memory before proceeding
          this.memoryManager.tryFreeMemory(true);
        }
      }
      
      // Load PDF with memory optimizations
      logger.info(`Loading PDF document for chunking (size: ${(pdfBuffer.length / (1024 * 1024)).toFixed(2)}MB)`, {
        operationId
      });
      
      // Use 'let' instead of 'const' so we can null it out later for GC
      let pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: this.pdfPasswordProtected,
        password: this.pdfPassword,
        updateMetadata: false, // Skip metadata updates to save memory
        capNumbers: true        // Additional memory optimization flag
      });
      
      const pageCount = pdfDoc.getPageCount();
      
      // Register the large PDF document for potential emergency cleanup
      if (global.tempBuffers) {
        global.tempBuffers.push({ 
          type: 'pdf-original',
          operationId,
          size: pdfBuffer.length
        });
      }
      
      // Get format-specific chunk size
      const formatMaxChunkSize = this.formatChunkSizes[targetFormat] || this.maxChunkSize;
      
      // Calculate optimal chunk size based on page count, memory and target format
      const memoryStatus = this.memoryManager ? this.memoryManager.getMemoryStatus() : null;
      
      // Additional factors for chunk size calculation
      const chunkSizeOptions = {
        maxChunkSize: formatMaxChunkSize,
        minChunkSize: 1,
        targetFormat,
        memoryStatus
      };
      
      // Get target format-specific memory requirements
      if (this.formatMemoryEstimates[targetFormat]) {
        chunkSizeOptions.memoryPerPage = this.formatMemoryEstimates[targetFormat];
      }
      
      // Railway-specific adjustments
      if (this.railwayMode || process.env.RAILWAY_SERVICE_NAME) {
        chunkSizeOptions.memoryConstrainedEnvironment = true;
      }
      
      // Calculate optimal chunk size
      const chunkSize = this.calculateChunkSize(pageCount, chunkSizeOptions);
      
      logger.info(`Splitting ${pageCount} page PDF into chunks of ${chunkSize} pages`, {
        operationId,
        targetFormat,
        memoryPercentage: memoryStatus ? Math.round(memoryStatus.usedPercentage * 100) : 'unknown'
      });
      
      // Calculate number of chunks
      const numChunks = Math.ceil(pageCount / chunkSize);
      
      // Create chunks array with pre-allocated capacity
      const chunks = [];
      
      // Process chunks one at a time with memory monitoring
      for (let i = 0; i < numChunks; i++) {
        // Check memory status before creating each chunk
        if (this.memoryManager) {
          const currentMemoryStatus = this.memoryManager.getMemoryStatus();
          
          // If memory is critical during chunking, potentially adjust strategy
          if (currentMemoryStatus.isCritical) {
            logger.warn(`Memory critical during PDF chunking. Attempting recovery.`, {
              chunkIndex: i,
              totalChunks: numChunks,
              memoryPercentage: Math.round(currentMemoryStatus.usedPercentage * 100)
            });
            
            // Try to free memory
            this.memoryManager.tryFreeMemory(true);
            
            // Additional mitigation: If we're not at the first chunk, could pause briefly
            if (i > 0) {
              logger.info(`Pausing briefly to allow memory recovery`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        // Calculate page range for this chunk
        const startPage = i * chunkSize;
        const endPage = Math.min((i + 1) * chunkSize - 1, pageCount - 1);
        const chunkPageCount = endPage - startPage + 1;
        
        logger.info(`Creating chunk ${i+1}/${numChunks} with pages ${startPage}-${endPage}`, {
          operationId
        });
        
        try {
          // Create a new PDF for this chunk
          let chunkPdf = await PDFDocument.create();
          
          // Copy pages from original PDF
          const pageIndices = Array.from(
            { length: chunkPageCount }, 
            (_, index) => startPage + index
          );
          
          // Copy pages with timeout protection
          let copiedPages = await Promise.race([
            chunkPdf.copyPages(pdfDoc, pageIndices),
            new Promise((_, reject) => setTimeout(() => 
              reject(new Error('Timeout copying PDF pages')), 30000)) // 30 second timeout
          ]);
          
          // Add pages to chunk PDF
          copiedPages.forEach(page => {
            chunkPdf.addPage(page);
          });
          
          // Save chunk to buffer with memory tracking
          const startSaveMemory = process.memoryUsage().heapUsed;
          let chunkPdfBytes = await chunkPdf.save();
          let chunkBuffer = Buffer.from(chunkPdfBytes);
          const endSaveMemory = process.memoryUsage().heapUsed;
          
          // Track memory impact
          const saveMemoryImpactMB = (endSaveMemory - startSaveMemory) / (1024 * 1024);
          
          // Add to chunks array
          chunks.push({
            buffer: chunkBuffer,
            metadata: {
              pageRange: { start: startPage, end: endPage },
              pageCount: chunkPageCount,
              index: i,
              totalChunks: numChunks
            }
          });
          
          // Log memory info for large chunk impacts
          if (saveMemoryImpactMB > 20) {
            logger.warn(`Large memory impact (${saveMemoryImpactMB.toFixed(2)}MB) saving chunk ${i+1}`, {
              operationId,
              chunkSizeMB: (chunkBuffer.length / (1024 * 1024)).toFixed(2)
            });
          }
          
          // Clean up variables to help GC
          // @ts-ignore
          chunkPdf = null;
          // @ts-ignore
          copiedPages = null;
          // @ts-ignore
          chunkPdfBytes = null;
          
          // Register the chunk for potential emergency cleanup
          if (global.tempBuffers) {
            global.tempBuffers.push({ 
              type: 'pdf-chunk',
              operationId,
              chunkIndex: i,
              size: chunkBuffer.length
            });
          }
          
          // Force garbage collection after each chunk
          if (global.gc && this.memoryManager?.gcEnabled) {
            global.gc();
          }
          
        } catch (chunkError) {
          // Handle chunk creation error
          logger.error(`Error creating chunk ${i+1}/${numChunks}`, {
            operationId,
            error: chunkError.message
          });
          
          // If we have some chunks, continue with what we have
          if (chunks.length > 0) {
            logger.warn(`Continuing with ${chunks.length} successfully created chunks`);
            break;
          } else {
            // Otherwise, propagate the error
            throw chunkError;
          }
        }
      }
      
      // Clean up the original PDF document reference
      // @ts-ignore
      pdfDoc = null;
      
      // Remove PDF from temp buffers
      if (global.tempBuffers) {
        global.tempBuffers = global.tempBuffers.filter(
          buffer => buffer.type !== 'pdf-original' || buffer.operationId !== operationId
        );
      }
      
      // Final garbage collection before returning
      if (global.gc && this.memoryManager?.gcEnabled) {
        global.gc();
      }
      
      // Calculate memory impact
      let memoryImpact = null;
      if (initialMemory !== null) {
        const finalMemory = process.memoryUsage().heapUsed;
        memoryImpact = (finalMemory - initialMemory) / (1024 * 1024);
        
        logger.info(`PDF splitting completed with memory impact: ${memoryImpact.toFixed(2)}MB`, {
          operationId,
          chunksCreated: chunks.length
        });
      }
      
      // Return chunks and metadata
      return {
        chunks,
        metadata: {
          pageCount,
          chunksCount: chunks.length,
          chunkSize,
          memoryImpactMB: memoryImpact ? parseFloat(memoryImpact.toFixed(2)) : null
        }
      };
    } catch (error) {
      logger.error('Error splitting PDF into chunks', {
        error: error.message,
        stack: error.stack,
        operationId
      });
      
      // Try to free memory after error
      if (this.memoryManager) {
        this.memoryManager.tryFreeMemory(true);
      }
      
      throw new Error(`Failed to split PDF: ${error.message}`);
    }
  }
  
  /**
   * Combine chunk results back into a single PDF with memory-aware processing
   * @param {Array} chunkResults The results from processing each chunk
   * @param {Array} failedChunks Information about failed chunks
   * @param {Object} metadata Additional metadata from the splitting process
   * @returns {Promise<Object>} The combined result
   */
  async combineResults(chunkResults, failedChunks, metadata) {
    // Track memory impact
    let initialMemory = null;
    if (this.memoryManager) {
      initialMemory = process.memoryUsage().heapUsed;
    }
    
    // Track the operation ID if available
    const operationId = chunkResults[0]?.operationId || metadata?.operationId || 'unknown';
    
    try {
      logger.info(`Combining ${chunkResults.length} PDF chunk results`, {
        operationId,
        failedChunks: failedChunks?.length || 0
      });
      
      // Check memory status before combining
      if (this.memoryManager) {
        const memoryStatus = this.memoryManager.getMemoryStatus();
        
        // If memory is already critical, attempt to free some before proceeding
        if (memoryStatus.isCritical) {
          logger.warn(`Memory in critical state before combining chunks. Attempting to free memory.`, {
            operationId,
            memoryPercentage: Math.round(memoryStatus.usedPercentage * 100)
          });
          
          // Try to free memory before proceeding with aggressive mode
          this.memoryManager.tryFreeMemory(true);
        }
      }
      
      // Sort chunk results by index to ensure correct order
      chunkResults.sort((a, b) => a.index - b.index);
      
      // For PDF-to-X conversions, most formats can't be directly combined
      // Instead, we typically have Cloudinary URLs for the individual results
      
      // Determine output format
      const outputFormat = chunkResults[0]?.result?.format || 'unknown';
      
      // Log initial combination details
      logger.info(`Combining ${chunkResults.length} chunks for ${outputFormat} output`, {
        operationId,
        outputFormat,
        strategy: (outputFormat === 'pdf') ? 'pdfCombine' : 'cloudinaryCombine'
      });
      
      let result;
      
      // For PDF-to-PDF (like compression), create a combined PDF
      if (chunkResults.length > 0 && outputFormat === 'pdf') {
        result = await this.combinePdfChunks(chunkResults, metadata, operationId);
      } else {
        // For images, text, or office documents, use Cloudinary ZIP generation
        result = await this.combineCloudinaryChunks(chunkResults, outputFormat, metadata, operationId);
      }
      
      // Calculate memory impact
      if (initialMemory !== null && this.memoryManager) {
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryImpact = (finalMemory - initialMemory) / (1024 * 1024);
        
        logger.info(`Chunk combination completed with memory impact: ${memoryImpact.toFixed(2)}MB`, {
          operationId,
          outputFormat
        });
        
        // Add memory impact to the result metadata
        if (result) {
          result.memoryImpactMB = parseFloat(memoryImpact.toFixed(2));
        }
        
        // If combination had large memory impact, trigger GC
        if (memoryImpact > 50 && global.gc && this.memoryManager.gcEnabled) {
          logger.info(`Large memory impact detected, triggering garbage collection`);
          global.gc();
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Error combining chunk results', {
        error: error.message,
        stack: error.stack,
        operationId
      });
      
      // Try to free memory after error
      if (this.memoryManager) {
        this.memoryManager.tryFreeMemory(true);
      }
      
      // If we have failed to combine chunks but have at least one result,
      // return the first chunk's result as a fallback
      if (chunkResults.length > 0 && chunkResults[0].result) {
        logger.warn(`Combination failed, returning first chunk result as fallback`, {
          operationId
        });
        
        const fallbackResult = {
          ...chunkResults[0].result,
          isPartial: true,
          combinationError: error.message,
          originalChunks: chunkResults.length
        };
        
        return fallbackResult;
      }
      
      throw new Error(`Failed to combine chunk results: ${error.message}`);
    }
  }
  
  /**
   * Combine PDF chunk results into a single PDF with memory-aware processing
   * @param {Array} chunkResults Array of chunk results
   * @param {Object} metadata Metadata about the original PDF
   * @param {String} operationId Operation ID for logging and tracking
   * @returns {Promise<Object>} Combined result
   */
  async combinePdfChunks(chunkResults, metadata, operationId = 'unknown') {
    // Track memory for this operation
    let chunkDownloadMemoryImpact = 0;
    let pageCopyMemoryImpact = 0;
    
    try {
      logger.info('Combining PDF chunks into single PDF', { operationId });
      
      // Check memory status before starting
      let initialMemoryStatus = null;
      if (this.memoryManager) {
        initialMemoryStatus = this.memoryManager.getMemoryStatus();
        logger.info(`Memory before PDF combination: ${Math.round(initialMemoryStatus.usedPercentage * 100)}%`, {
          operationId,
          availableMB: initialMemoryStatus.availableMB
        });
      }
      
      // Create a new PDF
      let combinedPdf = await PDFDocument.create();
      
      // Estimate total number of pages for progress tracking
      const totalPages = chunkResults.reduce((total, chunk) => {
        // Estimate page count from result metadata if available
        const pageCount = chunk.result?.pageCount || 
                         chunk.metadata?.pageCount || 
                         (chunk.result?.pageRange?.end - chunk.result?.pageRange?.start + 1) || 
                         0;
        return total + pageCount;
      }, 0);
      
      logger.info(`Combining approximately ${totalPages} pages from ${chunkResults.length} chunks`, {
        operationId
      });
      
      let successfulChunks = 0;
      let totalPagesAdded = 0;
      
      // For each chunk, download from Cloudinary and add to combined PDF
      for (let i = 0; i < chunkResults.length; i++) {
        const chunkResult = chunkResults[i];
        const { result } = chunkResult;
        
        // Skip chunks without Cloudinary URL
        if (!result?.cloudinaryUrl) {
          logger.warn(`Chunk ${chunkResult.index} missing Cloudinary URL, skipping`, { operationId });
          continue;
        }
        
        try {
          // Check memory before processing each chunk
          if (this.memoryManager) {
            const memoryStatus = this.memoryManager.getMemoryStatus();
            
            // If memory is critical, try to free memory before continuing
            if (memoryStatus.isCritical) {
              logger.warn(`Memory critical during PDF combination. Attempting recovery.`, {
                chunkIndex: i,
                totalChunks: chunkResults.length,
                memoryPercentage: Math.round(memoryStatus.usedPercentage * 100)
              });
              
              this.memoryManager.tryFreeMemory(true);
              
              // Brief pause to let memory stabilize
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          logger.info(`Processing chunk ${i+1}/${chunkResults.length} (index: ${chunkResult.index})`, { 
            operationId 
          });
          
          // Start measuring memory for chunk download
          const downloadStartMemory = process.memoryUsage().heapUsed;
          
          // Download PDF from Cloudinary with timeout protection
          const response = await Promise.race([
            fetch(result.cloudinaryUrl),
            new Promise((_, reject) => setTimeout(() => 
              reject(new Error('Timeout downloading chunk from Cloudinary')), 20000))
          ]);
          
          if (!response.ok) {
            throw new Error(`Failed to download chunk: ${response.status}`);
          }
          
          let chunkBuffer = await response.arrayBuffer();
          
          // Calculate download memory impact
          const downloadEndMemory = process.memoryUsage().heapUsed;
          const downloadMemoryImpact = (downloadEndMemory - downloadStartMemory) / (1024 * 1024);
          chunkDownloadMemoryImpact += downloadMemoryImpact;
          
          // Load chunk PDF with memory optimizations
          let chunkPdf = await PDFDocument.load(chunkBuffer, {
            updateMetadata: false,
            capNumbers: true
          });
          
          // Get page count for this chunk
          const chunkPageCount = chunkPdf.getPageCount();
          
          // Start measuring memory for page copying
          const copyStartMemory = process.memoryUsage().heapUsed;
          
          // Copy pages to combined PDF
          const pageIndices = Array.from(
            { length: chunkPageCount }, 
            (_, index) => index
          );
          
          // Add pages in batches for very large chunks to reduce memory pressure
          if (chunkPageCount > 20 && this.memoryManager?.getMemoryStatus().usedPercentage > 0.7) {
            // Use smaller batches for large documents under memory pressure
            const batchSize = 10;
            logger.info(`Large chunk detected, processing in batches of ${batchSize} pages`, { 
              operationId, 
              chunkIndex: i,
              pageCount: chunkPageCount 
            });
            
            // Process in batches
            for (let pageOffset = 0; pageOffset < chunkPageCount; pageOffset += batchSize) {
              const endIdx = Math.min(pageOffset + batchSize, chunkPageCount);
              const batchIndices = pageIndices.slice(pageOffset, endIdx);
              
              // Copy and add pages in this batch
              const batchPages = await combinedPdf.copyPages(chunkPdf, batchIndices);
              batchPages.forEach(page => combinedPdf.addPage(page));
              
              totalPagesAdded += batchPages.length;
              
              // Suggest GC after each batch for large chunks
              if (global.gc && this.memoryManager?.gcEnabled) {
                global.gc();
              }
              
              // Check memory status after each batch
              if (this.memoryManager?.getMemoryStatus().isEmergency) {
                logger.warn(`Memory emergency during batch processing. Attempting recovery.`, {
                  batchOffset: pageOffset,
                  chunkIndex: i,
                  pagesAdded: totalPagesAdded
                });
                
                this.memoryManager.tryFreeMemory(true, true);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } else {
            // Standard processing for smaller chunks
            let copiedPages = await combinedPdf.copyPages(chunkPdf, pageIndices);
            
            // Add pages to combined PDF
            copiedPages.forEach(page => combinedPdf.addPage(page));
            totalPagesAdded += copiedPages.length;
          }
          
          // Calculate page copying memory impact
          const copyEndMemory = process.memoryUsage().heapUsed;
          const copyMemoryImpact = (copyEndMemory - copyStartMemory) / (1024 * 1024);
          pageCopyMemoryImpact += copyMemoryImpact;
          
          // Clean up references to help GC
          // @ts-ignore
          chunkPdf = null;
          // @ts-ignore
          chunkBuffer = null;
          
          // Force garbage collection after each chunk
          if (global.gc && this.memoryManager?.gcEnabled) {
            global.gc();
          }
          
          successfulChunks++;
          
        } catch (chunkError) {
          logger.error(`Error adding chunk ${chunkResult.index} to combined PDF`, {
            error: chunkError.message,
            operationId
          });
          
          // If this is a memory-related error, try aggressive memory cleanup
          if (chunkError.message.includes('memory') || 
              chunkError.message.includes('allocation') || 
              chunkError.message.includes('heap')) {
            
            logger.warn('Possible memory-related error during PDF combination, attempting recovery', {
              operationId
            });
            
            if (this.memoryManager) {
              this.memoryManager.tryFreeMemory(true, true);
            }
            
            // Pause to let memory recover
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      // Skip creating combined PDF if no chunks were processed successfully
      if (successfulChunks === 0) {
        throw new Error('No chunks were successfully combined');
      }
      
      // If not all chunks were processed, log a warning
      if (successfulChunks < chunkResults.length) {
        logger.warn(`Only ${successfulChunks}/${chunkResults.length} chunks were combined successfully`, {
          operationId,
          pagesAdded: totalPagesAdded
        });
      }
      
      // Log memory impact from operations so far
      logger.info(`PDF combination memory impact: download=${chunkDownloadMemoryImpact.toFixed(2)}MB, copy=${pageCopyMemoryImpact.toFixed(2)}MB`, {
        operationId,
        pagesAdded: totalPagesAdded
      });
      
      // Check memory before saving combined PDF
      if (this.memoryManager) {
        const memoryBeforeSave = this.memoryManager.getMemoryStatus();
        
        // If memory is critical or emergency, try recovery before saving
        if (memoryBeforeSave.isCritical || memoryBeforeSave.isEmergency) {
          logger.warn(`Memory pressure before saving combined PDF: ${Math.round(memoryBeforeSave.usedPercentage * 100)}%. Attempting recovery.`, {
            operationId
          });
          
          this.memoryManager.tryFreeMemory(true, memoryBeforeSave.isEmergency);
        }
      }
      
      // Save combined PDF with memory tracking
      logger.info(`Saving combined PDF with ${totalPagesAdded} pages`, { operationId });
      const saveStartMemory = process.memoryUsage().heapUsed;
      
      let combinedPdfBytes = await combinedPdf.save();
      let combinedBuffer = Buffer.from(combinedPdfBytes);
      
      const saveEndMemory = process.memoryUsage().heapUsed;
      const saveMemoryImpact = (saveEndMemory - saveStartMemory) / (1024 * 1024);
      
      logger.info(`Combined PDF saved (${(combinedBuffer.length / (1024 * 1024)).toFixed(2)}MB, memory impact: ${saveMemoryImpact.toFixed(2)}MB)`, {
        operationId
      });
      
      // Clean up references to large objects
      // @ts-ignore
      combinedPdf = null;
      // @ts-ignore
      combinedPdfBytes = null;
      
      // Force garbage collection before upload
      if (global.gc && this.memoryManager?.gcEnabled) {
        global.gc();
      }
      
      // Upload combined result to Cloudinary
      logger.info('Uploading combined PDF to Cloudinary', { operationId });
      const uploadStartTime = Date.now();
      
      const uploadResult = await cloudinaryHelper.uploadBuffer(
        combinedBuffer,
        {
          folder: 'pdfspark_results',
          resource_type: 'raw',
          format: 'pdf'
        }
      );
      
      const uploadDuration = Date.now() - uploadStartTime;
      
      logger.info(`Combined PDF uploaded to Cloudinary (${uploadDuration}ms)`, {
        operationId,
        publicId: uploadResult.public_id
      });
      
      // Final result
      return {
        format: 'pdf',
        cloudinaryPublicId: uploadResult.public_id,
        cloudinaryUrl: uploadResult.secure_url,
        pageCount: totalPagesAdded,
        fileSize: combinedBuffer.length,
        successfulChunks,
        totalChunks: chunkResults.length,
        chunksProcessed: `${successfulChunks}/${chunkResults.length}`,
        memoryMetrics: {
          downloadMB: parseFloat(chunkDownloadMemoryImpact.toFixed(2)),
          copyMB: parseFloat(pageCopyMemoryImpact.toFixed(2)),
          saveMB: parseFloat(saveMemoryImpact.toFixed(2))
        }
      };
    } catch (error) {
      logger.error('Error combining PDF chunks', {
        error: error.message,
        stack: error.stack,
        operationId
      });
      
      // Try to free memory after error
      if (this.memoryManager) {
        this.memoryManager.tryFreeMemory(true);
      }
      
      throw new Error(`Failed to combine PDF chunks: ${error.message}`);
    }
  }
  
  /**
   * Combine non-PDF chunk results using Cloudinary with memory monitoring
   * @param {Array} chunkResults Array of chunk results
   * @param {String} outputFormat Output format (docx, txt, etc.)
   * @param {Object} metadata Metadata about the original PDF
   * @param {String} operationId Operation ID for logging and tracking
   * @returns {Promise<Object>} Combined result with Cloudinary URL
   */
  async combineCloudinaryChunks(chunkResults, outputFormat, metadata, operationId = 'unknown') {
    // Track initial memory
    let initialMemory = null;
    if (this.memoryManager) {
      initialMemory = process.memoryUsage().heapUsed;
    }
    
    try {
      logger.info(`Combining ${chunkResults.length} ${outputFormat} chunks via Cloudinary`, {
        operationId
      });
      
      // Check memory status before starting
      if (this.memoryManager) {
        const memoryStatus = this.memoryManager.getMemoryStatus();
        
        if (memoryStatus.isWarning) {
          logger.info(`Memory usage at ${Math.round(memoryStatus.usedPercentage * 100)}% before Cloudinary combination`, {
            operationId
          });
          
          // Cloudinary operations are generally less memory-intensive,
          // but we'll check and try to free memory if it's high
          if (memoryStatus.usedPercentage > 0.8) {
            this.memoryManager.tryFreeMemory(true);
          }
        }
      }
      
      // Extract Cloudinary public IDs from chunks
      const cloudinaryIds = chunkResults
        .filter(chunk => chunk.result?.cloudinaryPublicId)
        .map(chunk => chunk.result.cloudinaryPublicId);
      
      // Log the collected IDs for debugging
      logger.debug(`Found ${cloudinaryIds.length} Cloudinary IDs for combination`, {
        operationId,
        cloudinaryIds: cloudinaryIds.length <= 5 ? cloudinaryIds : `${cloudinaryIds.length} IDs (too many to list)`
      });
      
      if (cloudinaryIds.length === 0) {
        throw new Error('No valid Cloudinary IDs found in chunks');
      }
      
      // For single-chunk results, just return the chunk result
      if (cloudinaryIds.length === 1) {
        logger.info('Only one chunk result, using it directly', { operationId });
        
        // Add additional metadata to the result
        const result = {
          ...chunkResults[0].result,
          isSingleChunk: true,
          combinedFrom: 1,
          originalFormat: outputFormat
        };
        
        return result;
      }
      
      // Determine the best approach based on format and chunk count
      logger.info(`Determining combination strategy for ${outputFormat} with ${cloudinaryIds.length} chunks`, {
        operationId
      });
      
      // In Railway mode, be more aggressive with chunking (combine smaller batches)
      const isRailwayMode = this.railwayMode || !!process.env.RAILWAY_SERVICE_NAME;
      const maxIdsPerBatch = isRailwayMode ? 20 : 50;
      
      // Handle large number of chunks with batched processing
      if (cloudinaryIds.length > maxIdsPerBatch) {
        logger.info(`Large number of chunks (${cloudinaryIds.length}), using batched processing`, {
          operationId,
          maxIdsPerBatch
        });
        
        return await this.combineCloudinaryChunksInBatches(
          cloudinaryIds, 
          outputFormat, 
          maxIdsPerBatch,
          operationId
        );
      }
      
      // Standard processing for reasonable number of chunks
      let result;
      
      logger.info(`Creating Cloudinary ZIP archive with ${cloudinaryIds.length} ${outputFormat} files`, {
        operationId
      });
      
      // Track operation timing
      const startTime = Date.now();
      
      try {
        // Different approaches based on output format
        if (['jpg', 'png'].includes(outputFormat)) {
          // For images, create a ZIP archive using Cloudinary
          result = await cloudinaryHelper.createZipArchive(cloudinaryIds, {
            resourceType: 'image',
            folder: 'pdfspark_results',
            publicId: `combined_${Date.now()}_${operationId}`
          });
        } else if (['docx', 'xlsx', 'pptx', 'txt'].includes(outputFormat)) {
          // For documents, create a ZIP archive using Cloudinary
          result = await cloudinaryHelper.createZipArchive(cloudinaryIds, {
            resourceType: 'raw',
            folder: 'pdfspark_results',
            publicId: `combined_${Date.now()}_${operationId}`
          });
        } else {
          // Fallback to returning array of chunk results for unsupported formats
          logger.warn(`No combination strategy for format: ${outputFormat}, returning array`, {
            operationId
          });
          
          return {
            format: outputFormat,
            isMultipart: true,
            cloudinaryIds,
            chunksCount: cloudinaryIds.length,
            operationId,
            chunkResults: chunkResults.map(chunk => ({
              index: chunk.index,
              cloudinaryUrl: chunk.result?.cloudinaryUrl,
              cloudinaryPublicId: chunk.result?.cloudinaryPublicId,
              pageRange: chunk.result?.pageRange
            }))
          };
        }
        
        const duration = Date.now() - startTime;
        
        logger.info(`Cloudinary ZIP archive created successfully in ${duration}ms`, {
          operationId,
          publicId: result.public_id
        });
        
        // Calculate memory impact
        let memoryImpact = null;
        if (initialMemory !== null) {
          const finalMemory = process.memoryUsage().heapUsed;
          memoryImpact = (finalMemory - initialMemory) / (1024 * 1024);
        }
        
        // Full result with metrics
        return {
          format: outputFormat,
          isZipped: true,
          cloudinaryPublicId: result.public_id,
          cloudinaryUrl: result.secure_url,
          originalPageCount: metadata?.pageCount,
          cloudinaryIds: cloudinaryIds,
          chunksCount: cloudinaryIds.length,
          processingTimeMs: duration,
          memoryImpactMB: memoryImpact !== null ? parseFloat(memoryImpact.toFixed(2)) : null
        };
      } catch (cloudinaryError) {
        // If Cloudinary ZIP creation failed, we'll try a more robust approach
        logger.warn(`Cloudinary ZIP creation failed: ${cloudinaryError.message}, trying alternative approach`, {
          operationId
        });
        
        // Alternative: Return all URLs individually
        return {
          format: outputFormat,
          isMultipart: true,
          error: cloudinaryError.message,
          fallbackMode: true,
          cloudinaryIds,
          chunksCount: cloudinaryIds.length,
          operationId,
          chunkResults: chunkResults.map(chunk => ({
            index: chunk.index,
            cloudinaryUrl: chunk.result?.cloudinaryUrl,
            cloudinaryPublicId: chunk.result?.cloudinaryPublicId,
            pageRange: chunk.result?.pageRange
          }))
        };
      }
    } catch (error) {
      logger.error(`Error combining ${outputFormat} chunks`, {
        error: error.message,
        stack: error.stack,
        operationId
      });
      
      // Fallback to returning array of chunk results
      return {
        format: outputFormat,
        isMultipart: true,
        error: error.message,
        chunkResults: chunkResults.map(chunk => ({
          index: chunk.index,
          cloudinaryUrl: chunk.result?.cloudinaryUrl,
          cloudinaryPublicId: chunk.result?.cloudinaryPublicId,
          pageRange: chunk.result?.pageRange
        }))
      };
    }
  }
  
  /**
   * Combine large number of Cloudinary resources in batches
   * @param {Array<String>} cloudinaryIds Array of Cloudinary public IDs
   * @param {String} outputFormat Output format
   * @param {Number} batchSize Maximum number of IDs per batch
   * @param {String} operationId Operation ID for tracking
   * @returns {Promise<Object>} Combined result
   */
  async combineCloudinaryChunksInBatches(cloudinaryIds, outputFormat, batchSize = 20, operationId = 'unknown') {
    try {
      logger.info(`Combining ${cloudinaryIds.length} Cloudinary resources in batches of ${batchSize}`, {
        operationId,
        outputFormat
      });
      
      // Split IDs into batches
      const batches = [];
      for (let i = 0; i < cloudinaryIds.length; i += batchSize) {
        batches.push(cloudinaryIds.slice(i, i + batchSize));
      }
      
      logger.info(`Split into ${batches.length} batches`, { operationId });
      
      // Process each batch
      const batchResults = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        logger.info(`Processing batch ${i+1}/${batches.length} (${batch.length} items)`, {
          operationId
        });
        
        try {
          // Create ZIP for this batch
          const batchResult = await cloudinaryHelper.createZipArchive(batch, {
            resourceType: ['jpg', 'png'].includes(outputFormat) ? 'image' : 'raw',
            folder: 'pdfspark_results',
            publicId: `batch${i+1}_${Date.now()}_${operationId}`
          });
          
          batchResults.push({
            batchIndex: i,
            cloudinaryPublicId: batchResult.public_id,
            cloudinaryUrl: batchResult.secure_url,
            itemCount: batch.length
          });
          
          logger.info(`Batch ${i+1} ZIP created successfully`, {
            operationId,
            publicId: batchResult.public_id
          });
        } catch (batchError) {
          logger.error(`Error creating ZIP for batch ${i+1}`, {
            error: batchError.message,
            operationId
          });
          
          // Add error info but continue with other batches
          batchResults.push({
            batchIndex: i,
            error: batchError.message,
            itemCount: batch.length,
            items: batch // Include the ids so they're not lost
          });
        }
      }
      
      // Handle different result cases
      const successfulBatches = batchResults.filter(b => !b.error);
      
      // If we have at least one successful batch
      if (successfulBatches.length > 0) {
        logger.info(`${successfulBatches.length}/${batches.length} batches processed successfully`, {
          operationId
        });
        
        // If all batches successful and only one batch, return it directly
        if (successfulBatches.length === batches.length && successfulBatches.length === 1) {
          return {
            format: outputFormat,
            isZipped: true,
            cloudinaryPublicId: successfulBatches[0].cloudinaryPublicId,
            cloudinaryUrl: successfulBatches[0].cloudinaryUrl,
            chunksCount: cloudinaryIds.length,
            batched: false
          };
        }
        
        // Return information about all batch results
        return {
          format: outputFormat,
          isMultiBatch: true,
          batchCount: batches.length,
          successfulBatches: successfulBatches.length,
          batches: batchResults,
          chunksCount: cloudinaryIds.length,
          batchSize
        };
      } else {
        // All batches failed, return error
        throw new Error(`All ${batches.length} batches failed to process`);
      }
    } catch (error) {
      logger.error(`Error in batch processing`, {
        error: error.message,
        stack: error.stack,
        operationId
      });
      
      // Return error result
      return {
        format: outputFormat,
        isMultipart: true,
        error: error.message,
        batchProcessingFailed: true,
        cloudinaryIds: cloudinaryIds.length,
        errorDetails: 'Failed to process in batches'
      };
    }
  }
}

// Create singleton instance
const chunkedPdfProcessor = new ChunkedPdfProcessor({
  railwayMode: !!process.env.RAILWAY_SERVICE_NAME,
  maxChunkSize: process.env.PDF_MAX_CHUNK_SIZE 
    ? parseInt(process.env.PDF_MAX_CHUNK_SIZE) 
    : undefined,
  minChunkableSize: process.env.PDF_MIN_CHUNKABLE_SIZE
    ? parseInt(process.env.PDF_MIN_CHUNKABLE_SIZE)
    : undefined
});

module.exports = {
  ChunkedPdfProcessor,
  chunkedPdfProcessor
};