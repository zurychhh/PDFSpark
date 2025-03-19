/**
 * Enhanced Processing Queue
 * 
 * A memory-aware queue system for processing resource-intensive operations
 * with intelligent concurrency, prioritization, and persistence.
 * 
 * This is a critical component for Railway deployment, where memory
 * management is essential for stability.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const EventEmitter = require('events');

/**
 * MemoryManager class for monitoring and managing memory usage
 */
class MemoryManager {
  constructor(options = {}) {
    this.warningThreshold = options.warningThreshold || 0.7; // 70%
    this.criticalThreshold = options.criticalThreshold || 0.85; // 85%
    this.gcEnabled = typeof global.gc === 'function';
    this.lastGC = 0;
    this.gcInterval = options.gcInterval || 60000; // 1 minute
    this.monitoringInterval = null;
    this.warningHandlers = [];
    
    // Get initial memory status
    this.memoryStatus = this.getMemoryStatus();
    
    logger.info('MemoryManager initialized', {
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold,
      gcEnabled: this.gcEnabled,
      initialMemory: this.memoryStatus
    });
  }
  
  /**
   * Get current memory status
   * @returns {Object} Memory status information
   */
  getMemoryStatus() {
    const memoryUsage = process.memoryUsage();
    
    // Calculate percentages
    const heapUsedPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
    const rssPercentage = memoryUsage.rss / (process.env.MAX_MEMORY || 2048 * 1024 * 1024);
    
    // Use the higher of heap and RSS percentages
    const usedPercentage = Math.max(heapUsedPercentage, rssPercentage);
    
    return {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      heapUsedPercentage: heapUsedPercentage,
      rssPercentage: rssPercentage,
      usedPercentage: usedPercentage,
      available: 1 - usedPercentage,
      isWarning: usedPercentage >= this.warningThreshold,
      isCritical: usedPercentage >= this.criticalThreshold
    };
  }
  
  /**
   * Try to free memory
   * @param {Boolean} aggressive Whether to use aggressive memory freeing
   * @returns {Object} Memory status after freeing attempt
   */
  tryFreeMemory(aggressive = false) {
    logger.info(`Attempting to free memory (aggressive: ${aggressive})`);
    
    // Run garbage collection if available
    if (this.gcEnabled) {
      const now = Date.now();
      
      // Don't run GC too frequently
      if (now - this.lastGC > (aggressive ? 5000 : this.gcInterval)) {
        logger.info('Running garbage collection');
        global.gc();
        this.lastGC = now;
      }
    }
    
    // Clear module cache if in aggressive mode
    if (aggressive) {
      logger.info('Clearing module cache for non-essential modules');
      Object.keys(require.cache).forEach(key => {
        // Don't clear critical modules
        if (!key.includes('node_modules') || 
            key.includes('mongodb') || 
            key.includes('express') ||
            key.includes('cloudinary')) {
          return;
        }
        
        // Clear module from cache
        delete require.cache[key];
      });
    }
    
    // Get updated memory status
    const memoryStatus = this.getMemoryStatus();
    
    // Handle memory warning
    if (memoryStatus.isWarning) {
      this.triggerWarningHandlers(memoryStatus);
    }
    
    return memoryStatus;
  }
  
  /**
   * Register a function to handle memory warning
   * @param {Function} handler Function to call when memory warning occurs
   */
  registerWarningHandler(handler) {
    if (typeof handler === 'function') {
      this.warningHandlers.push(handler);
    }
  }
  
  /**
   * Trigger all registered warning handlers
   * @param {Object} memoryStatus Current memory status
   */
  triggerWarningHandlers(memoryStatus) {
    this.warningHandlers.forEach(handler => {
      try {
        handler(memoryStatus);
      } catch (error) {
        logger.error('Error in memory warning handler', {
          error: error.message
        });
      }
    });
  }
  
  /**
   * Start memory monitoring
   * @param {Number} interval Monitoring interval in ms
   */
  startMonitoring(interval = 30000) {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      const memoryStatus = this.getMemoryStatus();
      this.memoryStatus = memoryStatus;
      
      // Log memory status
      logger.debug('Memory status', {
        heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(memoryStatus.heapTotal / (1024 * 1024)),
        usedPercentage: Math.round(memoryStatus.usedPercentage * 100)
      });
      
      // Handle critical memory situations
      if (memoryStatus.isCritical) {
        logger.warn('Critical memory usage detected', {
          usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
          heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024))
        });
        
        this.tryFreeMemory(true);
      } 
      // Handle warning level
      else if (memoryStatus.isWarning) {
        logger.info('High memory usage detected', {
          usedPercentage: Math.round(memoryStatus.usedPercentage * 100)
        });
        
        this.triggerWarningHandlers(memoryStatus);
      }
    }, interval);
    
    logger.info(`Memory monitoring started (interval: ${interval}ms)`);
  }
  
  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }
}

/**
 * ProcessingQueue class for managing resource-intensive operations
 */
class ProcessingQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Queue configuration
    this.name = options.name || 'default';
    this.maxConcurrency = options.maxConcurrency || 3;
    this.currentConcurrency = 0;
    this.pollInterval = options.pollInterval || 500;
    this.memoryThreshold = options.memoryThreshold || 0.7;
    this.persistenceEnabled = options.persistenceEnabled !== false;
    this.railwayMode = options.railwayMode || !!process.env.RAILWAY_SERVICE_NAME;
    
    // Queue data structures
    this.queue = new Map();
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    this.failedJobs = new Map();
    
    // Maximum job history to keep in memory
    this.maxHistoryJobs = options.maxHistoryJobs || 100;
    
    // Processing state
    this.isProcessing = false;
    this.isPaused = false;
    this.processingInterval = null;
    
    // Statistics
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      totalSucceeded: 0,
      startTime: new Date(),
      averageProcessingTimeMs: 0
    };
    
    // Memory management
    this.memoryManager = new MemoryManager(options.memoryOptions);
    
    // Register memory warning handler
    this.memoryManager.registerWarningHandler((memoryStatus) => {
      this.handleMemoryWarning(memoryStatus);
    });
    
    // Set up queue persistence
    if (this.persistenceEnabled) {
      this.setupPersistence();
    }
    
    logger.info(`ProcessingQueue '${this.name}' initialized`, {
      maxConcurrency: this.maxConcurrency,
      railwayMode: this.railwayMode,
      persistenceEnabled: this.persistenceEnabled
    });
  }
  
  /**
   * Add a job to the queue
   * @param {String} jobId Unique job identifier
   * @param {Object} data Job data
   * @param {Number} priority Job priority (1-10, higher is more important)
   * @param {Function} processor Function to process the job
   * @returns {String} Job ID
   */
  addJob(jobId, data, priority = 5, processor) {
    // Generate job ID if not provided
    if (!jobId) {
      jobId = uuidv4();
    }
    
    // Validate processor
    if (typeof processor !== 'function') {
      throw new Error('Job processor must be a function');
    }
    
    // Create job object
    const job = {
      id: jobId,
      data,
      priority: Math.max(1, Math.min(10, priority)),
      processor,
      status: 'queued',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      attempts: 0,
      maxAttempts: data.maxAttempts || 3,
      result: null,
      error: null
    };
    
    // Add to queue
    this.queue.set(jobId, job);
    
    logger.info(`Job added to queue '${this.name}'`, {
      jobId,
      priority,
      queueSize: this.queue.size
    });
    
    // Emit job added event
    this.emit('jobAdded', job);
    
    // Start processing if not already started
    if (!this.processingInterval) {
      this.start();
    }
    
    return jobId;
  }
  
  /**
   * Start queue processing
   */
  start() {
    if (this.processingInterval) {
      return; // Already running
    }
    
    logger.info(`Starting processing queue '${this.name}'`);
    
    // Start memory monitoring
    this.memoryManager.startMonitoring();
    
    // Start processing interval
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.pollInterval);
    
    // Emit started event
    this.emit('started');
  }
  
  /**
   * Stop queue processing
   */
  stop() {
    if (!this.processingInterval) {
      return; // Already stopped
    }
    
    logger.info(`Stopping processing queue '${this.name}'`);
    
    // Clear processing interval
    clearInterval(this.processingInterval);
    this.processingInterval = null;
    
    // Stop memory monitoring
    this.memoryManager.stopMonitoring();
    
    // Emit stopped event
    this.emit('stopped');
  }
  
  /**
   * Pause queue processing (finishes current jobs but doesn't start new ones)
   */
  pause() {
    logger.info(`Pausing processing queue '${this.name}'`);
    this.isPaused = true;
    this.emit('paused');
  }
  
  /**
   * Resume queue processing
   */
  resume() {
    logger.info(`Resuming processing queue '${this.name}'`);
    this.isPaused = false;
    this.emit('resumed');
  }
  
  /**
   * Process the queue, starting jobs if resources allow
   */
  processQueue() {
    // Skip if already processing, paused, or no jobs in queue
    if (this.isProcessing || this.isPaused || this.queue.size === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Check if we can process more jobs
      if (this.currentConcurrency >= this.maxConcurrency) {
        return;
      }
      
      // Check memory availability
      const memoryStatus = this.memoryManager.getMemoryStatus();
      if (memoryStatus.usedPercentage > this.memoryThreshold) {
        logger.info('Memory usage above threshold, delaying job processing', {
          usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
          threshold: Math.round(this.memoryThreshold * 100)
        });
        return;
      }
      
      // Adjust concurrency based on memory availability
      this.adjustConcurrency(memoryStatus);
      
      // Find next job to process
      const nextJob = this.getNextJob();
      if (!nextJob) {
        return;
      }
      
      // Move job to active list and start processing
      this.queue.delete(nextJob.id);
      nextJob.status = 'processing';
      nextJob.startedAt = new Date();
      nextJob.attempts += 1;
      this.activeJobs.set(nextJob.id, nextJob);
      this.currentConcurrency++;
      
      // Emit job started event
      this.emit('jobStarted', nextJob);
      
      // Process the job
      logger.info(`Processing job ${nextJob.id} (attempt ${nextJob.attempts}/${nextJob.maxAttempts})`, {
        queueSize: this.queue.size,
        activeJobs: this.activeJobs.size
      });
      
      // Execute the job processor
      this.executeProcessor(nextJob)
        .then((result) => {
          this.handleJobSuccess(nextJob, result);
        })
        .catch((error) => {
          this.handleJobError(nextJob, error);
        })
        .finally(() => {
          this.currentConcurrency--;
        });
    } catch (error) {
      logger.error('Error in queue processing', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Execute a job processor with timeout protection
   * @param {Object} job The job to process
   * @returns {Promise} Promise resolving with job result
   */
  executeProcessor(job) {
    return new Promise(async (resolve, reject) => {
      // Set timeout for job processing
      const timeoutMs = job.data.timeoutMs || 300000; // 5 minutes default
      const timeoutId = setTimeout(() => {
        reject(new Error(`Job processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      try {
        // Execute the processor
        const result = await job.processor(job.data);
        
        // Clear timeout and resolve
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        // Clear timeout and reject
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  /**
   * Get the next job to process based on priority
   * @returns {Object|null} Next job or null if none available
   */
  getNextJob() {
    if (this.queue.size === 0) {
      return null;
    }
    
    // Find highest priority job
    let highestPriority = -1;
    let oldestTimestamp = Date.now();
    let nextJob = null;
    
    this.queue.forEach((job) => {
      // If higher priority or same priority but older
      if (job.priority > highestPriority || 
          (job.priority === highestPriority && job.createdAt < oldestTimestamp)) {
        highestPriority = job.priority;
        oldestTimestamp = job.createdAt;
        nextJob = job;
      }
    });
    
    return nextJob;
  }
  
  /**
   * Handle successful job completion
   * @param {Object} job The completed job
   * @param {*} result Job result
   */
  handleJobSuccess(job, result) {
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;
    
    // Calculate processing time
    const processingTime = job.completedAt - job.startedAt;
    
    logger.info(`Job ${job.id} completed successfully in ${processingTime}ms`);
    
    // Update statistics
    this.stats.totalProcessed++;
    this.stats.totalSucceeded++;
    this.stats.averageProcessingTimeMs = (
      (this.stats.averageProcessingTimeMs * (this.stats.totalSucceeded - 1)) + processingTime
    ) / this.stats.totalSucceeded;
    
    // Move to completed jobs
    this.activeJobs.delete(job.id);
    this.completedJobs.set(job.id, job);
    
    // Trim completed jobs if needed
    this.trimJobHistory();
    
    // Emit job completed event
    this.emit('jobCompleted', job);
  }
  
  /**
   * Handle job processing error
   * @param {Object} job The failed job
   * @param {Error} error The error that occurred
   */
  handleJobError(job, error) {
    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      // Move back to queue with increased priority for retry
      job.status = 'queued';
      job.error = error.message;
      job.priority = Math.min(10, job.priority + 1); // Increase priority for retries, max 10
      
      // Calculate delay based on attempts (exponential backoff)
      const delayMs = Math.pow(2, job.attempts) * 1000;
      job.nextAttemptAt = new Date(Date.now() + delayMs);
      
      logger.warn(`Job ${job.id} failed, retrying in ${delayMs}ms (attempt ${job.attempts}/${job.maxAttempts})`, {
        error: error.message
      });
      
      // Put back in queue for retry
      this.queue.set(job.id, job);
      this.activeJobs.delete(job.id);
      
      // Emit job retry event
      this.emit('jobRetry', job, error);
    } else {
      // Max attempts reached, mark as failed
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error.message;
      
      logger.error(`Job ${job.id} failed permanently after ${job.attempts} attempts`, {
        error: error.message,
        stack: error.stack
      });
      
      // Update statistics
      this.stats.totalProcessed++;
      this.stats.totalFailed++;
      
      // Move to failed jobs
      this.activeJobs.delete(job.id);
      this.failedJobs.set(job.id, job);
      
      // Trim failed jobs if needed
      this.trimJobHistory();
      
      // Emit job failed event
      this.emit('jobFailed', job, error);
    }
  }
  
  /**
   * Adjust concurrency based on memory availability
   * @param {Object} memoryStatus Current memory status
   */
  adjustConcurrency(memoryStatus) {
    // Don't adjust too frequently
    const now = Date.now();
    if (this.lastConcurrencyAdjustment && now - this.lastConcurrencyAdjustment < 10000) {
      return;
    }
    
    this.lastConcurrencyAdjustment = now;
    
    // Calculate ideal concurrency based on memory
    let newConcurrency = this.maxConcurrency;
    
    // Reduce concurrency if memory usage is high
    if (memoryStatus.usedPercentage > 0.8) {
      newConcurrency = Math.max(1, this.maxConcurrency - 1);
    } 
    // Increase concurrency if memory usage is low and we have queued jobs
    else if (memoryStatus.usedPercentage < 0.5 && this.queue.size > 0) {
      // In Railway mode, be more conservative with concurrency
      const maxAllowed = this.railwayMode ? 3 : 5;
      newConcurrency = Math.min(maxAllowed, this.maxConcurrency + 1);
    }
    
    // Only log if changing
    if (newConcurrency !== this.maxConcurrency) {
      logger.info(`Adjusting concurrency from ${this.maxConcurrency} to ${newConcurrency}`, {
        memoryUsedPercentage: Math.round(memoryStatus.usedPercentage * 100),
        queueSize: this.queue.size
      });
      
      this.maxConcurrency = newConcurrency;
      
      // Emit concurrency changed event
      this.emit('concurrencyChanged', newConcurrency);
    }
  }
  
  /**
   * Handle memory warning
   * @param {Object} memoryStatus Current memory status
   */
  handleMemoryWarning(memoryStatus) {
    logger.warn('Memory warning in processing queue', {
      memoryUsedPercentage: Math.round(memoryStatus.usedPercentage * 100)
    });
    
    // Reduce concurrency immediately
    this.maxConcurrency = Math.max(1, this.maxConcurrency - 1);
    logger.info(`Reduced concurrency to ${this.maxConcurrency} due to memory warning`);
    
    // If critical, pause queue temporarily
    if (memoryStatus.isCritical) {
      this.pause();
      
      // Resume after a delay
      setTimeout(() => {
        // Check memory again before resuming
        const currentMemory = this.memoryManager.getMemoryStatus();
        if (currentMemory.usedPercentage < this.memoryThreshold) {
          this.resume();
        }
      }, 30000); // 30 second pause
    }
    
    // Try to free memory
    this.memoryManager.tryFreeMemory(memoryStatus.isCritical);
  }
  
  /**
   * Trim job history to prevent memory leaks
   */
  trimJobHistory() {
    // Trim completed jobs
    if (this.completedJobs.size > this.maxHistoryJobs) {
      const jobsToRemove = this.completedJobs.size - this.maxHistoryJobs;
      let removed = 0;
      
      // Sort by completion time and remove oldest
      const sortedJobs = Array.from(this.completedJobs.entries())
        .sort(([, jobA], [, jobB]) => jobA.completedAt - jobB.completedAt);
      
      for (let i = 0; i < jobsToRemove; i++) {
        if (i < sortedJobs.length) {
          this.completedJobs.delete(sortedJobs[i][0]);
          removed++;
        }
      }
      
      logger.debug(`Trimmed ${removed} old completed jobs from history`);
    }
    
    // Trim failed jobs
    if (this.failedJobs.size > this.maxHistoryJobs) {
      const jobsToRemove = this.failedJobs.size - this.maxHistoryJobs;
      let removed = 0;
      
      // Sort by completion time and remove oldest
      const sortedJobs = Array.from(this.failedJobs.entries())
        .sort(([, jobA], [, jobB]) => jobA.completedAt - jobB.completedAt);
      
      for (let i = 0; i < jobsToRemove; i++) {
        if (i < sortedJobs.length) {
          this.failedJobs.delete(sortedJobs[i][0]);
          removed++;
        }
      }
      
      logger.debug(`Trimmed ${removed} old failed jobs from history`);
    }
  }
  
  /**
   * Set up queue persistence
   */
  setupPersistence() {
    // Register persistence listeners
    this.on('jobAdded', () => this.persistQueueState());
    this.on('jobCompleted', () => this.persistQueueState());
    this.on('jobFailed', () => this.persistQueueState());
    
    // Set up periodic persistence
    setInterval(() => this.persistQueueState(), 60000);
    
    // Try to restore state on startup
    this.restoreQueueState();
  }
  
  /**
   * Persist queue state for recovery
   */
  persistQueueState() {
    // Skip if persistence disabled
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      // Store state in global memory (for Railway memory fallback mode)
      if (global.memoryStorage) {
        global.memoryStorage.queueState = global.memoryStorage.queueState || {};
        
        // Store queue state without processor functions
        global.memoryStorage.queueState[this.name] = {
          queuedJobs: Array.from(this.queue.values()).map(job => ({
            ...job,
            processor: '[Function]' // Can't serialize functions
          })),
          stats: this.stats,
          timestamp: new Date()
        };
        
        logger.debug(`Queue state persisted to memory storage (${this.queue.size} queued jobs)`);
      }
      
      // In a real implementation, we'd also persist to MongoDB or similar
    } catch (error) {
      logger.error('Error persisting queue state', {
        error: error.message
      });
    }
  }
  
  /**
   * Restore queue state from persistence
   */
  restoreQueueState() {
    // Skip if persistence disabled
    if (!this.persistenceEnabled) {
      return;
    }
    
    try {
      // Nothing to restore (in this implementation)
      // In a real implementation, we'd restore from MongoDB
      
      // For testing, log that we attempted restoration
      logger.info('Queue state restoration attempted (no state to restore)');
      return false;
    } catch (error) {
      logger.error('Error restoring queue state', {
        error: error.message
      });
      return false;
    }
  }
  
  /**
   * Get job information by ID
   * @param {String} jobId Job ID
   * @returns {Object|null} Job information or null if not found
   */
  getJobInfo(jobId) {
    // Check active jobs
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId);
    }
    
    // Check queued jobs
    if (this.queue.has(jobId)) {
      const job = this.queue.get(jobId);
      
      // Calculate position in queue
      const position = this.getJobPosition(jobId);
      
      // Calculate estimated time based on average processing time
      const ahead = position - 1;
      const estimatedWaitTimeMs = Math.max(0, 
        ahead * this.stats.averageProcessingTimeMs / this.maxConcurrency
      );
      
      return {
        ...job,
        queuePosition: position,
        estimatedWaitTimeMs
      };
    }
    
    // Check completed jobs
    if (this.completedJobs.has(jobId)) {
      return this.completedJobs.get(jobId);
    }
    
    // Check failed jobs
    if (this.failedJobs.has(jobId)) {
      return this.failedJobs.get(jobId);
    }
    
    // Not found
    return null;
  }
  
  /**
   * Get job position in queue
   * @param {String} jobId Job ID
   * @returns {Number} Position in queue (1-based) or -1 if not in queue
   */
  getJobPosition(jobId) {
    if (!this.queue.has(jobId)) {
      return -1;
    }
    
    const job = this.queue.get(jobId);
    let position = 1;
    
    // Count jobs with higher priority
    this.queue.forEach((otherJob) => {
      if (otherJob.id !== jobId) {
        if (otherJob.priority > job.priority) {
          position++;
        } else if (otherJob.priority === job.priority && otherJob.createdAt < job.createdAt) {
          // Same priority, earlier creation time
          position++;
        }
      }
    });
    
    return position;
  }
  
  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    // Calculate current queue metrics
    const queuedCount = this.queue.size;
    const activeCount = this.activeJobs.size;
    const completedCount = this.completedJobs.size;
    const failedCount = this.failedJobs.size;
    const totalCount = queuedCount + activeCount + completedCount + failedCount;
    
    // Calculate estimated wait time based on queue size and processing rate
    let estimatedWaitTimeMs = 0;
    if (queuedCount > 0 && this.stats.averageProcessingTimeMs > 0) {
      estimatedWaitTimeMs = (queuedCount / this.maxConcurrency) * this.stats.averageProcessingTimeMs;
    }
    
    // Get memory status
    const memoryStatus = this.memoryManager.getMemoryStatus();
    
    // Generate statistics object
    return {
      name: this.name,
      queuedCount,
      activeCount,
      completedCount,
      failedCount,
      totalCount,
      maxConcurrency: this.maxConcurrency,
      currentConcurrency: this.currentConcurrency,
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      uptime: (new Date() - this.stats.startTime) / 1000,
      processed: this.stats.totalProcessed,
      succeeded: this.stats.totalSucceeded,
      failed: this.stats.totalFailed,
      averageProcessingTimeMs: this.stats.averageProcessingTimeMs,
      estimatedWaitTimeMs,
      memoryStatus: {
        usedPercentage: Math.round(memoryStatus.usedPercentage * 100) / 100,
        heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(memoryStatus.heapTotal / (1024 * 1024)),
        isWarning: memoryStatus.isWarning,
        isCritical: memoryStatus.isCritical
      }
    };
  }
}

// Create a singleton instance
const processingQueue = new ProcessingQueue({
  name: 'pdfspark-main',
  maxConcurrency: process.env.MAX_CONCURRENCY ? parseInt(process.env.MAX_CONCURRENCY) : undefined,
  railwayMode: !!process.env.RAILWAY_SERVICE_NAME,
  memoryThreshold: process.env.MEMORY_THRESHOLD ? parseFloat(process.env.MEMORY_THRESHOLD) : undefined
});

// Make memory manager available to other components
const memoryManager = processingQueue.memoryManager;

// Start queue processing automatically
processingQueue.start();

module.exports = {
  ProcessingQueue,
  MemoryManager,
  processingQueue
};