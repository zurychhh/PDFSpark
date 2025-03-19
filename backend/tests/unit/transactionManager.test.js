const mongoose = require('mongoose');
const { TransactionManager } = require('../../utils/transactionManager');
const Operation = require('../../models/Operation');

// Mock mongoose
jest.mock('mongoose', () => {
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(true),
    abortTransaction: jest.fn().mockResolvedValue(true),
    endSession: jest.fn()
  };
  
  return {
    connection: {
      readyState: 1,
      startSession: jest.fn().mockResolvedValue(mockSession)
    },
    startSession: jest.fn().mockResolvedValue(mockSession),
    model: jest.fn().mockImplementation((modelName) => {
      return {
        findByIdAndUpdate: jest.fn().mockImplementation((id, updates, options) => {
          return Promise.resolve({
            _id: id,
            ...updates
          });
        })
      };
    })
  };
});

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  })
}));

describe('TransactionManager', () => {
  let transactionManager;
  
  beforeEach(() => {
    // Reset process.env
    process.env.USE_IN_MEMORY_DB = 'false';
    process.env.USE_MEMORY_FALLBACK = undefined;
    
    // Clear mocks
    jest.clearAllMocks();
    
    // Create new instance for each test
    transactionManager = new TransactionManager();
  });
  
  describe('Transaction Support Detection', () => {
    it('should detect transaction support correctly', () => {
      expect(transactionManager.supportsTransactions).toBe(true);
      
      // Test with in-memory DB
      process.env.USE_IN_MEMORY_DB = 'true';
      const noTxManager = new TransactionManager();
      expect(noTxManager.supportsTransactions).toBe(false);
    });
    
    it('should detect memory fallback mode', () => {
      expect(transactionManager.memoryFallbackEnabled).toBe(false);
      
      // Test with memory fallback
      process.env.USE_MEMORY_FALLBACK = 'true';
      const fallbackManager = new TransactionManager();
      expect(fallbackManager.memoryFallbackEnabled).toBe(true);
    });
  });
  
  describe('executeWithTransaction', () => {
    it('should execute with transaction when supported', async () => {
      // Mock function to run in transaction
      const mockFn = jest.fn().mockResolvedValue({ result: 'success' });
      
      // Execute with transaction
      const result = await transactionManager.executeWithTransaction(mockFn, {
        requestId: 'test-req',
        operation: 'test-op'
      });
      
      // Verify transaction was used
      expect(mongoose.connection.startSession).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
      expect(result).toEqual({ result: 'success' });
      
      // Verify session passed to function
      const sessionArg = mockFn.mock.calls[0][0];
      expect(sessionArg).not.toBeNull();
      expect(sessionArg.startTransaction).toBeDefined();
      
      // Verify transaction was committed
      expect(sessionArg.commitTransaction).toHaveBeenCalled();
      expect(sessionArg.abortTransaction).not.toHaveBeenCalled();
      expect(sessionArg.endSession).toHaveBeenCalled();
    });
    
    it('should abort transaction on error', async () => {
      // Mock function that throws error
      const mockError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(mockError);
      
      // Execute with transaction (should throw)
      await expect(
        transactionManager.executeWithTransaction(mockFn)
      ).rejects.toThrow(mockError);
      
      // Verify transaction was aborted
      const sessionArg = mongoose.connection.startSession.mock.results[0].value;
      expect(sessionArg.abortTransaction).toHaveBeenCalled();
      expect(sessionArg.commitTransaction).not.toHaveBeenCalled();
      expect(sessionArg.endSession).toHaveBeenCalled();
    });
    
    it('should run without transaction when not supported', async () => {
      // Set up manager without transaction support
      process.env.USE_IN_MEMORY_DB = 'true';
      const noTxManager = new TransactionManager();
      
      // Mock function to run
      const mockFn = jest.fn().mockResolvedValue({ result: 'success' });
      
      // Execute without transaction
      const result = await noTxManager.executeWithTransaction(mockFn);
      
      // Verify no transaction was used
      expect(mongoose.connection.startSession).not.toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
      expect(mockFn.mock.calls[0][0]).toBeNull(); // No session passed
      expect(result).toEqual({ result: 'success' });
    });
    
    it('should handle memory fallback mode', async () => {
      // Set up manager with memory fallback
      process.env.USE_MEMORY_FALLBACK = 'true';
      const fallbackManager = new TransactionManager();
      
      // Mock function to run
      const mockFn = jest.fn().mockResolvedValue({ result: 'memory-mode' });
      
      // Execute in memory fallback mode
      const result = await fallbackManager.executeWithTransaction(mockFn);
      
      // Verify no transaction was used
      expect(mongoose.connection.startSession).not.toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
      expect(mockFn.mock.calls[0][0]).toBeNull(); // No session passed
      expect(result).toEqual({ result: 'memory-mode' });
    });
  });
  
  describe('Document Operations', () => {
    it('should save document with transaction', async () => {
      // Mock document
      const mockDoc = {
        _id: 'test-id',
        constructor: { modelName: 'TestModel' },
        save: jest.fn().mockResolvedValue({ _id: 'test-id', saved: true }),
        toObject: jest.fn().mockReturnValue({ _id: 'test-id' })
      };
      
      // Mock session
      const mockSession = { some: 'session' };
      
      // Save with transaction
      const result = await transactionManager.saveDocument(mockDoc, mockSession);
      
      // Verify save was called with session
      expect(mockDoc.save).toHaveBeenCalledWith({ session: mockSession });
      expect(result).toEqual({ _id: 'test-id', saved: true });
    });
    
    it('should save document without transaction', async () => {
      // Mock document
      const mockDoc = {
        _id: 'test-id',
        constructor: { modelName: 'TestModel' },
        save: jest.fn().mockResolvedValue({ _id: 'test-id', saved: true }),
        toObject: jest.fn().mockReturnValue({ _id: 'test-id' })
      };
      
      // Save without session
      const result = await transactionManager.saveDocument(mockDoc, null);
      
      // Verify save was called without session
      expect(mockDoc.save).toHaveBeenCalledWith();
      expect(result).toEqual({ _id: 'test-id', saved: true });
    });
    
    it('should update document with transaction', async () => {
      // Mock session
      const mockSession = { some: 'session' };
      
      // Update with transaction
      const result = await transactionManager.updateDocument(
        'TestModel',
        'test-id',
        { status: 'updated' },
        mockSession
      );
      
      // Verify findByIdAndUpdate was called
      expect(mongoose.model).toHaveBeenCalledWith('TestModel');
      expect(result).toEqual({
        _id: 'test-id',
        status: 'updated'
      });
    });
  });
  
  describe('Memory Fallback Mode', () => {
    beforeEach(() => {
      // Setup memory fallback environment
      process.env.USE_MEMORY_FALLBACK = 'true';
      
      // Mock global memory storage
      global.memoryStorage = {
        findOperation: jest.fn().mockImplementation(id => {
          if (id === 'existing-op') {
            return { _id: 'existing-op', status: 'queued' };
          }
          return null;
        }),
        addOperation: jest.fn()
      };
      
      // Create manager with memory fallback
      transactionManager = new TransactionManager();
    });
    
    afterEach(() => {
      // Clean up global
      delete global.memoryStorage;
    });
    
    it('should save Operation in memory', async () => {
      // Mock operation document
      const mockOperation = {
        _id: 'new-op',
        constructor: { modelName: 'Operation' },
        toObject: jest.fn().mockReturnValue({ _id: 'new-op', status: 'created' })
      };
      
      // Save in memory
      await transactionManager.saveDocument(mockOperation, null);
      
      // Verify memory storage was used
      expect(global.memoryStorage.addOperation).toHaveBeenCalledWith(
        { _id: 'new-op', status: 'created' }
      );
    });
    
    it('should update Operation in memory', async () => {
      // Update in memory
      const result = await transactionManager.updateDocument(
        'Operation',
        'existing-op',
        { status: 'processing' },
        null
      );
      
      // Verify memory storage was used
      expect(global.memoryStorage.findOperation).toHaveBeenCalledWith('existing-op');
      expect(result).toEqual({
        _id: 'existing-op',
        status: 'processing'
      });
    });
    
    it('should throw for non-existent document in memory', async () => {
      // Update non-existent document
      await expect(
        transactionManager.updateDocument(
          'Operation',
          'missing-op',
          { status: 'processing' },
          null
        )
      ).rejects.toThrow('Document not found: missing-op');
    });
    
    it('should throw for unsupported model in memory fallback', async () => {
      // Update unsupported model
      await expect(
        transactionManager.updateDocument(
          'User',
          'some-user',
          { name: 'Test User' },
          null
        )
      ).rejects.toThrow('Model User not supported in memory fallback mode');
    });
  });
});