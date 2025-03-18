/**
 * Conversion Tracker for PDFSpark
 * 
 * Tracks PDF conversion operations with correlation IDs for better debugging
 * and provides a fallback mechanism when database operations fail
 */
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

// In-memory store for operations when database is unavailable
const memoryStore = {
  operations: new Map(),
  files: new Map()
};

/**
 * Conversion Tracker class
 */
class ConversionTracker {
  constructor() {
    this.fallbackEnabled = process.env.USE_MEMORY_FALLBACK === 'true';
  }

  /**
   * Create a new operation with tracking information
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {Object} operationData Operation data (sourceFileId, targetFormat, etc)
   * @param {String} correlationId Correlation ID for tracking
   * @returns {Object} Created operation object
   */
  async createOperation(db, operationData, correlationId) {
    const operationId = uuidv4();
    const timestamp = new Date();
    
    // Prepare operation object
    const operation = {
      _id: operationId,
      ...operationData,
      correlationId,
      status: 'created',
      createdAt: timestamp,
      updates: [{
        status: 'created',
        timestamp
      }]
    };
    
    try {
      // Try to create operation in the database
      if (db && db.operations) {
        await db.operations.insertOne(operation);
        
        logger.info('Operation created in database', {
          operationId,
          correlationId,
          status: 'created'
        });
      } else {
        throw new Error('Database not available');
      }
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        logger.info('Using memory fallback for operation creation', {
          operationId,
          correlationId,
          error: error.message
        });
        
        // Store operation in memory
        memoryStore.operations.set(operationId, operation);
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to create operation and fallback is disabled', {
          operationId,
          correlationId,
          error: error.message
        });
        throw error;
      }
    }
    
    return operation;
  }

  /**
   * Update an existing operation
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {String} operationId Operation ID
   * @param {Object} updateData Data to update (status, resultFileId, etc)
   * @returns {Object} Updated operation
   */
  async updateOperation(db, operationId, updateData) {
    const timestamp = new Date();
    const update = {
      ...updateData,
      updatedAt: timestamp
    };
    
    // Add update to history
    const updateEntry = {
      ...updateData,
      timestamp
    };
    
    try {
      let operation;
      
      // Try to update operation in the database
      if (db && db.operations) {
        const result = await db.operations.findOneAndUpdate(
          { _id: operationId },
          { 
            $set: update,
            $push: { 
              updates: updateEntry 
            }
          },
          { returnDocument: 'after' }
        );
        
        operation = result.value;
        
        if (!operation) {
          throw new Error('Operation not found in database');
        }
        
        logger.info('Operation updated in database', {
          operationId,
          correlationId: operation.correlationId,
          status: updateData.status || operation.status
        });
      } else {
        throw new Error('Database not available');
      }
      
      return operation;
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        // Get operation from memory store
        const operation = memoryStore.operations.get(operationId);
        
        if (!operation) {
          logger.error('Operation not found in memory store', {
            operationId,
            error: error.message
          });
          throw new Error('Operation not found');
        }
        
        // Update operation in memory
        const updatedOperation = {
          ...operation,
          ...update,
          updates: [...(operation.updates || []), updateEntry]
        };
        
        memoryStore.operations.set(operationId, updatedOperation);
        
        logger.info('Operation updated in memory store', {
          operationId,
          correlationId: operation.correlationId,
          status: updateData.status || operation.status
        });
        
        return updatedOperation;
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to update operation and fallback is disabled', {
          operationId,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Get an operation by ID
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {String} operationId Operation ID
   * @returns {Object} Operation object
   */
  async getOperation(db, operationId) {
    try {
      // Try to get operation from the database
      if (db && db.operations) {
        const operation = await db.operations.findOne({ _id: operationId });
        
        if (!operation) {
          throw new Error('Operation not found in database');
        }
        
        return operation;
      } else {
        throw new Error('Database not available');
      }
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        // Get operation from memory store
        const operation = memoryStore.operations.get(operationId);
        
        if (!operation) {
          logger.error('Operation not found in memory store', {
            operationId,
            error: error.message
          });
          throw new Error('Operation not found');
        }
        
        return operation;
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to get operation and fallback is disabled', {
          operationId,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Create a file record
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {Object} fileData File data
   * @param {String} correlationId Correlation ID for tracking
   * @returns {Object} Created file object
   */
  async createFile(db, fileData, correlationId) {
    const fileId = uuidv4();
    const timestamp = new Date();
    
    // Prepare file object
    const file = {
      _id: fileId,
      ...fileData,
      correlationId,
      uploadDate: timestamp
    };
    
    try {
      // Try to create file in the database
      if (db && db.files) {
        await db.files.insertOne(file);
        
        logger.info('File created in database', {
          fileId,
          correlationId,
          name: fileData.name,
          size: fileData.size
        });
      } else {
        throw new Error('Database not available');
      }
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        logger.info('Using memory fallback for file creation', {
          fileId,
          correlationId,
          error: error.message
        });
        
        // Store file in memory
        memoryStore.files.set(fileId, file);
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to create file and fallback is disabled', {
          fileId,
          correlationId,
          error: error.message
        });
        throw error;
      }
    }
    
    return file;
  }

  /**
   * Get a file by ID
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {String} fileId File ID
   * @returns {Object} File object
   */
  async getFile(db, fileId) {
    try {
      // Try to get file from the database
      if (db && db.files) {
        const file = await db.files.findOne({ _id: fileId });
        
        if (!file) {
          throw new Error('File not found in database');
        }
        
        return file;
      } else {
        throw new Error('Database not available');
      }
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        // Get file from memory store
        const file = memoryStore.files.get(fileId);
        
        if (!file) {
          logger.error('File not found in memory store', {
            fileId,
            error: error.message
          });
          throw new Error('File not found');
        }
        
        return file;
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to get file and fallback is disabled', {
          fileId,
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Update a file
   * 
   * @param {Object} db MongoDB client or Mongoose model
   * @param {String} fileId File ID
   * @param {Object} updateData Data to update
   * @returns {Object} Updated file
   */
  async updateFile(db, fileId, updateData) {
    const timestamp = new Date();
    const update = {
      ...updateData,
      updatedAt: timestamp
    };
    
    try {
      let file;
      
      // Try to update file in the database
      if (db && db.files) {
        const result = await db.files.findOneAndUpdate(
          { _id: fileId },
          { $set: update },
          { returnDocument: 'after' }
        );
        
        file = result.value;
        
        if (!file) {
          throw new Error('File not found in database');
        }
        
        logger.info('File updated in database', {
          fileId,
          correlationId: file.correlationId,
          name: file.name
        });
      } else {
        throw new Error('Database not available');
      }
      
      return file;
    } catch (error) {
      // Use memory fallback if enabled
      if (this.fallbackEnabled) {
        // Get file from memory store
        const file = memoryStore.files.get(fileId);
        
        if (!file) {
          logger.error('File not found in memory store', {
            fileId,
            error: error.message
          });
          throw new Error('File not found');
        }
        
        // Update file in memory
        const updatedFile = {
          ...file,
          ...update
        };
        
        memoryStore.files.set(fileId, updatedFile);
        
        logger.info('File updated in memory store', {
          fileId,
          correlationId: file.correlationId,
          name: file.name
        });
        
        return updatedFile;
      } else {
        // Re-throw error if fallback is not enabled
        logger.error('Failed to update file and fallback is disabled', {
          fileId,
          error: error.message
        });
        throw error;
      }
    }
  }
}

module.exports = new ConversionTracker();