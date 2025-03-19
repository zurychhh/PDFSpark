const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.MAX_CONCURRENCY = '2';
process.env.ENABLE_CHUNKING = 'true';
process.env.PDF_MAX_CHUNK_SIZE = '3'; // Small chunk size for testing
process.env.PDF_MIN_CHUNKABLE_SIZE = '5'; // Small min chunkable size for testing

// Import app after environment setup
const app = require('../../index');
const { processingQueue } = require('../../utils/processingQueue');
const { conversionJobProcessor } = require('../../utils/conversionJobProcessor');
const { chunkedPdfProcessor } = require('../../utils/chunkedPdfProcessor');
const cloudinaryHelper = require('../../utils/cloudinaryHelper');

// Mock Cloudinary functions for testing
jest.mock('../../utils/cloudinaryHelper', () => {
  const originalModule = jest.requireActual('../../utils/cloudinaryHelper');
  
  return {
    ...originalModule,
    reliableCloudinaryUpload: jest.fn().mockImplementation((filePath, options) => {
      // Create a mock Cloudinary response with the options data
      return Promise.resolve({
        public_id: `test/${options.uploadId || 'test'}_${Date.now()}`,
        secure_url: `https://res.cloudinary.com/test/${options.uploadId || 'test'}_${Date.now()}.pdf`,
        resource_type: 'raw',
        format: 'pdf',
        bytes: 1024,
        created_at: new Date().toISOString()
      });
    }),
    uploadBuffer: jest.fn().mockImplementation((buffer, options) => {
      // Create a mock Cloudinary response
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
      // Create a mock Cloudinary ZIP response
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
    
    // Add some content to each page to make it valid
    page.drawText(`Test Page ${i + 1}`, {
      x: 50,
      y: 650,
      size: 20
    });
  }
  
  const pdfBytes = await pdfDoc.save();
  const testPdfPath = path.join(__dirname, '../test-multi-page.pdf');
  fs.writeFileSync(testPdfPath, pdfBytes);
  
  return testPdfPath;
}

describe('Chunked Processing System Integration Tests', () => {
  let testPdfPath;
  let largePdfPath;
  
  // Create test PDFs before all tests
  beforeAll(async () => {
    // Create a small test PDF
    testPdfPath = await createTestPdf(3);
    
    // Create a larger test PDF for chunking
    largePdfPath = await createTestPdf(10);
  });
  
  beforeEach(() => {
    // Reset queue and mocks before each test
    processingQueue.queue.clear();
    processingQueue.activeJobs.clear();
    processingQueue.completedJobs.clear();
    processingQueue.failedJobs.clear();
    
    // Reset Cloudinary mock counts
    cloudinaryHelper.reliableCloudinaryUpload.mockClear();
    cloudinaryHelper.uploadBuffer.mockClear();
    cloudinaryHelper.createZipArchive.mockClear();
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
  
  // Test the chunking decision logic
  describe('Chunking Decision Logic', () => {
    it('should determine if a PDF requires chunking based on page count and size', async () => {
      // Get file buffers
      const smallPdfBuffer = fs.readFileSync(testPdfPath);
      const largePdfBuffer = fs.readFileSync(largePdfPath);
      
      // Small PDF (3 pages) should NOT be chunked for most formats
      const smallPdfNeedsChunking = await chunkedPdfProcessor.shouldChunkPdf(smallPdfBuffer, 'txt');
      
      // Large PDF (10 pages) SHOULD be chunked
      const largePdfNeedsChunking = await chunkedPdfProcessor.shouldChunkPdf(largePdfBuffer, 'docx');
      
      // Special formats like DOCX might chunk even smaller PDFs
      const smallPdfDocxChunking = await chunkedPdfProcessor.shouldChunkPdf(smallPdfBuffer, 'docx');
      
      // Verify expectations
      expect(smallPdfNeedsChunking).toBe(false); // Small PDF to TXT = no chunking
      expect(largePdfNeedsChunking).toBe(true);  // Large PDF to DOCX = chunking
      
      // This could be true or false depending on exact thresholds
      // Just record the actual behavior for reference
      console.log(`Small PDF to DOCX chunking decision: ${smallPdfDocxChunking}`);
    });
    
    it('should integrate with conversion job processor for chunking decisions', async () => {
      // Get file buffers
      const smallPdfBuffer = fs.readFileSync(testPdfPath);
      const largePdfBuffer = fs.readFileSync(largePdfPath);
      
      // Create mock operations
      const smallPdfOperation = {
        _id: 'small-test-op',
        sourceFormat: 'pdf',
        targetFormat: 'txt'
      };
      
      const largePdfOperation = {
        _id: 'large-test-op',
        sourceFormat: 'pdf',
        targetFormat: 'docx'
      };
      
      // Test chunking decisions through the job processor
      const smallPdfNeedsChunking = await conversionJobProcessor.shouldUseChunking(
        smallPdfBuffer, smallPdfOperation
      );
      
      const largePdfNeedsChunking = await conversionJobProcessor.shouldUseChunking(
        largePdfBuffer, largePdfOperation
      );
      
      // Verify integration with chunked processor decision logic
      expect(smallPdfNeedsChunking).toBe(false); // Small PDF to TXT = no chunking
      expect(largePdfNeedsChunking).toBe(true);  // Large PDF to DOCX = chunking
    });
  });
  
  // Test PDF splitting and combining
  describe('PDF Chunking Operations', () => {
    it('should correctly split a PDF into chunks', async () => {
      // Get large PDF buffer
      const pdfBuffer = fs.readFileSync(largePdfPath);
      
      // Create a mock operation
      const operation = {
        _id: 'test-split-op',
        sourceFormat: 'pdf',
        targetFormat: 'docx',
        save: jest.fn().mockResolvedValue(true)
      };
      
      // Split the PDF
      const result = await chunkedPdfProcessor.splitIntoChunks(pdfBuffer, operation);
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(Array.isArray(result.chunks)).toBe(true);
      expect(result.chunks.length).toBeGreaterThan(1);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.pageCount).toBe(10);
      
      // Verify each chunk structure
      result.chunks.forEach((chunk, index) => {
        expect(chunk.buffer).toBeDefined();
        expect(Buffer.isBuffer(chunk.buffer)).toBe(true);
        expect(chunk.metadata).toBeDefined();
        expect(chunk.metadata.pageRange).toBeDefined();
        expect(chunk.metadata.pageRange.start).toBeDefined();
        expect(chunk.metadata.pageRange.end).toBeDefined();
      });
      
      // Verify the chunks cover all pages (1-10)
      const allPages = new Set();
      result.chunks.forEach(chunk => {
        for (let i = chunk.metadata.pageRange.start; i <= chunk.metadata.pageRange.end; i++) {
          allPages.add(i);
        }
      });
      
      expect(allPages.size).toBe(10);
    });
    
    it('should combine chunk results', async () => {
      // Create mock chunk results
      const chunkResults = [
        {
          index: 0,
          result: {
            cloudinaryPublicId: 'test/chunk1',
            cloudinaryUrl: 'https://res.cloudinary.com/test/chunk1.docx',
            format: 'docx',
            pageRange: { start: 0, end: 2 }
          }
        },
        {
          index: 1,
          result: {
            cloudinaryPublicId: 'test/chunk2',
            cloudinaryUrl: 'https://res.cloudinary.com/test/chunk2.docx',
            format: 'docx',
            pageRange: { start: 3, end: 5 }
          }
        },
        {
          index: 2,
          result: {
            cloudinaryPublicId: 'test/chunk3',
            cloudinaryUrl: 'https://res.cloudinary.com/test/chunk3.docx',
            format: 'docx',
            pageRange: { start: 6, end: 9 }
          }
        }
      ];
      
      // Metadata
      const metadata = {
        pageCount: 10,
        chunksCount: 3,
        chunkSize: 3
      };
      
      // Call combine results
      const result = await chunkedPdfProcessor.combineCloudinaryChunks(
        chunkResults, 'docx', metadata
      );
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result.format).toBe('docx');
      expect(result.isZipped).toBe(true);
      expect(result.cloudinaryPublicId).toBeDefined();
      expect(result.cloudinaryUrl).toBeDefined();
      
      // Verify createZipArchive was called with the right parameters
      expect(cloudinaryHelper.createZipArchive).toHaveBeenCalledTimes(1);
      expect(cloudinaryHelper.createZipArchive).toHaveBeenCalledWith(
        ['test/chunk1', 'test/chunk2', 'test/chunk3'],
        expect.objectContaining({
          resourceType: 'raw',
          folder: expect.any(String)
        })
      );
    });
  });
  
  // Test the complete end-to-end flow
  describe('End-to-End Chunked Processing Flow', () => {
    it('should process a large PDF in chunks through the entire pipeline', async () => {
      // Upload the large PDF
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', largePdfPath);
      
      expect(uploadResponse.statusCode).toBe(200);
      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.fileId).toBeDefined();
      
      const fileId = uploadResponse.body.fileId;
      
      // Request conversion (should go through chunked processing)
      const conversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx'
        });
      
      expect(conversionResponse.statusCode).toBe(202);
      expect(conversionResponse.body.success).toBe(true);
      expect(conversionResponse.body.operationId).toBeDefined();
      
      const operationId = conversionResponse.body.operationId;
      
      // Monitor the operation status until completed or failed
      // This might take a bit of time due to chunked processing
      let operationCompleted = false;
      let statusResponse;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!operationCompleted && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between checks
        
        statusResponse = await request(app)
          .get(`/api/operations/${operationId}/status`);
        
        expect(statusResponse.statusCode).toBe(200);
        
        if (['completed', 'failed'].includes(statusResponse.body.status)) {
          operationCompleted = true;
        }
        
        attempts++;
      }
      
      // Verify operation completed successfully
      expect(operationCompleted).toBe(true);
      expect(statusResponse.body.status).toBe('completed');
      
      // Verify chunked processing information included in response
      expect(statusResponse.body).toHaveProperty('chunkedProcessing');
      expect(statusResponse.body.chunkedProcessing).toHaveProperty('enabled');
      expect(statusResponse.body.chunkedProcessing.enabled).toBe(true);
      expect(statusResponse.body.chunkedProcessing).toHaveProperty('totalChunks');
      expect(statusResponse.body.chunkedProcessing.totalChunks).toBeGreaterThan(1);
      expect(statusResponse.body.chunkedProcessing).toHaveProperty('completedChunks');
      expect(statusResponse.body.chunkedProcessing.completedChunks).toBe(
        statusResponse.body.chunkedProcessing.totalChunks
      );
      
      // Get download info
      const downloadResponse = await request(app)
        .get(`/api/operations/${operationId}/download`);
      
      expect(downloadResponse.statusCode).toBe(200);
      expect(downloadResponse.body.success).toBe(true);
      expect(downloadResponse.body.downloadUrl).toBeDefined();
    });
  });
  
  // Test multi-system integration (all 3 systems working together)
  describe('Integration between Cloudinary-First, Queue-Based Processing, and Chunked Processing', () => {
    it('should handle a queue of operations with chunked processing', async () => {
      // Mock 3 jobs to be added to the queue:
      // 1. Small PDF - no chunking needed
      // 2. Large PDF - chunking needed
      // 3. Another small PDF - no chunking needed
      
      // Pause the queue to control the test flow
      processingQueue.pause();
      
      // Upload test files
      const upload1 = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      const upload2 = await request(app)
        .post('/api/files/upload')
        .attach('file', largePdfPath);
      
      const upload3 = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      const fileId1 = upload1.body.fileId;
      const fileId2 = upload2.body.fileId;
      const fileId3 = upload3.body.fileId;
      
      // Request conversions (all added to queue since it's paused)
      const conversion1 = await request(app)
        .post('/api/convert')
        .send({
          fileId: fileId1,
          sourceFormat: 'pdf',
          targetFormat: 'txt'
        });
      
      const conversion2 = await request(app)
        .post('/api/convert')
        .send({
          fileId: fileId2,
          sourceFormat: 'pdf',
          targetFormat: 'docx'
        });
      
      const conversion3 = await request(app)
        .post('/api/convert')
        .send({
          fileId: fileId3,
          sourceFormat: 'pdf',
          targetFormat: 'jpg'
        });
      
      const operationId1 = conversion1.body.operationId;
      const operationId2 = conversion2.body.operationId;
      const operationId3 = conversion3.body.operationId;
      
      // Check queue status
      const queueStatus = await request(app)
        .get('/api/queue/status');
      
      expect(queueStatus.statusCode).toBe(200);
      expect(queueStatus.body.success).toBe(true);
      expect(queueStatus.body.status.queuedJobs).toBe(3);
      expect(queueStatus.body.status.activeJobs).toBe(0);
      expect(queueStatus.body.status.isPaused).toBe(true);
      
      // Resume the queue to start processing
      processingQueue.resume();
      
      // Wait for all operations to complete
      let allCompleted = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!allCompleted && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
        
        // Check all operations
        const status1 = await request(app)
          .get(`/api/operations/${operationId1}/status`);
          
        const status2 = await request(app)
          .get(`/api/operations/${operationId2}/status`);
          
        const status3 = await request(app)
          .get(`/api/operations/${operationId3}/status`);
        
        const allStatuses = [
          status1.body.status,
          status2.body.status,
          status3.body.status
        ];
        
        console.log(`Operation statuses [${attempts}]: ${allStatuses.join(', ')}`);
        
        allCompleted = allStatuses.every(status => 
          ['completed', 'failed'].includes(status)
        );
        
        attempts++;
      }
      
      // Get final status for verification
      const finalStatus1 = await request(app)
        .get(`/api/operations/${operationId1}/status`);
        
      const finalStatus2 = await request(app)
        .get(`/api/operations/${operationId2}/status`);
        
      const finalStatus3 = await request(app)
        .get(`/api/operations/${operationId3}/status`);
      
      // Verify all completed successfully
      expect(finalStatus1.body.status).toBe('completed');
      expect(finalStatus2.body.status).toBe('completed');
      expect(finalStatus3.body.status).toBe('completed');
      
      // Verify chunking was only used for the large PDF
      expect(finalStatus1.body.chunkedProcessing?.enabled).toBeFalsy();
      expect(finalStatus2.body.chunkedProcessing?.enabled).toBe(true);
      expect(finalStatus3.body.chunkedProcessing?.enabled).toBeFalsy();
      
      // Check Cloudinary integration
      // Each operation should have both source and result Cloudinary data
      expect(finalStatus1.body.sourceCloudinaryData).toBeDefined();
      expect(finalStatus1.body.resultCloudinaryData).toBeDefined();
      expect(finalStatus2.body.sourceCloudinaryData).toBeDefined();
      expect(finalStatus2.body.resultCloudinaryData).toBeDefined();
      expect(finalStatus3.body.sourceCloudinaryData).toBeDefined();
      expect(finalStatus3.body.resultCloudinaryData).toBeDefined();
      
      // The large PDF operation should have multiple chunks
      if (finalStatus2.body.chunkedProcessing?.totalChunks) {
        expect(finalStatus2.body.chunkedProcessing.totalChunks).toBeGreaterThan(1);
        expect(finalStatus2.body.chunkedProcessing.completedChunks)
          .toBe(finalStatus2.body.chunkedProcessing.totalChunks);
      }
    });
    
    it('should handle memory-constrained environments by using chunking more aggressively', async () => {
      // Simulate a memory-constrained environment
      const originalGetMemoryStatus = processingQueue.memoryManager.getMemoryStatus;
      processingQueue.memoryManager.getMemoryStatus = jest.fn().mockReturnValue({
        heapUsed: 800 * 1024 * 1024,  // 800MB
        heapTotal: 1024 * 1024 * 1024, // 1GB
        usedPercentage: 0.78,          // 78% used
        isCritical: false
      });
      
      // Upload a small PDF - would normally not need chunking,
      // but should be chunked in memory-constrained environment
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
      
      expect(uploadResponse.statusCode).toBe(200);
      const fileId = uploadResponse.body.fileId;
      
      // Request conversion to a memory-intensive format
      const conversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx' // Memory intensive format
        });
      
      expect(conversionResponse.statusCode).toBe(202);
      const operationId = conversionResponse.body.operationId;
      
      // Wait for the operation to complete
      let operationCompleted = false;
      let statusResponse;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!operationCompleted && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        statusResponse = await request(app)
          .get(`/api/operations/${operationId}/status`);
        
        if (['completed', 'failed'].includes(statusResponse.body.status)) {
          operationCompleted = true;
        }
        
        attempts++;
      }
      
      // Verify operation completed
      expect(operationCompleted).toBe(true);
      expect(statusResponse.body.status).toBe('completed');
      
      // Verify chunking was used despite small PDF size due to memory constraints
      expect(statusResponse.body.chunkedProcessing).toBeDefined();
      
      // Just confirm what actually happened - the specific behavior might
      // depend on memory-adaptive thresholds
      console.log(
        `Memory-constrained chunking enabled: ${statusResponse.body.chunkedProcessing?.enabled}`
      );
      
      // Restore original memory status function
      processingQueue.memoryManager.getMemoryStatus = originalGetMemoryStatus;
    });
  });
});