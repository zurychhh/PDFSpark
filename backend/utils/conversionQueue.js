/**
 * Conversion Queue for PDFSpark
 * 
 * Manages PDF conversion operations in a queue to control memory usage
 * and prevent memory exhaustion during parallel conversions
 */
const logger = require('./logger');
const conversionTracker = require('./conversionTracker');

/**
 * Queue item representing a conversion job
 */
class QueueItem {
  constructor(operationId, data, callback) {
    this.operationId = operationId;
    this.data = data;
    this.callback = callback;
    this.startTime = null;
    this.endTime = null;
    this.status = 'pending';
    this.correlationId = data.correlationId;
    this.retries = 0;
    this.maxRetries = 2;
  }
}

/**
 * Conversion Queue class
 */
class ConversionQueue {
  constructor(options = {}) {
    // Maximum number of concurrent conversions
    this.concurrency = options.concurrency || 2;
    
    // Current active conversions
    this.activeCount = 0;
    
    // Queue of pending conversions
    this.queue = [];
    
    // Map of operation IDs to queue items
    this.items = new Map();
    
    // Whether the queue is paused
    this.paused = false;
    
    // Processing interval
    this.processInterval = null;
    
    // Start the queue processor
    this.startProcessor();
    
    logger.info('Conversion queue initialized', {
      concurrency: this.concurrency
    });
  }

  /**
   * Add a conversion job to the queue
   * 
   * @param {String} operationId Operation ID
   * @param {Object} data Conversion data
   * @param {Function} callback Function to call when processing the job
   * @returns {Promise} Promise that resolves when the job is added to the queue
   */
  add(operationId, data, callback) {
    return new Promise((resolve, reject) => {
      try {
        // Create a new queue item
        const item = new QueueItem(operationId, data, callback);
        
        // Add item to the queue
        this.queue.push(item);
        this.items.set(operationId, item);
        
        logger.info('Added conversion job to queue', {
          operationId,
          correlationId: data.correlationId,
          queueLength: this.queue.length,
          activeCount: this.activeCount
        });
        
        // Resolve immediately, but the job will be processed when its turn comes
        resolve(item);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start the queue processor
   */
  startProcessor() {
    if (this.processInterval) {
      return;
    }
    
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 500); // Check queue every 500ms
  }

  /**
   * Stop the queue processor
   */
  stopProcessor() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * Pause the queue processor
   */
  pause() {
    this.paused = true;
    logger.info('Conversion queue paused');
  }

  /**
   * Resume the queue processor
   */
  resume() {
    this.paused = false;
    logger.info('Conversion queue resumed');
  }

  /**
   * Process the queue
   */
  processQueue() {
    // Skip if paused
    if (this.paused) {
      return;
    }
    
    // Process as many items as we can, up to concurrency limit
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      // Get next item from queue
      const item = this.queue.shift();
      
      // Skip if item was removed from the map
      if (!this.items.has(item.operationId)) {
        continue;
      }
      
      // Mark as active
      this.activeCount++;
      
      // Process item
      this.processItem(item);
    }
    
    // If there are items in the queue, log stats
    if (this.queue.length > 0 && this.activeCount === this.concurrency) {
      logger.info('Conversion queue stats', {
        activeCount: this.activeCount,
        queueLength: this.queue.length
      });
    }
  }

  /**
   * Process a queue item
   * 
   * @param {QueueItem} item Queue item to process
   */
  async processItem(item) {
    // Update status
    item.status = 'processing';
    item.startTime = Date.now();
    
    // Log start of processing
    logger.info('Started processing conversion job', {
      operationId: item.operationId,
      correlationId: item.correlationId,
      retries: item.retries
    });
    
    try {
      // Execute the callback
      await item.callback(item.data);
      
      // Update status
      item.status = 'completed';
      item.endTime = Date.now();
      
      // Log successful processing
      logger.info('Completed processing conversion job', {
        operationId: item.operationId,
        correlationId: item.correlationId,
        duration: item.endTime - item.startTime + 'ms'
      });
    } catch (error) {
      // Update status
      item.status = 'failed';
      item.endTime = Date.now();
      
      // Log error
      logger.error('Failed processing conversion job', {
        operationId: item.operationId,
        correlationId: item.correlationId,
        error: error.message,
        stack: error.stack,
        duration: item.endTime - item.startTime + 'ms'
      });
      
      // Retry if possible
      if (item.retries < item.maxRetries) {
        item.retries++;
        item.status = 'pending';
        
        logger.info('Retrying conversion job', {
          operationId: item.operationId,
          correlationId: item.correlationId,
          retryCount: item.retries,
          maxRetries: item.maxRetries
        });
        
        // Add back to queue with delay based on retry count
        setTimeout(() => {
          this.queue.push(item);
        }, 1000 * Math.pow(2, item.retries)); // Exponential backoff
      } else {
        // Update operation status to failed
        try {
          // Get database client
          const db = global.dbClient ? global.dbClient.db() : null;
          
          await conversionTracker.updateOperation(db, item.operationId, {
            status: 'failed',
            error: error.message,
            errorCode: error.code || 'CONVERSION_ERROR'
          });
        } catch (dbError) {
          logger.error('Failed to update operation status on failure', {
            operationId: item.operationId,
            correlationId: item.correlationId,
            error: dbError.message
          });
        }
      }
    } finally {
      // Decrement active count
      this.activeCount--;
      
      // Clean up map if completed or failed with max retries
      if (item.status === 'completed' || (item.status === 'failed' && item.retries >= item.maxRetries)) {
        this.items.delete(item.operationId);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Get queue statistics
   * 
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queue.length,
      totalItems: this.items.size,
      paused: this.paused,
      concurrency: this.concurrency
    };
  }

  /**
   * Set the concurrency level
   * 
   * @param {Number} concurrency New concurrency level
   */
  setConcurrency(concurrency) {
    if (typeof concurrency === 'number' && concurrency > 0) {
      this.concurrency = concurrency;
      
      logger.info('Conversion queue concurrency updated', {
        concurrency
      });
    }
  }
}

// Create and export a singleton instance
const conversionQueue = new ConversionQueue();
module.exports = conversionQueue;