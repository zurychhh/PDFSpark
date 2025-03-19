/**
 * Transaction Manager
 * 
 * Provides transaction support for multi-step operations,
 * ensuring database consistency with atomic transactions
 * or fallbacks for environments that don't support them.
 */

const mongoose = require('mongoose');
const logger = require('./logger');

class TransactionManager {
  constructor() {
    this.supportsTransactions = this._checkTransactionSupport();
    this.memoryFallbackEnabled = !!process.env.USE_MEMORY_FALLBACK;
    
    logger.info('Transaction Manager initialized', {
      supportsTransactions: this.supportsTransactions,
      memoryFallbackEnabled: this.memoryFallbackEnabled
    });
  }
  
  /**
   * Check if the current MongoDB connection supports transactions
   * @returns {Boolean} True if transactions are supported
   */
  _checkTransactionSupport() {
    // MongoDB transactions require:
    // 1. MongoDB 4.0+ with a replica set or sharded cluster
    // 2. Mongoose 5.2+
    // 3. A connection that isn't in memory
    
    try {
      if (process.env.USE_IN_MEMORY_DB === 'true') {
        return false;
      }
      
      if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return false;
      }
      
      // Check for MongoDB version/topology that supports transactions
      // In a real implementation, would check for specific version and topology
      // For simplicity, we'll just check if the startSession method exists
      return !!mongoose.connection.startSession;
    } catch (error) {
      logger.error('Error checking transaction support', {
        error: error.message
      });
      return false;
    }
  }
  
  /**
   * Execute a function within a transaction if supported
   * @param {Function} fn Function that takes a session and executes queries
   * @param {Object} options Transaction options
   * @returns {Promise<any>} Result of the function
   */
  async executeWithTransaction(fn, options = {}) {
    const context = {
      requestId: options.requestId || `req_${Date.now()}`,
      operation: options.operation || 'unknown'
    };
    
    const txLogger = logger.child({
      requestId: context.requestId,
      operation: context.operation
    });
    
    txLogger.info('Beginning transaction');
    
    try {
      // Case 1: Memory fallback mode - no transactions needed
      if (this.memoryFallbackEnabled) {
        txLogger.debug('Using memory fallback mode - no transactions');
        return await fn(null, context);
      }
      
      // Case 2: MongoDB with transaction support
      if (this.supportsTransactions) {
        txLogger.debug('Using MongoDB transactions');
        
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
          const result = await fn(session, context);
          await session.commitTransaction();
          txLogger.info('Transaction committed successfully');
          
          return result;
        } catch (txError) {
          txLogger.error('Error in transaction, aborting', {
            error: txError.message
          });
          
          await session.abortTransaction();
          throw txError;
        } finally {
          session.endSession();
        }
      }
      
      // Case 3: MongoDB without transaction support
      txLogger.debug('Transactions not supported, running without transaction');
      return await fn(null, context);
    } catch (error) {
      txLogger.error('Transaction execution failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Save a document with transaction support
   * @param {Object} doc Mongoose document to save
   * @param {Object} session MongoDB session or null
   * @returns {Promise<Object>} Saved document
   */
  async saveDocument(doc, session) {
    try {
      // Memory fallback mode
      if (this.memoryFallbackEnabled && global.memoryStorage) {
        // Depends on the document type - this is a simplified example
        if (doc.constructor.modelName === 'Operation') {
          global.memoryStorage.addOperation(doc.toObject());
          return doc;
        }
        
        // Default behavior - just return the document
        return doc;
      }
      
      // With transaction support
      if (session) {
        return await doc.save({ session });
      }
      
      // Without transaction support
      return await doc.save();
    } catch (error) {
      logger.error('Error saving document with transaction', {
        error: error.message,
        modelName: doc.constructor.modelName,
        id: doc._id
      });
      throw error;
    }
  }
  
  /**
   * Update a document with transaction support
   * @param {String} model Mongoose model name
   * @param {String} id Document ID
   * @param {Object} updates Updates to apply
   * @param {Object} session MongoDB session or null
   * @returns {Promise<Object>} Updated document
   */
  async updateDocument(model, id, updates, session) {
    try {
      // Memory fallback mode
      if (this.memoryFallbackEnabled && global.memoryStorage) {
        // Depends on the model type - this is a simplified example
        if (model === 'Operation') {
          const memoryOp = global.memoryStorage.findOperation(id);
          if (memoryOp) {
            Object.assign(memoryOp, updates);
            return memoryOp;
          }
          throw new Error(`Document not found: ${id}`);
        }
        
        // Default behavior - throw error
        throw new Error(`Model ${model} not supported in memory fallback mode`);
      }
      
      // Get the Mongoose model
      const Model = mongoose.model(model);
      
      // With transaction support
      if (session) {
        return await Model.findByIdAndUpdate(id, updates, { 
          new: true, 
          session,
          runValidators: true
        });
      }
      
      // Without transaction support
      return await Model.findByIdAndUpdate(id, updates, { 
        new: true,
        runValidators: true
      });
    } catch (error) {
      logger.error('Error updating document with transaction', {
        error: error.message,
        model,
        id
      });
      throw error;
    }
  }
}

// Create singleton instance
const transactionManager = new TransactionManager();

module.exports = {
  TransactionManager,
  transactionManager
};