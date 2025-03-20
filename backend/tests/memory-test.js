/**
 * Memory and Call Stack Diagnostics Test
 * 
 * This script performs diagnostics on memory usage and call stack depth
 * to help identify issues with memory leaks and maximum call stack size errors.
 * 
 * Run with:
 * DEBUG=pdfspark:memory*,pdfspark:stack* node --expose-gc tests/memory-test.js
 */

// Import required modules
const path = require('path');
const fs = require('fs');
const createDebug = require('../utils/debugLogger');
const { PDFDocument } = require('pdf-lib');
const { chunkedPdfProcessor } = require('../utils/chunkedPdfProcessor');
const { processingQueue } = require('../utils/processingQueue');

// Create debug loggers
const debug = createDebug('pdfspark:memory-test');
const memoryDebug = debug.extend('memory');
const stackDebug = debug.extend('stack');
const pdfDebug = createDebug('pdfspark:pdf');

// Configuration
const TEST_MODES = {
  BASIC: 'basic',
  LARGE_FILE: 'large-file',
  DEEP_RECURSION: 'deep-recursion',
  CHUNKING: 'chunking',
  QUEUE: 'queue'
};

const testMode = process.argv[2] || TEST_MODES.BASIC;
const reportFrequency = 100; // How often to report memory (in ms)

console.log(`Running memory diagnostic test: ${testMode}`);

// Helper functions
function forceGC() {
  if (global.gc) {
    memoryDebug.info('Running forced garbage collection...');
    global.gc();
    return true;
  } else {
    memoryDebug.warn('Garbage collection not available. Run with --expose-gc flag.');
    return false;
  }
}

// Create a temporary large PDF file for testing
async function createLargePdfFile(pages = 100, filePath = 'temp-large.pdf') {
  memoryDebug.info(`Creating test PDF with ${pages} pages...`);
  
  const trace = pdfDebug.traceFunction('createLargePdfFile', pages);
  
  const pdfDoc = await PDFDocument.create();
  
  memoryDebug.trackMemory('After PDF document creation');
  
  // Create pages in small batches to avoid memory issues
  const batchSize = 10;
  
  for (let batchStart = 0; batchStart < pages; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, pages);
    memoryDebug.info(`Creating pages ${batchStart + 1}-${batchEnd}...`);
    
    for (let i = batchStart; i < batchEnd; i++) {
      const page = pdfDoc.addPage([500, 700]);
      page.drawText(`Test Page ${i + 1}`, { x: 50, y: 650, size: 20 });
      
      // Add some content to make the page larger
      for (let j = 0; j < 10; j++) {
        page.drawText(`Line ${j + 1} of test content for page ${i + 1}`, { 
          x: 50, 
          y: 600 - (j * 20), 
          size: 12 
        });
      }
    }
    
    memoryDebug.trackMemory(`After adding batch of pages ${batchStart + 1}-${batchEnd}`);
    
    // Force GC after each batch
    if (batchStart + batchSize < pages) {
      forceGC();
    }
  }
  
  memoryDebug.info('Saving PDF to file...');
  const pdfBytes = await pdfDoc.save();
  
  memoryDebug.trackMemory('After PDF save to bytes');
  
  fs.writeFileSync(filePath, pdfBytes);
  memoryDebug.info(`Test PDF created at ${filePath} (${pdfBytes.length} bytes)`);
  
  trace.exit();
  return filePath;
}

// Test function that creates deep recursive calls
function testDeepRecursion(depth, maxDepth) {
  // Track the stack when we're near breaking point
  if (depth % 100 === 0) {
    stackDebug.trackMemory(`Recursion depth: ${depth}`);
    stackDebug.stack(`Current recursion depth: ${depth}/${maxDepth}`);
  }
  
  // Base case
  if (depth >= maxDepth) {
    stackDebug.info(`Reached maximum depth: ${maxDepth}`);
    return depth;
  }
  
  // Recursive case - create some memory pressure
  const obj = { 
    depth, 
    data: `Recursion level ${depth}`
  };
  
  // Call the next level
  return testDeepRecursion(depth + 1, maxDepth);
}

// Test function that simulates memory-intensive operation with buffers
function testLargeMemoryAllocation(sizeMB, hold = true) {
  memoryDebug.info(`Allocating ${sizeMB}MB buffer...`);
  const trace = memoryDebug.traceFunction('testLargeMemoryAllocation', sizeMB);
  
  memoryDebug.trackMemory('Before allocation');
  
  // Allocate buffer of specified size
  const buffer = Buffer.alloc(sizeMB * 1024 * 1024);
  
  // Fill buffer with some data
  for (let i = 0; i < buffer.length; i += 1024) {
    buffer[i] = i % 256;
  }
  
  memoryDebug.trackMemory('After allocation and fill');
  
  // Hold reference to buffer unless told not to
  if (!hold) {
    memoryDebug.info('Releasing buffer reference...');
    // No explicit need to set to null, it will go out of scope
  } else {
    memoryDebug.info('Holding buffer reference...');
    return trace.exit(buffer);
  }
  
  trace.exit(null);
  return null;
}

// Test chunked processing
async function testChunkedProcessing() {
  const trace = pdfDebug.traceFunction('testChunkedProcessing');
  
  memoryDebug.info('Testing chunked PDF processing...');
  memoryDebug.trackMemory('Before creating test PDF');
  
  // Create a test PDF
  const testPdfPath = await createLargePdfFile(50, 'temp-chunked.pdf');
  const pdfBuffer = fs.readFileSync(testPdfPath);
  
  memoryDebug.trackMemory('After loading PDF into buffer');
  
  // Setup target format
  const targetFormat = 'txt';
  
  // First check if we should use chunking
  memoryDebug.info('Checking if PDF should be processed in chunks...');
  
  // Process using chunkedPdfProcessor
  memoryDebug.info('Starting chunked processing...');
  try {
    // Create a mock operation object (normally comes from MongoDB)
    const mockOperation = {
      _id: `test-operation-${Date.now()}`,
      sourceFormat: 'pdf',
      targetFormat: targetFormat,
      status: 'created',
      progress: 0,
      save: async () => mockOperation // Mock the save method
    };
    
    // First check if this PDF should be chunked
    const shouldChunk = await chunkedPdfProcessor.shouldChunkPdf(pdfBuffer, targetFormat, mockOperation);
    memoryDebug.info(`Should chunk PDF: ${shouldChunk}`);
    
    if (!shouldChunk) {
      memoryDebug.info('PDF is small enough to process directly, skipping chunking test');
      trace.exit({ chunked: false });
      return { chunked: false };
    }
    
    // Define a function to process each chunk
    const processChunkFn = async (chunkBuffer, chunkInfo) => {
      memoryDebug.info(`Processing chunk ${chunkInfo.chunkIndex + 1}/${chunkInfo.totalChunks}`);
      memoryDebug.trackMemory(`Before processing chunk ${chunkInfo.chunkIndex + 1}`);
      
      // Simulate processing the chunk (in a real scenario, this would convert to TXT)
      await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work
      
      // Return a mock result for this chunk
      return {
        format: targetFormat,
        cloudinaryPublicId: `test-chunk-${chunkInfo.chunkIndex}`,
        cloudinaryUrl: `https://example.com/test-chunk-${chunkInfo.chunkIndex}.${targetFormat}`,
        pageRange: chunkInfo.metadata.pageRange
      };
    };
    
    // Process the PDF in chunks
    const result = await chunkedPdfProcessor.processInChunks(
      mockOperation,
      pdfBuffer,
      processChunkFn,
      { targetFormat }
    );
    
    memoryDebug.info(`Chunked processing completed successfully`);
    memoryDebug.trackMemory('After chunked processing');
    
    // Clean up temp file
    fs.unlinkSync(testPdfPath);
    memoryDebug.info('Test file cleaned up');
    
    trace.exit({ chunked: true, result });
    return { chunked: true, result };
  } catch (error) {
    pdfDebug.error('Chunked processing error: %s', error.message);
    stackDebug.getStack();
    trace.exit({ error: error.message });
    return null;
  }
}

// Test processing queue
async function testProcessingQueue() {
  const trace = debug.traceFunction('testProcessingQueue');
  
  memoryDebug.info('Testing processing queue...');
  memoryDebug.trackMemory('Before queue test');
  
  // Get the existing processing queue
  const { processingQueue } = require('../utils/processingQueue');
  
  // Save original concurrency
  const originalConcurrency = processingQueue.maxConcurrency;
  
  // Set test concurrency 
  const maxConcurrency = 3;
  processingQueue.maxConcurrency = maxConcurrency;
  
  // Create job results lookup map
  const jobPromises = new Map();
  
  // Create test jobs
  const jobCount = 10;
  
  // Function to wrap a job with promise resolution
  function createJobProcessor(jobId, bufferSize) {
    return async (data) => {
      memoryDebug.info(`Processing job ${jobId}...`);
      memoryDebug.trackMemory(`Start of job ${jobId}`);
      
      // Simulate work
      const buffer = Buffer.alloc(bufferSize * 1024 * 1024);
      
      // Fill buffer with some data
      for (let j = 0; j < Math.min(buffer.length, 1024 * 1024); j += 1024) {
        buffer[j] = j % 256;
      }
      
      memoryDebug.trackMemory(`Job ${jobId} after allocation`);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force GC if possible
      forceGC();
      
      memoryDebug.trackMemory(`Job ${jobId} completed`);
      return { success: true, jobId };
    };
  }
  
  // Add event listeners to track job completion
  const jobResults = [];
  processingQueue.on('jobCompleted', (job) => {
    memoryDebug.info(`Job ${job.id} completed event received`);
    jobResults.push(job.result);
    
    // Resolve promise if we were tracking this job
    const resolver = jobPromises.get(job.id);
    if (resolver) {
      resolver.resolve(job.result);
      jobPromises.delete(job.id);
    }
  });
  
  processingQueue.on('jobFailed', (job, error) => {
    memoryDebug.warn(`Job ${job.id} failed: ${error.message}`);
    
    // Reject promise if we were tracking this job
    const resolver = jobPromises.get(job.id);
    if (resolver) {
      resolver.reject(error);
      jobPromises.delete(job.id);
    }
  });
  
  // Add jobs to queue
  for (let i = 0; i < jobCount; i++) {
    const jobId = `job-${i}-${Date.now()}`;
    const bufferSize = 10 + (i % 5) * 10; // Varying sizes from 10MB to 50MB
    
    // Create promise for this job
    const jobPromise = new Promise((resolve, reject) => {
      jobPromises.set(jobId, { resolve, reject });
    });
    
    // Create job data
    const jobData = {
      priority: 5,
      maxAttempts: 2,
      jobNumber: i,
      fileSize: bufferSize * 1024 * 1024, // For memory estimates
      estimatedMemoryMB: bufferSize // Help queue prioritization
    };
    
    // Add to queue
    processingQueue.addJob(
      jobId,
      jobData,
      5, // priority
      createJobProcessor(jobId, bufferSize)
    );
    
    memoryDebug.info(`Added job ${jobId} to queue (size: ${bufferSize}MB)`);
  }
  
  memoryDebug.info(`Added ${jobCount} jobs to queue with concurrency ${maxConcurrency}`);
  
  // Wait for all jobs to complete (timeout after 30 seconds)
  try {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Queue test timed out')), 30000);
    });
    
    // Create array of promises from the map values
    const promises = Array.from(jobPromises.values()).map(
      resolver => new Promise((resolve, reject) => {
        resolver.resolve = resolve;
        resolver.reject = reject;
      })
    );
    
    // Wait for all jobs or timeout
    await Promise.race([
      Promise.all(promises),
      timeout
    ]);
    
    memoryDebug.info('All queue jobs completed');
  } catch (error) {
    memoryDebug.error(`Queue test error: ${error.message}`);
  }
  
  // Restore original concurrency
  processingQueue.maxConcurrency = originalConcurrency;
  
  // Remove event listeners
  processingQueue.removeAllListeners('jobCompleted');
  processingQueue.removeAllListeners('jobFailed');
  
  memoryDebug.trackMemory('After queue processing');
  
  // Force GC
  forceGC();
  memoryDebug.trackMemory('After final GC');
  
  trace.exit({ jobCount, results: jobResults.length });
  return jobResults;
}

// Run different test modes
async function runTest() {
  memoryDebug.info('Starting memory diagnostic test...');
  memoryDebug.trackMemory('Initial memory state');
  
  // Output Node.js version and memory limits
  memoryDebug.info('Node.js version: %s', process.version);
  memoryDebug.info('Initial heap limits: %o', {
    heapSizeLimit: (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2) + ' MB',
    environment: process.env.NODE_ENV || 'development'
  });
  
  // Setup memory usage monitoring
  const memoryMonitoringInterval = setInterval(() => {
    memoryDebug.trackMemory('Periodic memory check');
  }, reportFrequency);
  
  try {
    // Run appropriate test based on mode
    switch (testMode) {
      case TEST_MODES.BASIC:
        memoryDebug.info('Running basic memory test...');
        
        // Allocate and release memory in steps
        for (let size = 10; size <= 100; size += 10) {
          const buffer = testLargeMemoryAllocation(size, false);
          memoryDebug.trackMemory(`After allocating and releasing ${size}MB`);
          forceGC();
        }
        break;
        
      case TEST_MODES.LARGE_FILE:
        memoryDebug.info('Running large file test...');
        
        // Create a large PDF file
        const pdfPath = await createLargePdfFile(100, 'temp-large.pdf');
        
        // Read it in chunks
        memoryDebug.info('Reading large file in chunks...');
        const stats = fs.statSync(pdfPath);
        memoryDebug.info(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
        
        // Read in 10MB chunks
        const chunkSize = 10 * 1024 * 1024;
        const fileHandle = fs.openSync(pdfPath, 'r');
        
        let position = 0;
        let chunkNumber = 1;
        
        while (position < stats.size) {
          const buffer = Buffer.alloc(Math.min(chunkSize, stats.size - position));
          const bytesRead = fs.readSync(fileHandle, buffer, 0, buffer.length, position);
          
          memoryDebug.info(`Read chunk ${chunkNumber}: ${(bytesRead / (1024 * 1024)).toFixed(2)} MB`);
          memoryDebug.trackMemory(`After reading chunk ${chunkNumber}`);
          
          position += bytesRead;
          chunkNumber++;
          
          // Don't keep buffer reference
          // Process buffer here if needed
          
          // Force GC between chunks
          forceGC();
        }
        
        fs.closeSync(fileHandle);
        
        // Clean up
        fs.unlinkSync(pdfPath);
        memoryDebug.info('Large file test completed and file cleaned up');
        break;
        
      case TEST_MODES.DEEP_RECURSION:
        memoryDebug.info('Running deep recursion test...');
        
        try {
          // Test recursive calls with increasing depth
          for (let depth = 100; depth <= 1000; depth += 100) {
            stackDebug.info(`Testing recursion to depth ${depth}...`);
            const result = testDeepRecursion(1, depth);
            stackDebug.info(`Recursion test to depth ${depth} completed`);
            stackDebug.trackMemory(`After recursion to depth ${depth}`);
            forceGC();
          }
          
          // Now try to find the breaking point
          try {
            // This might cause a stack overflow, so we wrap it in try-catch
            const maxDepth = 10000; // This is likely to cause an error
            stackDebug.warn(`Attempting recursion to extreme depth ${maxDepth} - might cause stack overflow`);
            testDeepRecursion(1, maxDepth);
          } catch (error) {
            stackDebug.error('Deep recursion error: %s', error.message);
            // Get call stack at point of failure
            stackDebug.getStack();
          }
        } catch (error) {
          stackDebug.error('Recursion test error: %s', error.message);
        }
        break;
        
      case TEST_MODES.CHUNKING:
        memoryDebug.info('Running chunked processing test...');
        await testChunkedProcessing();
        break;
        
      case TEST_MODES.QUEUE:
        memoryDebug.info('Running processing queue test...');
        await testProcessingQueue();
        break;
        
      default:
        memoryDebug.warn('Unknown test mode: %s', testMode);
        memoryDebug.info('Available modes: %o', Object.values(TEST_MODES));
    }
    
    // Final memory check
    memoryDebug.info('Test completed, checking final memory state...');
    forceGC();
    memoryDebug.trackMemory('Final memory state');
    
  } catch (error) {
    memoryDebug.error('Test error: %s', error.message);
    stackDebug.getStack();
  } finally {
    // Clean up and report
    clearInterval(memoryMonitoringInterval);
    
    memoryDebug.info('Memory diagnostic test completed');
    memoryDebug.info('To deploy with optimized memory settings, use:');
    memoryDebug.info('node --max-old-space-size=2048 --expose-gc railway-entry.js');
  }
}

// Run the test
runTest().catch(error => {
  console.error('Unhandled test error:', error);
  process.exit(1);
});