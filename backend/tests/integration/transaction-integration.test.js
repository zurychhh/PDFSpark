const mongoose = require('mongoose');
const Operation = require('../../models/Operation');
const { transactionManager } = require('../../utils/transactionManager');

// Set environment variables for testing
process.env.NODE_ENV = 'test';
process.env.USE_IN_MEMORY_DB = 'true';

describe('Transaction Integration with Operation Model', () => {
  beforeEach(() => {
    // Clear memory storage if used
    if (global.memoryStorage) {
      global.memoryStorage.operations = [];
    }
    
    // Reset mocks
    jest.clearAllMocks();
  });
  
  afterAll(async () => {
    // Clean up MongoDB connection if it exists
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });
  
  // Create a new operation
  async function createTestOperation() {
    return new Operation({
      sessionId: 'test-session',
      operationType: 'conversion',
      sourceFormat: 'pdf',
      targetFormat: 'docx',
      status: 'queued',
      correlationId: `corr-${Date.now()}`
    });
  }
  
  describe('Operation Model Transaction Methods', () => {
    it('should save operation with transaction support', async () => {
      // Create test operation
      const operation = await createTestOperation();
      
      // Use a spy to track actual save calls
      const saveSpy = jest.spyOn(transactionManager, 'saveDocument');
      
      // Save the operation
      await operation.saveWithTransaction();
      
      // Verify transaction manager was used
      expect(saveSpy).toHaveBeenCalledWith(operation, null);
      
      // If using real MongoDB (not in-memory), verify saved to DB
      if (process.env.USE_IN_MEMORY_DB !== 'true') {
        const savedOp = await Operation.findById(operation._id);
        expect(savedOp).toBeDefined();
        expect(savedOp.status).toBe('queued');
      }
    });
    
    it('should update progress with transaction support', async () => {
      // Create test operation
      const operation = await createTestOperation();
      
      // Use a spy to track actual save calls
      const saveSpy = jest.spyOn(transactionManager, 'saveDocument');
      
      // Update progress
      await operation.updateProgress(50);
      
      // Verify progress was updated
      expect(operation.progress).toBe(50);
      
      // Verify transaction manager was used
      expect(saveSpy).toHaveBeenCalled();
    });
    
    it('should complete operation with transaction', async () => {
      // Create test operation
      const operation = await createTestOperation();
      
      // Mock Cloudinary data
      const cloudinaryData = {
        public_id: 'test/result',
        secure_url: 'https://cloudinary.com/test/result.docx',
        format: 'docx',
        resource_type: 'raw',
        bytes: 1024
      };
      
      // Use spies to track transaction execution
      const executeSpy = jest.spyOn(transactionManager, 'executeWithTransaction');
      const saveSpy = jest.spyOn(transactionManager, 'saveDocument');
      
      // Complete the operation
      await operation.complete(
        'result-file-id', 
        'https://example.com/download', 
        new Date(), 
        cloudinaryData
      );
      
      // Verify operation was updated
      expect(operation.status).toBe('completed');
      expect(operation.progress).toBe(100);
      expect(operation.resultFileId).toBe('result-file-id');
      expect(operation.resultDownloadUrl).toBe('https://example.com/download');
      expect(operation.resultCloudinaryData).toBeDefined();
      expect(operation.resultCloudinaryData.publicId).toBe('test/result');
      
      // Verify transaction manager was used
      expect(executeSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
    });
    
    it('should fail operation with transaction', async () => {
      // Create test operation
      const operation = await createTestOperation();
      
      // Use spies to track transaction execution
      const executeSpy = jest.spyOn(transactionManager, 'executeWithTransaction');
      const saveSpy = jest.spyOn(transactionManager, 'saveDocument');
      
      // Fail the operation
      await operation.fail('Test error message');
      
      // Verify operation was updated
      expect(operation.status).toBe('failed');
      expect(operation.errorMessage).toBe('Test error message');
      expect(operation.completedAt).toBeDefined();
      
      // Verify transaction manager was used
      expect(executeSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
    });
  });
  
  describe('Memory Fallback Mode', () => {
    beforeEach(() => {
      // Set up memory fallback mode
      process.env.USE_MEMORY_FALLBACK = 'true';
      global.usingMemoryFallback = true;
      global.memoryStorage = {
        operations: [],
        addOperation: function(op) {
          this.operations.push(op);
        },
        findOperation: function(id) {
          return this.operations.find(op => op._id === id);
        }
      };
    });
    
    afterEach(() => {
      // Clean up memory fallback
      delete process.env.USE_MEMORY_FALLBACK;
      delete global.usingMemoryFallback;
      delete global.memoryStorage;
    });
    
    it('should store operation in memory when completed', async () => {
      // Create test operation
      const operation = await createTestOperation();
      operation._id = 'test-id-123'; // Set explicit ID for testing
      
      // Complete the operation
      await operation.complete(
        'memory-result-id', 
        'https://example.com/memory-download', 
        new Date()
      );
      
      // Verify stored in memory
      expect(global.memoryStorage.operations.length).toBe(1);
      const storedOp = global.memoryStorage.operations[0];
      expect(storedOp._id).toBe('test-id-123');
      expect(storedOp.status).toBe('completed');
      expect(storedOp.resultFileId).toBe('memory-result-id');
    });
  });
});