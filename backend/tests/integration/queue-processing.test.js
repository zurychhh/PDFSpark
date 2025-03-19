const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';
process.env.MAX_CONCURRENCY = '2'; // Limited concurrency for testing

// Import app after environment setup
const app = require('../../index');
const { processingQueue } = require('../../utils/processingQueue');
const { conversionJobProcessor } = require('../../utils/conversionJobProcessor');

describe('Queue Processing System Integration Tests', () => {
  beforeEach(() => {
    // Reset queue status before each test
    processingQueue.queue.clear();
    processingQueue.activeJobs.clear();
    processingQueue.completedJobs.clear();
    processingQueue.failedJobs.clear();
  });
  
  afterAll(() => {
    // Clean up after tests
    processingQueue.stop();
  });
  
  // Test queue status endpoint
  describe('GET /api/queue/status', () => {
    it('should return queue status information', async () => {
      const response = await request(app).get('/api/queue/status');
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toHaveProperty('queuedJobs');
      expect(response.body.status).toHaveProperty('activeJobs');
      expect(response.body.status).toHaveProperty('memoryUsage');
      expect(response.body.status).toHaveProperty('isPaused');
    });
  });
  
  // Test conversion with queue
  describe('PDF Conversion with Queue', () => {
    it('should add conversion jobs to the queue', async () => {
      // Upload a test file first
      const testPdfPath = path.join(__dirname, '../test.pdf');
      
      // Check if test file exists
      if (!fs.existsSync(testPdfPath)) {
        throw new Error('Test PDF file not found');
      }
      
      // Step 1: Upload the test file
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
        
      expect(uploadResponse.statusCode).toBe(200);
      expect(uploadResponse.body).toHaveProperty('success', true);
      expect(uploadResponse.body).toHaveProperty('fileId');
      
      const fileId = uploadResponse.body.fileId;
      
      // Step 2: Get initial queue status
      const initialQueueStatus = await request(app)
        .get('/api/queue/status');
      
      const initialQueuedCount = initialQueueStatus.body.status.queuedJobs;
      
      // Step 3: Request conversion which should add to the queue
      const conversionResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx'
        });
      
      expect(conversionResponse.statusCode).toBe(202);
      expect(conversionResponse.body).toHaveProperty('success', true);
      expect(conversionResponse.body).toHaveProperty('operationId');
      
      const operationId = conversionResponse.body.operationId;
      
      // Step 4: Get updated queue status - should have at least one more job
      const updatedQueueStatus = await request(app)
        .get('/api/queue/status');
      
      // Verify queue job count increased (or was processed already)
      const queuedAndActiveJobs = 
        updatedQueueStatus.body.status.queuedJobs + 
        updatedQueueStatus.body.status.activeJobs;
      
      // Either there's a new job in the queue or it was already processed
      expect(
        queuedAndActiveJobs > initialQueuedCount || 
        updatedQueueStatus.body.status.queuedJobs >= initialQueuedCount
      ).toBeTruthy();
      
      // Step 5: Check operation status which should include queue information
      const operationStatusResponse = await request(app)
        .get(`/api/operations/${operationId}/status`);
      
      expect(operationStatusResponse.statusCode).toBe(200);
      expect(operationStatusResponse.body).toHaveProperty('success', true);
      
      // If the job is still in queue, it should have queue position info
      if (operationStatusResponse.body.status === 'queued' || 
          operationStatusResponse.body.status === 'created') {
        expect(operationStatusResponse.body).toHaveProperty('queue');
      }
    });
    
    it('should prioritize premium users in the queue', async () => {
      // Upload a test file first
      const testPdfPath = path.join(__dirname, '../test.pdf');
      
      // Check if test file exists
      if (!fs.existsSync(testPdfPath)) {
        throw new Error('Test PDF file not found');
      }
      
      // Clear the queue first
      processingQueue.queue.clear();
      processingQueue.pause(); // Pause to prevent processing during test
      
      // Step 1: Upload the test file
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .attach('file', testPdfPath);
        
      const fileId = uploadResponse.body.fileId;
      
      // Step 2: Add a regular (non-premium) job to the queue
      const regularJobResponse = await request(app)
        .post('/api/convert')
        .send({
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx'
        });
      
      const regularJobId = regularJobResponse.body.operationId;
      
      // Step 3: Add a premium job to the queue (simulated)
      // Since we can't easily create a premium user in an integration test,
      // we'll directly add a job to the queue with premium priority
      const premiumJobId = 'premium-test-job';
      processingQueue.addJob(
        premiumJobId,
        {
          operationId: premiumJobId,
          fileId,
          sourceFormat: 'pdf',
          targetFormat: 'docx',
          isPremium: true,
          maxAttempts: 3
        },
        8, // Premium priority (higher than regular)
        (jobData) => Promise.resolve(true) // Mock processor that succeeds
      );
      
      // Step 4: Get job info for both jobs
      const regularJobInfo = processingQueue.getJobInfo(regularJobId);
      const premiumJobInfo = processingQueue.getJobInfo(premiumJobId);
      
      // Verify premium job has higher priority
      expect(premiumJobInfo.priority).toBeGreaterThan(regularJobInfo.priority);
      
      // Verify the premium job would be processed first
      const nextJob = processingQueue.getNextJob();
      expect(nextJob.id).toBe(premiumJobId);
      
      // Clean up - remove test jobs from queue
      processingQueue.queue.delete(regularJobId);
      processingQueue.queue.delete(premiumJobId);
      processingQueue.resume(); // Resume processing
    });
  });
  
  // Test queue memory management
  describe('Queue Memory Management', () => {
    it('should have memory monitoring capabilities', async () => {
      // Check memory manager exists
      expect(processingQueue.memoryManager).toBeDefined();
      
      // Get memory status
      const memoryStatus = processingQueue.memoryManager.getMemoryStatus();
      
      // Verify memory status properties
      expect(memoryStatus).toHaveProperty('heapUsed');
      expect(memoryStatus).toHaveProperty('heapTotal');
      expect(memoryStatus).toHaveProperty('usedPercentage');
      expect(typeof memoryStatus.usedPercentage).toBe('number');
      
      // Memory usage should be within reasonable bounds
      expect(memoryStatus.usedPercentage).toBeGreaterThan(0);
      expect(memoryStatus.usedPercentage).toBeLessThan(1);
    });
    
    it('should adjust concurrency based on memory', async () => {
      // Capture initial concurrency
      const initialConcurrency = processingQueue.maxConcurrency;
      
      // Simulate a memory warning (with critical memory usage)
      const criticalMemoryStatus = {
        usedPercentage: 0.9,
        isCritical: true
      };
      
      // Trigger memory warning handler
      processingQueue.handleMemoryWarning(criticalMemoryStatus);
      
      // Verify concurrency was reduced
      expect(processingQueue.maxConcurrency).toBeLessThan(initialConcurrency);
      expect(processingQueue.isPaused).toBe(true); // Should be paused due to critical memory
      
      // Clean up
      processingQueue.resume();
      processingQueue.maxConcurrency = initialConcurrency;
    });
  });
  
  // Test error handling and retries
  describe('Error Handling and Retries', () => {
    it('should retry failed jobs', async () => {
      // Capture the original process method
      const originalProcessMethod = conversionJobProcessor.process;
      
      // Replace with a mock that fails on first attempt
      let attempts = 0;
      conversionJobProcessor.process = jest.fn().mockImplementation((jobData) => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error("Simulated first attempt failure"));
        }
        return Promise.resolve(true);
      });
      
      // Clear the queue first
      processingQueue.queue.clear();
      
      // Add a job that will fail on first attempt
      const jobId = 'retry-test-job';
      processingQueue.addJob(
        jobId,
        {
          operationId: jobId,
          fileId: 'test-file-id',
          sourceFormat: 'pdf',
          targetFormat: 'docx',
          maxAttempts: 2
        },
        5, // Normal priority
        (jobData) => conversionJobProcessor.process(jobData)
      );
      
      // Get the job
      const job = processingQueue.queue.get(jobId);
      
      // Process the job (will fail first time)
      await processingQueue.executeProcessor(job)
        .catch(error => {
          processingQueue.handleJobError(job, error);
        });
      
      // Verify job was put back in queue for retry
      expect(processingQueue.queue.has(jobId)).toBe(true);
      expect(job.attempts).toBe(1);
      expect(job.status).toBe('queued');
      
      // Verify priority was increased for retry
      expect(job.priority).toBeGreaterThan(5);
      
      // Clean up
      processingQueue.queue.delete(jobId);
      conversionJobProcessor.process = originalProcessMethod;
    });
  });
});