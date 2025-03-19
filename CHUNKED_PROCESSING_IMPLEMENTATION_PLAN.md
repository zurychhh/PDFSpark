# Chunked Processing Implementation Plan

## Overview

The Chunked Processing system addresses a critical challenge in the Railway deployment environment: memory constraints when processing large PDF files. By breaking large operations into smaller, manageable chunks, we can prevent memory exhaustion and ensure stable operation even with limited resources.

This system works in conjunction with the recently implemented Queue-Based Processing and Cloudinary-First strategies, creating a robust solution for Railway's constrained environment.

## Architectural Components

### 1. ChunkedProcessor Class

A core class that orchestrates the chunked processing workflow:

```javascript
class ChunkedProcessor {
  constructor(options = {}) {
    this.maxChunkSize = options.maxChunkSize || 5; // Max pages per chunk
    this.minChunkableSize = options.minChunkableSize || 10; // Min pages to trigger chunking
    this.tempDir = options.tempDir || process.env.TEMP_DIR || './temp';
    // ...
  }
  
  async processInChunks(operation, fileBuffer, processor) {
    // 1. Analyze the file to determine if chunking is needed
    // 2. If needed, split into chunks
    // 3. Process each chunk
    // 4. Combine results
    // 5. Clean up temporary files
  }
  
  // Helper methods for splitting, combining, etc.
}
```

### 2. PDF-Specific Implementation: ChunkedPdfProcessor

Specializes in handling PDF document chunking:

```javascript
class ChunkedPdfProcessor extends ChunkedProcessor {
  constructor(options = {}) {
    super(options);
    // PDF-specific settings
  }
  
  async splitPdfIntoChunks(pdfBuffer) {
    // Use pdf-lib to split the PDF into multiple smaller PDFs
  }
  
  async combinePdfResults(chunkResults) {
    // Combine processed chunk results back into a single document
  }
  
  // Other PDF-specific methods
}
```

### 3. Integration with Queue-Based Processing

The chunking process will be integrated with the existing queue system:

```javascript
// In conversionJobProcessor.js
async process(jobData) {
  // ...existing code...
  
  // Check if file is large enough to require chunking
  if (await this.shouldUseChunking(fileBuffer, jobData.targetFormat)) {
    // Use chunked processing pathway
    return await this.chunkedPdfProcessor.processInChunks(
      operation,
      fileBuffer,
      this.processChunk.bind(this)
    );
  } else {
    // Use regular processing pathway
    return await this.processFile(operation, fileBuffer);
  }
}
```

## Memory Management Approach

### 1. Dynamic Memory Thresholds

```javascript
// Determine if chunking is needed based on file size, format, and memory availability
async shouldUseChunking(fileBuffer, targetFormat) {
  const fileSize = fileBuffer.length;
  const memoryStatus = this.memoryManager.getMemoryStatus();
  
  // Base decision on multiple factors
  const fileSizeThreshold = 5 * 1024 * 1024; // 5MB
  const memoryThreshold = 0.7; // 70% memory usage
  
  // For complex conversions like PDF to DOCX, use a lower threshold
  const formatFactor = ['docx', 'xlsx'].includes(targetFormat) ? 0.5 : 1;
  
  return (
    fileSize > fileSizeThreshold * formatFactor || 
    memoryStatus.usedPercentage > memoryThreshold
  );
}
```

### 2. Resource Estimation

```javascript
// Estimate resources needed for a given file and conversion type
estimateResources(fileBuffer, sourceFormat, targetFormat) {
  const fileSize = fileBuffer.length;
  
  // Base memory requirement - these are example values
  const baseMemory = fileSize * 6; // Approx 6x file size for PDF processing
  
  // Format-specific multipliers
  const formatMultipliers = {
    'pdf-to-docx': 8,
    'pdf-to-xlsx': 7,
    'pdf-to-jpg': 4,
    'pdf-to-png': 5,
    'pdf-to-txt': 2
  };
  
  const key = `${sourceFormat}-to-${targetFormat}`;
  const multiplier = formatMultipliers[key] || 3; // Default multiplier
  
  return {
    estimatedMemoryBytes: baseMemory * multiplier,
    estimatedTimeMs: fileSize * multiplier / 1024, // Rough time estimate
    recommendedChunks: Math.ceil(fileSize / (2 * 1024 * 1024)) // ~2MB per chunk
  };
}
```

## Implementation Strategy

### Phase 1: Core Chunking Framework

1. Create the `ChunkedProcessor` base class
2. Implement `ChunkedPdfProcessor` for PDF-specific operations
3. Add chunking decision logic to job processor
4. Implement basic page-based chunking for PDF-to-X conversions

### Phase 2: Format-Specific Optimizations

1. Optimize PDF-to-DOCX chunked processing
2. Implement PDF-to-Image chunked rendering
3. Add custom chunk sizes based on memory availability
4. Implement efficient temporary storage cleanup

### Phase 3: Advanced Features

1. Add progress tracking per chunk
2. Implement parallel chunk processing (with concurrency limits)
3. Add chunk processing prioritization
4. Implement result caching to prevent duplicate work

## Handling Failures

```javascript
async processInChunks(operation, fileBuffer, processor) {
  try {
    // Split the file into chunks
    const chunks = await this.splitPdfIntoChunks(fileBuffer);
    
    // Process each chunk
    const chunkResults = [];
    let failedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await processor(chunks[i], {
          chunkIndex: i,
          totalChunks: chunks.length,
          pageRange: chunks[i].pageRange
        });
        
        chunkResults.push(result);
      } catch (chunkError) {
        failedChunks.push({
          index: i,
          error: chunkError.message
        });
        
        // Continue with other chunks despite failure
      }
    }
    
    // If too many chunks failed, throw error
    if (failedChunks.length > chunks.length / 2) {
      throw new Error(`Too many chunks failed: ${failedChunks.length}/${chunks.length}`);
    }
    
    // Combine successful chunks
    return await this.combineResults(chunkResults, failedChunks);
  } catch (error) {
    // Fall back to non-chunked processing if chunking itself fails
    this.logger.error('Chunked processing failed, falling back to standard processing', {
      error: error.message
    });
    
    return await processor(fileBuffer, { isFullFile: true });
  }
}
```

## Integration with Cloudinary

```javascript
async processChunk(chunkBuffer, chunkInfo) {
  try {
    // Process the chunk
    const processedChunkBuffer = await this.convertPdfChunk(
      chunkBuffer,
      chunkInfo.sourceFormat,
      chunkInfo.targetFormat
    );
    
    // Upload processed chunk to Cloudinary
    const chunkId = `chunk_${chunkInfo.operationId}_${chunkInfo.chunkIndex}`;
    const cloudinaryResult = await this.cloudinaryHelper.uploadBuffer(
      processedChunkBuffer,
      {
        public_id: chunkId,
        folder: 'pdfspark_chunks',
        resource_type: 'auto'
      }
    );
    
    // Return chunk result with Cloudinary reference
    return {
      chunkIndex: chunkInfo.chunkIndex,
      cloudinaryId: cloudinaryResult.public_id,
      cloudinaryUrl: cloudinaryResult.secure_url,
      pageRange: chunkInfo.pageRange
    };
  } catch (error) {
    this.logger.error('Error processing chunk', {
      chunkIndex: chunkInfo.chunkIndex,
      error: error.message
    });
    throw error;
  }
}
```

## API Enhancements

The API will be enhanced to provide detailed information about chunked processing:

1. Operation status will include chunk information:
   ```json
   {
     "status": "processing",
     "progress": 45,
     "chunks": {
       "total": 5,
       "completed": 2,
       "processing": 1,
       "pending": 2,
       "failed": 0
     }
   }
   ```

2. New endpoints for managing chunks:
   - `GET /api/operations/:id/chunks` - List all chunks of an operation
   - `GET /api/operations/:id/chunks/:chunkId` - Get specific chunk status

## Performance Considerations

1. **Memory Release**: Explicit garbage collection after each chunk
   ```javascript
   // After processing a chunk
   if (global.gc) {
     global.gc();
   }
   ```

2. **Buffer Management**: Use streams where possible to reduce memory footprint
   ```javascript
   const outputStream = fs.createWriteStream(outputPath);
   await convertBufferToStream(chunkBuffer, outputStream);
   ```

3. **Cloudinary Integration**: Store intermediate chunks in Cloudinary to free local storage
   ```javascript
   // After each chunk is processed, immediately upload to Cloudinary
   // and remove local copy
   ```

## Timeline

1. **Week 1**: Core framework implementation
   - Base ChunkedProcessor class
   - PDF chunking implementation
   - Integration with job processor

2. **Week 2**: Format-specific optimizations
   - PDF-to-DOCX chunking
   - PDF-to-Image chunking
   - Testing and performance tuning

3. **Week 3**: Advanced features
   - Parallel processing
   - Caching
   - API enhancements

## Risk Mitigation

1. **Fallback Strategy**: If chunking fails, fall back to standard processing
2. **Progressive Implementation**: Start with simple page-based chunking, then add advanced features
3. **Comprehensive Monitoring**: Add detailed logging for chunk processing for easier debugging
4. **Memory Guards**: Add memory monitoring to prevent chunk size from exceeding available memory

## Conclusion

The Chunked Processing system will significantly improve the reliability and performance of PDFSpark's conversion operations in Railway's constrained environment. By breaking large operations into manageable chunks, we can process files of any size while maintaining stable memory usage and providing a robust user experience.

This system completes the trifecta of Railway optimizations:
1. Cloudinary-First Strategy for reliable storage
2. Queue-Based Processing for resource management
3. Chunked Processing for handling large operations

Together, these systems create a comprehensive solution for ensuring PDFSpark's reliability in Railway's containerized environment.