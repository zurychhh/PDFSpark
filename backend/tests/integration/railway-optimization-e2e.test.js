/**
 * End-to-End Test for Railway Optimizations
 * 
 * This test verifies the integration between all three Railway optimization systems:
 * 1. Cloudinary-First Storage
 * 2. Queue-Based Processing
 * 3. Chunked Processing
 * 
 * And the Transaction-Based Operation Updates that ensure database consistency.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.MAX_CONCURRENCY = '2';
process.env.ENABLE_CHUNKING = 'true';
process.env.PDF_MAX_CHUNK_SIZE = '3';
process.env.PDF_MIN_CHUNKABLE_SIZE = '5';
process.env.RAILWAY_SPECIFIC_CONFIG = 'true';
process.env.OPTIMIZE_FOR_RAILWAY = 'true';

// Import key components
const app = require('../../index');
const { processingQueue } = require('../../utils/processingQueue');
const { chunkedPdfProcessor } = require('../../utils/chunkedPdfProcessor');
const { transactionManager } = require('../../utils/transactionManager');
const cloudinaryHelper = require('../../utils/cloudinaryHelper');
const Operation = require('../../models/Operation');

// Mock Cloudinary functions
jest.mock('../../utils/cloudinaryHelper', () => {
  const originalModule = jest.requireActual('../../utils/cloudinaryHelper');
  
  return {
    ...originalModule,
    reliableCloudinaryUpload: jest.fn().mockImplementation((filePath, options) => {
      return Promise.resolve({
        public_id: `test/${options.uploadId || 'test'}_${Date.now()}`,
        secure_url: `https://res.cloudinary.com/test/${options.uploadId || 'test'}_${Date.now()}.pdf`,
        resource_type: 'raw',
        format: path.extname(filePath).slice(1) || 'pdf',
        bytes: 1024,
        created_at: new Date().toISOString()
      });
    }),
    uploadBuffer: jest.fn().mockImplementation((buffer, options) => {
      return Promise.resolve({
        public_id: `test/buffer_${Date.now()}`,
        secure_url: `https://res.cloudinary.com/test/buffer_${Date.now()}.${options.format || 'pdf'}`,
        resource_type: options.resource_type || 'raw',
        format: options.format || 'pdf',
        bytes: buffer.length,
        created_at: new Date().toISOString()
      });
    }),
    createZipArchive: jest.fn().mockImplementation((cloudinaryIds, options) => {
      return Promise.resolve({
        public_id: `test/${options.publicId || 'zip'}_${Date.now()}`,
        secure_url: `https://res.cloudinary.com/test/${options.publicId || 'zip'}_${Date.now()}.zip`,
        resource_type: 'raw',
        format: 'zip',
        bytes: 2048,
        created_at: new Date().toISOString()
      });
    })
  };
});

// Helper to create test PDF of specified page count
async function createTestPdf(pageCount = 10) {
  const pdfDoc = await PDFDocument.create();
  
  // Add specified number of pages
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([500, 700]);
    page.drawText(`Test Page ${i + 1}`, { x: 50, y: 650, size: 20 });
  }
  
  const pdfBytes = await pdfDoc.save();
  const testPdfPath = path.join(__dirname, '../test-railway-pdf.pdf');
  fs.writeFileSync(testPdfPath, pdfBytes);
  
  return testPdfPath;
}

describe('Railway Optimization Strategy E2E Tests', () => {
  let testPdfPath;
  let largePdfPath;
  
  // Create test PDFs before all tests
  beforeAll(async () => {
    // Create a small test PDF (3 pages)
    testPdfPath = await createTestPdf(3);
    
    // Create a larger test PDF for chunking (15 pages)
    largePdfPath = await createTestPdf(15);
  });
  
  beforeEach(() => {
    // Reset queue before each test
    processingQueue.queue.clear();
    processingQueue.activeJobs.clear();
    processingQueue.completedJobs.clear();
    processingQueue.failedJobs.clear();
    
    // Reset Cloudinary mock counts
    cloudinaryHelper.reliableCloudinaryUpload.mockClear();
    cloudinaryHelper.uploadBuffer.mockClear();
    cloudinaryHelper.createZipArchive.mockClear();
    
    // Start with queue unpaused
    processingQueue.resume();
  });
  
  afterAll(() => {
    // Clean up after tests
    processingQueue.stop();
    
    // Delete test PDFs
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
    if (fs.existsSync(largePdfPath)) {
      fs.unlinkSync(largePdfPath);
    }
  });
  
  describe('End-to-End Conversion Flow', () => {
    it('should process both small and large PDFs with proper optimizations', async () => {
      // PART 1: Process a small PDF that shouldn't need chunking
      
      // Upload small PDF
      const smallUploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      expect(smallUploadResponse.statusCode).toBe(200);
      expect(smallUploadResponse.body.success).toBe(true);
      expect(smallUploadResponse.body.fileId).toBeDefined();
      
      const smallFileId = smallUploadResponse.body.fileId;
      
      // Request conversion for small PDF
      const smallConversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId: smallFileId,
          sourceFormat: 'pdf',
          targetFormat: 'txt' // Choose a format that shouldn't need chunking
        });
      
      expect(smallConversionResponse.statusCode).toBe(202);
      expect(smallConversionResponse.body.success).toBe(true);
      expect(smallConversionResponse.body.operationId).toBeDefined();
      
      const smallOperationId = smallConversionResponse.body.operationId;
      
      // PART 2: Process a large PDF that should use chunking
      
      // Upload large PDF
      const largeUploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', largePdfPath);
      
      expect(largeUploadResponse.statusCode).toBe(200);
      expect(largeUploadResponse.body.success).toBe(true);
      expect(largeUploadResponse.body.fileId).toBeDefined();
      
      const largeFileId = largeUploadResponse.body.fileId;
      
      // Request conversion for large PDF (with memory-intensive format)
      const largeConversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId: largeFileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx' // Choose a format that should need chunking
        });
      
      expect(largeConversionResponse.statusCode).toBe(202);
      expect(largeConversionResponse.body.success).toBe(true);
      expect(largeConversionResponse.body.operationId).toBeDefined();
      
      const largeOperationId = largeConversionResponse.body.operationId;
      
      // PART 3: Verify both conversions are in the queue
      
      const queueStatusResponse = await request(app)
        .get('/api/queue/status');
      
      expect(queueStatusResponse.statusCode).toBe(200);
      expect(queueStatusResponse.body.success).toBe(true);
      
      // Total jobs in queue and processing should be 2 or less
      // (might be less if processing already started)
      const totalJobs = queueStatusResponse.body.status.queuedJobs + 
                        queueStatusResponse.body.status.activeJobs;
      expect(totalJobs).toBeLessThanOrEqual(2);
      
      // PART 4: Wait for both operations to complete
      
      // This will take a while, so we'll poll both operations until they complete
      
      // Function to check operation status
      async function checkOperationStatus(operationId) {
        const response = await request(app)
          .get(`/api/operations/${operationId}/status`);
        
        expect(response.statusCode).toBe(200);
        return response.body;
      }
      
      // Wait for both operations to complete with timeout
      const maxAttempts = 20;
      const pollIntervalMs = 500;
      
      let smallCompleted = false;
      let largeCompleted = false;
      let attempts = 0;
      
      while ((!smallCompleted || !largeCompleted) && attempts < maxAttempts) {
        // Check small operation status if not completed
        if (!smallCompleted) {
          const smallStatus = await checkOperationStatus(smallOperationId);
          if (['completed', 'failed'].includes(smallStatus.status)) {
            smallCompleted = true;
            console.log(`Small operation ${smallOperationId} status: ${smallStatus.status}`);
            
            // Verify chunking wasn't used
            if (smallStatus.chunkedProcessing) {
              expect(smallStatus.chunkedProcessing.enabled).toBeFalsy();
            }
          }
        }
        
        // Check large operation status if not completed
        if (!largeCompleted) {
          const largeStatus = await checkOperationStatus(largeOperationId);
          if (['completed', 'failed'].includes(largeStatus.status)) {
            largeCompleted = true;
            console.log(`Large operation ${largeOperationId} status: ${largeStatus.status}`);
            
            // Verify chunking was used
            expect(largeStatus.chunkedProcessing).toBeDefined();
            expect(largeStatus.chunkedProcessing.enabled).toBe(true);
            expect(largeStatus.chunkedProcessing.totalChunks).toBeGreaterThan(1);
          }
        }
        
        // Wait before next check
        if (!smallCompleted || !largeCompleted) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        
        attempts++;
      }
      
      // PART 5: Verify both operations completed successfully
      
      // Final status check for both operations
      const finalSmallStatus = await checkOperationStatus(smallOperationId);
      const finalLargeStatus = await checkOperationStatus(largeOperationId);
      
      expect(finalSmallStatus.status).toBe('completed');
      expect(finalLargeStatus.status).toBe('completed');
      
      // PART 6: Verify download URLs are available
      
      // Check small PDF download
      const smallDownloadResponse = await request(app)
        .get(`/api/operations/${smallOperationId}/download`);
      
      expect(smallDownloadResponse.statusCode).toBe(200);
      expect(smallDownloadResponse.body.success).toBe(true);
      expect(smallDownloadResponse.body.downloadUrl).toBeDefined();
      
      // Check large PDF download
      const largeDownloadResponse = await request(app)
        .get(`/api/operations/${largeOperationId}/download`);
      
      expect(largeDownloadResponse.statusCode).toBe(200);
      expect(largeDownloadResponse.body.success).toBe(true);
      expect(largeDownloadResponse.body.downloadUrl).toBeDefined();
      
      // PART 7: Verify Cloudinary integration
      
      // Both operations should have used Cloudinary
      // Source files should have been uploaded to Cloudinary
      expect(cloudinaryHelper.reliableCloudinaryUpload).toHaveBeenCalled();
      
      // Chunked processing should have generated chunks and combined them
      if (finalLargeStatus.chunkedProcessing.totalChunks > 1) {
        // Should have created chunks and potentially a ZIP file
        expect(cloudinaryHelper.uploadBuffer).toHaveBeenCalled();
      }
    });
  });
  
  describe('Transaction-Based Operation Updates', () => {
    it('should maintain operation state consistency during processing', async () => {
      // Spy on transaction manager
      const transactionSpy = jest.spyOn(transactionManager, 'executeWithTransaction');
      
      // Upload a test PDF
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      const fileId = uploadResponse.body.fileId;
      
      // Request conversion
      const conversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'txt'
        });
      
      const operationId = conversionResponse.body.operationId;
      
      // Wait for operation to complete
      let operationCompleted = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!operationCompleted && attempts < maxAttempts) {
        const statusResponse = await request(app)
          .get(`/api/operations/${operationId}/status`);
        
        if (['completed', 'failed'].includes(statusResponse.body.status)) {
          operationCompleted = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }
      
      // Verify transaction was used
      expect(transactionSpy).toHaveBeenCalled();
      
      // Get the final operation
      const operation = await Operation.findById(operationId);
      
      if (operation) {
        // Verify operation is in consistent state
        expect(operation.status).toBe('completed');
        expect(operation.progress).toBe(100);
        expect(operation.resultFileId).toBeDefined();
        expect(operation.resultDownloadUrl).toBeDefined();
        expect(operation.completedAt).toBeDefined();
        
        // If source Cloudinary data exists, it should be in a consistent state
        if (operation.sourceCloudinaryData) {
          expect(operation.sourceCloudinaryData.publicId).toBeDefined();
          expect(operation.sourceCloudinaryData.secureUrl).toBeDefined();
        }
        
        // If result Cloudinary data exists, it should be in a consistent state
        if (operation.resultCloudinaryData) {
          expect(operation.resultCloudinaryData.publicId).toBeDefined();
          expect(operation.resultCloudinaryData.secureUrl).toBeDefined();
        }
      }
    });
    
    it('should handle operation failures with transaction consistency', async () => {
      // Create a failing scenario - we'll modify the processing queue
      // to make the next job fail
      
      // Save original method to restore later
      const originalExecuteProcessor = processingQueue.executeProcessor;
      
      // Replace with failing method
      processingQueue.executeProcessor = jest.fn().mockImplementation(job => {
        // Simulate a processor failure
        return Promise.reject(new Error('Simulated processor failure'));
      });
      
      // Upload a test PDF
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      const fileId = uploadResponse.body.fileId;
      
      // Request conversion
      const conversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'txt'
        });
      
      const operationId = conversionResponse.body.operationId;
      
      // Wait for operation to fail
      let operationFailed = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!operationFailed && attempts < maxAttempts) {
        const statusResponse = await request(app)
          .get(`/api/operations/${operationId}/status`);
        
        if (statusResponse.body.status === 'failed') {
          operationFailed = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }
      
      // Verify operation is in consistent failed state
      const failedStatus = await request(app)
        .get(`/api/operations/${operationId}/status`);
      
      expect(failedStatus.body.status).toBe('failed');
      expect(failedStatus.body.errorMessage).toBeDefined();
      
      // Restore original method
      processingQueue.executeProcessor = originalExecuteProcessor;
    });
  });
  
  describe('Memory Management Integration', () => {
    it('should adjust processing based on memory pressure', async () => {
      // Save original memory status method
      const originalGetMemoryStatus = processingQueue.memoryManager.getMemoryStatus;
      
      // First, simulate normal memory conditions
      processingQueue.memoryManager.getMemoryStatus = jest.fn().mockReturnValue({
        heapUsed: 200 * 1024 * 1024,  // 200MB
        heapTotal: 1024 * 1024 * 1024, // 1GB
        usedPercentage: 0.2,           // 20% used
        isCritical: false
      });
      
      // Get initial queue state with normal memory
      const normalMemoryQueue = await request(app)
        .get('/api/queue/status');
      
      const initialConcurrency = normalMemoryQueue.body.status.maxConcurrency;
      
      // Now, simulate high memory pressure
      processingQueue.memoryManager.getMemoryStatus = jest.fn().mockReturnValue({
        heapUsed: 800 * 1024 * 1024,  // 800MB
        heapTotal: 1024 * 1024 * 1024, // 1GB
        usedPercentage: 0.8,           // 80% used
        isCritical: false
      });
      
      // Trigger memory check
      processingQueue.checkMemory();
      
      // Get queue status with high memory pressure
      const highMemoryQueue = await request(app)
        .get('/api/queue/status');
      
      // Verify concurrency was reduced
      expect(highMemoryQueue.body.status.maxConcurrency).toBeLessThan(initialConcurrency);
      
      // Finally, simulate critical memory
      processingQueue.memoryManager.getMemoryStatus = jest.fn().mockReturnValue({
        heapUsed: 900 * 1024 * 1024,  // 900MB
        heapTotal: 1024 * 1024 * 1024, // 1GB
        usedPercentage: 0.9,           // 90% used
        isCritical: true
      });
      
      // Trigger memory check
      processingQueue.checkMemory();
      
      // Get queue status with critical memory
      const criticalMemoryQueue = await request(app)
        .get('/api/queue/status');
      
      // Verify queue is paused
      expect(criticalMemoryQueue.body.status.isPaused).toBe(true);
      
      // Restore original method
      processingQueue.memoryManager.getMemoryStatus = originalGetMemoryStatus;
      
      // Resume queue for other tests
      processingQueue.resume();
    });
  });
});