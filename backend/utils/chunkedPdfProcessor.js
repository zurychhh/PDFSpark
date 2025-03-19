/**
 * Chunked PDF Processor
 * 
 * Specializes in processing PDF documents in chunks to prevent
 * memory exhaustion in Railway's constrained environment.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { ChunkedProcessor } = require('./chunkedProcessor');
const logger = require('./logger');
const cloudinaryHelper = require('./cloudinaryHelper');

/**
 * ChunkedPdfProcessor class
 * Handles splitting and combining PDF documents for chunked processing
 */
class ChunkedPdfProcessor extends ChunkedProcessor {
  constructor(options = {}) {
    super(options);
    
    // PDF-specific options
    this.pageBasedChunking = options.pageBasedChunking !== false;
    this.pdfPasswordProtected = options.pdfPasswordProtected || false;
    this.pdfPassword = options.pdfPassword || '';
    
    // Format-specific chunk sizes
    this.formatChunkSizes = {
      'docx': 3,   // 3 pages per chunk for PDF to DOCX
      'xlsx': 2,   // 2 pages per chunk for PDF to XLSX
      'pptx': 5,   // 5 pages per chunk for PDF to PPTX
      'jpg': 10,   // 10 pages per chunk for PDF to JPG
      'png': 8,    // 8 pages per chunk for PDF to PNG
      'txt': 20    // 20 pages per chunk for PDF to TXT
    };
    
    logger.info('ChunkedPdfProcessor initialized', {
      pageBasedChunking: this.pageBasedChunking,
      formatChunkSizes: this.formatChunkSizes
    });
  }
  
  /**
   * Determine if a PDF should be processed in chunks
   * @param {Buffer} pdfBuffer The PDF buffer
   * @param {String} targetFormat The target format
   * @returns {Promise<Boolean>} True if chunking is recommended
   */
  async shouldChunkPdf(pdfBuffer, targetFormat) {
    try {
      // Load PDF to check number of pages
      const pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: this.pdfPasswordProtected,
        password: this.pdfPassword,
        updateMetadata: false // Minimize memory usage during inspection
      });
      
      const pageCount = pdfDoc.getPageCount();
      
      // Get format-specific chunk size
      const formatMaxChunkSize = this.formatChunkSizes[targetFormat] || this.maxChunkSize;
      
      // Determine minimum page count that benefits from chunking
      const minChunkablePages = Math.max(formatMaxChunkSize * 2, this.minChunkableSize);
      
      // Check file size (for memory consideration)
      const fileSizeCheck = super.shouldUseChunking(pdfBuffer, 'pdf', targetFormat);
      
      // Memory usage check from parent
      const memoryLimited = this.memoryManager?.getMemoryStatus().usedPercentage > 0.7;
      
      // Log decision factors
      logger.debug('PDF chunking decision factors', {
        pageCount,
        formatMaxChunkSize,
        minChunkablePages,
        bufferSize: pdfBuffer.length,
        fileSizeCheck,
        memoryLimited,
        targetFormat
      });
      
      // Use chunking if:
      // 1. PDF has many pages, OR
      // 2. File size is large, OR
      // 3. Memory is already limited
      return pageCount > minChunkablePages || fileSizeCheck || memoryLimited;
    } catch (error) {
      logger.error('Error analyzing PDF for chunking decision', {
        error: error.message
      });
      
      // Default to true if we can't analyze - better safe than OOM
      return true;
    }
  }
  
  /**
   * Split a PDF into chunks
   * @param {Buffer} pdfBuffer The PDF buffer
   * @param {Object} operation The operation object
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Object with chunks array and metadata
   */
  async splitIntoChunks(pdfBuffer, operation, options = {}) {
    const targetFormat = operation.targetFormat;
    const operationId = operation._id;
    
    try {
      // Load PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer, {
        ignoreEncryption: this.pdfPasswordProtected,
        password: this.pdfPassword
      });
      
      const pageCount = pdfDoc.getPageCount();
      
      // Get format-specific chunk size
      const formatMaxChunkSize = this.formatChunkSizes[targetFormat] || this.maxChunkSize;
      
      // Calculate optimal chunk size based on page count and memory
      const chunkSize = this.calculateChunkSize(pageCount, {
        maxChunkSize: formatMaxChunkSize,
        minChunkSize: 1
      });
      
      logger.info(`Splitting ${pageCount} page PDF into chunks of ${chunkSize} pages`, {
        operationId,
        targetFormat
      });
      
      // Calculate number of chunks
      const numChunks = Math.ceil(pageCount / chunkSize);
      
      // Create chunks
      const chunks = [];
      
      for (let i = 0; i < numChunks; i++) {
        // Calculate page range for this chunk
        const startPage = i * chunkSize;
        const endPage = Math.min((i + 1) * chunkSize - 1, pageCount - 1);
        const chunkPageCount = endPage - startPage + 1;
        
        logger.debug(`Creating chunk ${i+1}/${numChunks} with pages ${startPage}-${endPage}`, {
          operationId
        });
        
        // Create a new PDF for this chunk
        const chunkPdf = await PDFDocument.create();
        
        // Copy pages from original PDF
        const pageIndices = Array.from(
          { length: chunkPageCount }, 
          (_, index) => startPage + index
        );
        
        const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
        
        // Add pages to chunk PDF
        copiedPages.forEach(page => {
          chunkPdf.addPage(page);
        });
        
        // Save chunk to buffer
        const chunkPdfBytes = await chunkPdf.save();
        
        // Add to chunks array
        chunks.push({
          buffer: Buffer.from(chunkPdfBytes),
          metadata: {
            pageRange: { start: startPage, end: endPage },
            pageCount: chunkPageCount
          }
        });
        
        // Force garbage collection to free memory if available
        if (global.gc) {
          global.gc();
        }
      }
      
      // Return chunks and metadata
      return {
        chunks,
        metadata: {
          pageCount,
          chunksCount: chunks.length,
          chunkSize
        }
      };
    } catch (error) {
      logger.error('Error splitting PDF into chunks', {
        error: error.message,
        operationId
      });
      
      throw new Error(`Failed to split PDF: ${error.message}`);
    }
  }
  
  /**
   * Combine chunk results back into a single PDF
   * @param {Array} chunkResults The results from processing each chunk
   * @param {Array} failedChunks Information about failed chunks
   * @param {Object} metadata Additional metadata from the splitting process
   * @returns {Promise<Object>} The combined result
   */
  async combineResults(chunkResults, failedChunks, metadata) {
    try {
      logger.info(`Combining ${chunkResults.length} PDF chunk results`);
      
      // Sort chunk results by index to ensure correct order
      chunkResults.sort((a, b) => a.index - b.index);
      
      // For PDF-to-X conversions, most formats can't be directly combined
      // Instead, we typically have Cloudinary URLs for the individual results
      
      // For PDF-to-PDF (like compression), create a combined PDF
      if (chunkResults.length > 0 && 
          chunkResults[0].result?.format === 'pdf') {
        return await this.combinePdfChunks(chunkResults, metadata);
      }
      
      // For images, text, or office documents, create a ZIP file
      // or use Cloudinary ZIP generation (preferred for Railway)
      const outputFormat = chunkResults[0]?.result?.format || 'unknown';
      
      // Cloudinary-First approach: combine chunk results using Cloudinary
      return await this.combineCloudinaryChunks(chunkResults, outputFormat, metadata);
    } catch (error) {
      logger.error('Error combining chunk results', {
        error: error.message
      });
      
      throw new Error(`Failed to combine chunk results: ${error.message}`);
    }
  }
  
  /**
   * Combine PDF chunk results into a single PDF
   * @param {Array} chunkResults Array of chunk results
   * @param {Object} metadata Metadata about the original PDF
   * @returns {Promise<Object>} Combined result
   */
  async combinePdfChunks(chunkResults, metadata) {
    try {
      logger.info('Combining PDF chunks into single PDF');
      
      // Create a new PDF
      const combinedPdf = await PDFDocument.create();
      
      // For each chunk, download from Cloudinary and add to combined PDF
      for (const chunkResult of chunkResults) {
        const { result } = chunkResult;
        
        if (!result.cloudinaryUrl) {
          logger.warn(`Chunk ${chunkResult.index} missing Cloudinary URL, skipping`);
          continue;
        }
        
        try {
          // Download PDF from Cloudinary
          const response = await fetch(result.cloudinaryUrl);
          if (!response.ok) {
            throw new Error(`Failed to download chunk: ${response.status}`);
          }
          
          const chunkBuffer = await response.arrayBuffer();
          
          // Load chunk PDF
          const chunkPdf = await PDFDocument.load(chunkBuffer);
          
          // Copy pages to combined PDF
          const pageIndices = Array.from(
            { length: chunkPdf.getPageCount() }, 
            (_, index) => index
          );
          
          const copiedPages = await combinedPdf.copyPages(chunkPdf, pageIndices);
          
          // Add pages to combined PDF
          copiedPages.forEach(page => {
            combinedPdf.addPage(page);
          });
        } catch (chunkError) {
          logger.error(`Error adding chunk ${chunkResult.index} to combined PDF`, {
            error: chunkError.message
          });
        }
      }
      
      // Save combined PDF
      const combinedPdfBytes = await combinedPdf.save();
      const combinedBuffer = Buffer.from(combinedPdfBytes);
      
      // Upload combined result to Cloudinary
      logger.info('Uploading combined PDF to Cloudinary');
      const uploadResult = await cloudinaryHelper.uploadBuffer(
        combinedBuffer,
        {
          folder: 'pdfspark_results',
          resource_type: 'raw',
          format: 'pdf'
        }
      );
      
      return {
        format: 'pdf',
        cloudinaryPublicId: uploadResult.public_id,
        cloudinaryUrl: uploadResult.secure_url,
        pageCount: combinedPdf.getPageCount(),
        fileSize: combinedBuffer.length
      };
    } catch (error) {
      logger.error('Error combining PDF chunks', {
        error: error.message
      });
      
      throw new Error(`Failed to combine PDF chunks: ${error.message}`);
    }
  }
  
  /**
   * Combine non-PDF chunk results using Cloudinary
   * @param {Array} chunkResults Array of chunk results
   * @param {String} outputFormat Output format (docx, txt, etc.)
   * @param {Object} metadata Metadata about the original PDF
   * @returns {Promise<Object>} Combined result with Cloudinary URL
   */
  async combineCloudinaryChunks(chunkResults, outputFormat, metadata) {
    try {
      logger.info(`Combining ${chunkResults.length} ${outputFormat} chunks via Cloudinary`);
      
      // Extract Cloudinary public IDs from chunks
      const cloudinaryIds = chunkResults
        .filter(chunk => chunk.result?.cloudinaryPublicId)
        .map(chunk => chunk.result.cloudinaryPublicId);
      
      if (cloudinaryIds.length === 0) {
        throw new Error('No valid Cloudinary IDs found in chunks');
      }
      
      // For single-chunk results, just return the chunk result
      if (cloudinaryIds.length === 1) {
        logger.info('Only one chunk result, using it directly');
        return chunkResults[0].result;
      }
      
      // Different approaches based on output format
      let result;
      
      if (['jpg', 'png'].includes(outputFormat)) {
        // For images, create a ZIP archive using Cloudinary
        result = await cloudinaryHelper.createZipArchive(cloudinaryIds, {
          resourceType: 'image',
          folder: 'pdfspark_results',
          publicId: `combined_${Date.now()}`
        });
      } else if (['docx', 'xlsx', 'pptx', 'txt'].includes(outputFormat)) {
        // For documents, create a ZIP archive using Cloudinary
        result = await cloudinaryHelper.createZipArchive(cloudinaryIds, {
          resourceType: 'raw',
          folder: 'pdfspark_results',
          publicId: `combined_${Date.now()}`
        });
      } else {
        // Fallback to returning array of chunk results
        logger.warn(`No combination strategy for format: ${outputFormat}, returning array`);
        
        return {
          format: outputFormat,
          isMultipart: true,
          cloudinaryIds,
          chunkResults: chunkResults.map(chunk => ({
            index: chunk.index,
            cloudinaryUrl: chunk.result.cloudinaryUrl,
            cloudinaryPublicId: chunk.result.cloudinaryPublicId,
            pageRange: chunk.result.pageRange
          }))
        };
      }
      
      return {
        format: outputFormat,
        isZipped: true,
        cloudinaryPublicId: result.public_id,
        cloudinaryUrl: result.secure_url,
        originalPageCount: metadata.pageCount
      };
    } catch (error) {
      logger.error(`Error combining ${outputFormat} chunks`, {
        error: error.message
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