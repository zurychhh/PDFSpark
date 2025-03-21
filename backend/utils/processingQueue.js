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
    this.warningThreshold = options.warningThreshold || 0.60; // 60% - Very conservative for Railway
    this.criticalThreshold = options.criticalThreshold || 0.75; // 75% - More conservative for Railway
    this.emergencyThreshold = options.emergencyThreshold || 0.85; // 85% - Emergency measures for Railway
    this.gcEnabled = typeof global.gc === 'function';
    this.lastGC = 0;
    this.gcInterval = options.gcInterval || 30000; // 30 seconds - More frequent
    this.monitoringInterval = null;
    this.warningHandlers = [];
    this.emergencyHandlers = [];
    this.memoryLeakDetectionEnabled = options.memoryLeakDetectionEnabled !== false;
    this.memoryTrend = []; // Store recent memory readings for trend analysis
    this.maxTrendSize = 20; // Keep last 20 readings
    
    // Railway-specific settings
    this.isRailway = !!process.env.RAILWAY_SERVICE_NAME;
    this.memoryLimit = parseInt(process.env.MAX_MEMORY || 1024 * 1024 * 1024);
    
    // Default memory reservations (retain 10% for system operations)
    this.memoryReservation = options.memoryReservation || 0.10;
    
    // Load V8 heap profiler if available to help identify leaks
    try {
      this.v8Profiler = require('v8');
    } catch (error) {
      this.v8Profiler = null;
    }
    
    // Get initial memory status
    this.memoryStatus = this.getMemoryStatus();
    this.memoryTrend.push({
      timestamp: Date.now(),
      usedPercentage: this.memoryStatus.usedPercentage
    });
    
    logger.info('Enhanced MemoryManager initialized', {
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold,
      emergencyThreshold: this.emergencyThreshold,
      gcEnabled: this.gcEnabled,
      memoryLimit: `${Math.round(this.memoryLimit / (1024 * 1024))} MB`,
      isRailway: this.isRailway,
      initialMemory: {
        heapUsedMB: Math.round(this.memoryStatus.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(this.memoryStatus.heapTotal / (1024 * 1024)),
        usedPercentage: Math.round(this.memoryStatus.usedPercentage * 100)
      }
    });
  }
  
  /**
   * Get current memory status with enhanced metrics
   * @returns {Object} Memory status information
   */
  getMemoryStatus() {
    const memoryUsage = process.memoryUsage();
    
    // Calculate percentages
    const heapUsedPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
    const rssPercentage = memoryUsage.rss / this.memoryLimit;
    
    // Use the higher of heap and RSS percentages
    const usedPercentage = Math.max(heapUsedPercentage, rssPercentage);
    
    // Calculate available memory (accounting for reservation)
    const availablePercentage = Math.max(0, 1 - usedPercentage - this.memoryReservation);
    
    // If V8 profiler available, get additional heap stats
    let heapStats = {};
    if (this.v8Profiler) {
      try {
        const v8Stats = this.v8Profiler.getHeapStatistics();
        heapStats = {
          heapSizeLimit: v8Stats.heap_size_limit,
          totalHeapSize: v8Stats.total_heap_size,
          totalPhysicalSize: v8Stats.total_physical_size,
          usedHeapSize: v8Stats.used_heap_size,
          heapSizeLimitMB: Math.round(v8Stats.heap_size_limit / (1024 * 1024)),
          fragmentation: v8Stats.total_heap_size > 0 ? 
            (1 - v8Stats.used_heap_size / v8Stats.total_heap_size) : 0
        };
      } catch (error) {
        logger.warn('Failed to get V8 heap statistics', { error: error.message });
      }
    }
    
    const status = {
      timestamp: Date.now(),
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      heapUsedPercentage: heapUsedPercentage,
      rssPercentage: rssPercentage,
      usedPercentage: usedPercentage,
      availablePercentage: availablePercentage,
      availableMB: Math.round((this.memoryLimit * availablePercentage) / (1024 * 1024)),
      isWarning: usedPercentage >= this.warningThreshold,
      isCritical: usedPercentage >= this.criticalThreshold,
      isEmergency: usedPercentage >= this.emergencyThreshold,
      ...heapStats
    };
    
    // Update memory trend data
    this.updateMemoryTrend(status);
    
    // Check for potential memory leaks
    if (this.memoryLeakDetectionEnabled) {
      const leakProbability = this.detectMemoryLeak();
      status.leakProbability = leakProbability;
      
      if (leakProbability > 0.7) {
        logger.warn('Potential memory leak detected', {
          leakProbability,
          trend: this.memoryTrend.slice(-5).map(m => Math.round(m.usedPercentage * 100))
        });
      }
    }
    
    return status;
  }
  
  /**
   * Update the memory trend data
   * @param {Object} statusData Current memory status
   */
  updateMemoryTrend(statusData) {
    this.memoryTrend.push({
      timestamp: statusData.timestamp,
      usedPercentage: statusData.usedPercentage,
      heapUsed: statusData.heapUsed,
      rss: statusData.rss
    });
    
    // Limit the size of trend data
    if (this.memoryTrend.length > this.maxTrendSize) {
      this.memoryTrend.shift();
    }
  }
  
  /**
   * Detect potential memory leaks based on trend analysis
   * @returns {Number} Probability of a memory leak (0-1)
   */
  detectMemoryLeak() {
    if (this.memoryTrend.length < 5) {
      return 0; // Not enough data
    }
    
    // Get recent memory readings (last 5)
    const recentTrend = this.memoryTrend.slice(-5);
    
    // Check if memory usage has been consistently increasing
    let increasingCount = 0;
    for (let i = 1; i < recentTrend.length; i++) {
      if (recentTrend[i].usedPercentage > recentTrend[i-1].usedPercentage) {
        increasingCount++;
      }
    }
    
    // Calculate leak probability - if 4 out of 5 readings show increase,
    // there's a high probability of a leak
    const leakProbability = increasingCount / (recentTrend.length - 1);
    
    return leakProbability;
  }
  
  /**
   * Try to free memory with enhanced strategies
   * @param {Boolean} aggressive Whether to use aggressive memory freeing
   * @param {Boolean} emergency Whether this is an emergency situation
   * @returns {Object} Memory status after freeing attempt
   */
  tryFreeMemory(aggressive = false, emergency = false) {
    const startMemory = this.getMemoryStatus();
    
    logger.info(`Attempting to free memory (aggressive: ${aggressive}, emergency: ${emergency})`, {
      heapUsedMB: Math.round(startMemory.heapUsed / (1024 * 1024)),
      usedPercentage: Math.round(startMemory.usedPercentage * 100)
    });
    
    // Run garbage collection if available
    if (this.gcEnabled) {
      const now = Date.now();
      
      // Run GC more frequently in emergency mode
      if (emergency || now - this.lastGC > (aggressive ? 2000 : this.gcInterval)) {
        logger.info('Running forced garbage collection');
        try {
          // Run full garbage collection
          global.gc(true);
          this.lastGC = now;
        } catch (error) {
          logger.error('Error running garbage collection', { error: error.message });
        }
      }
    }
    
    // Additional memory freeing strategies
    
    // 1. Clear Node.js module cache (only in aggressive/emergency mode)
    if (aggressive || emergency) {
      logger.info('Clearing module cache for non-essential modules');
      let clearedCount = 0;
      
      Object.keys(require.cache).forEach(key => {
        // Don't clear critical modules
        if (!key.includes('node_modules') || 
            key.includes('mongodb') || 
            key.includes('express') ||
            key.includes('cloudinary') ||
            key.includes('pdf-lib')) {
          return;
        }
        
        // Clear module from cache
        delete require.cache[key];
        clearedCount++;
      });
      
      logger.debug(`Cleared ${clearedCount} modules from require cache`);
    }
    
    // 2. Emergency measures for extremely low memory
    if (emergency) {
      logger.warn('Executing emergency memory measures');
      
      // 2.1 Clear global caches if they exist
      if (global.memoryStorage && typeof global.memoryStorage === 'object') {
        // Only retain absolutely critical items
        const keysToKeep = ['activeOperations'];
        const originalKeys = Object.keys(global.memoryStorage);
        
        originalKeys.forEach(key => {
          if (!keysToKeep.includes(key)) {
            delete global.memoryStorage[key];
          }
        });
        
        logger.info(`Cleared ${originalKeys.length - keysToKeep.length} items from global memory storage`);
      }
      
      // 2.2 Reset large in-memory buffers
      this.resetLargeBuffers();
    }
    
    // Get updated memory status
    const endMemory = this.getMemoryStatus();
    
    const freedBytes = startMemory.heapUsed - endMemory.heapUsed;
    const freedMB = freedBytes / (1024 * 1024);
    
    logger.info(`Memory freed: ${Math.round(freedMB)} MB`, {
      beforeMB: Math.round(startMemory.heapUsed / (1024 * 1024)),
      afterMB: Math.round(endMemory.heapUsed / (1024 * 1024)),
      beforePercentage: Math.round(startMemory.usedPercentage * 100),
      afterPercentage: Math.round(endMemory.usedPercentage * 100)
    });
    
    // Handle memory warning
    if (endMemory.isWarning) {
      this.triggerWarningHandlers(endMemory);
    }
    
    // Handle emergency
    if (endMemory.isEmergency) {
      this.triggerEmergencyHandlers(endMemory);
    }
    
    return endMemory;
  }
  
  /**
   * Reset known large buffers in the application
   * This helps clear memory when in emergency situations
   */
  resetLargeBuffers() {
    try {
      // Clear global temp storage if it exists
      if (global.tempBuffers && Array.isArray(global.tempBuffers)) {
        const count = global.tempBuffers.length;
        global.tempBuffers = [];
        logger.info(`Cleared ${count} temporary buffers`);
      }
      
      // Attempt to drop Node.js buffer pool cache
      // (This is a bit of a hack but can help in emergency)
      if (Buffer.poolSize > 0) {
        const originalSize = Buffer.poolSize;
        // Temporarily set pool size to 0 then restore
        Buffer.poolSize = 0;
        setTimeout(() => {
          Buffer.poolSize = originalSize;
        }, 1000);
        logger.info('Reset Buffer poolSize temporarily');
      }
      
    } catch (error) {
      logger.error('Error clearing large buffers', { error: error.message });
    }
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
   * Register an emergency handler for critical memory situations
   * @param {Function} handler Function to call in emergency memory situations
   */
  registerEmergencyHandler(handler) {
    if (typeof handler === 'function') {
      this.emergencyHandlers.push(handler);
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
   * Trigger all registered emergency handlers
   * @param {Object} memoryStatus Current memory status
   */
  triggerEmergencyHandlers(memoryStatus) {
    this.emergencyHandlers.forEach(handler => {
      try {
        handler(memoryStatus);
      } catch (error) {
        logger.error('Error in memory emergency handler', {
          error: error.message
        });
      }
    });
  }
  
  /**
   * Start enhanced memory monitoring with detailed diagnostics
   * @param {Number} interval Monitoring interval in ms
   */
  startMonitoring(interval = 20000) { // More frequent monitoring (20s)
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Initial memory check
    const initialStatus = this.getMemoryStatus();
    
    // Set up monitoring interval
    this.monitoringInterval = setInterval(() => {
      try {
        const memoryStatus = this.getMemoryStatus();
        this.memoryStatus = memoryStatus;
        
        // Log memory status (more comprehensive)
        const memoryLogLevel = memoryStatus.isEmergency ? 'warn' : 
                              memoryStatus.isCritical ? 'warn' : 
                              memoryStatus.isWarning ? 'info' : 'debug';
        
        logger[memoryLogLevel]('Memory status', {
          heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024)),
          heapTotalMB: Math.round(memoryStatus.heapTotal / (1024 * 1024)),
          rssMB: Math.round(memoryStatus.rss / (1024 * 1024)),
          usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
          availableMB: memoryStatus.availableMB,
          arrayBuffersMB: Math.round((memoryStatus.arrayBuffers || 0) / (1024 * 1024)),
          trend: this.memoryTrend.slice(-3).map(m => Math.round(m.usedPercentage * 100))
        });
        
        // Handle emergency memory situations
        if (memoryStatus.isEmergency) {
          logger.warn('EMERGENCY memory usage detected', {
            usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
            heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024)),
            availableMB: memoryStatus.availableMB
          });
          
          // Execute emergency freeing and trigger handlers
          this.tryFreeMemory(true, true);
          this.triggerEmergencyHandlers(memoryStatus);
        }
        // Handle critical memory situations
        else if (memoryStatus.isCritical) {
          logger.warn('Critical memory usage detected', {
            usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
            heapUsedMB: Math.round(memoryStatus.heapUsed / (1024 * 1024)),
            availableMB: memoryStatus.availableMB
          });
          
          // Try aggressive memory freeing
          this.tryFreeMemory(true);
        } 
        // Handle warning level
        else if (memoryStatus.isWarning) {
          logger.info('High memory usage detected', {
            usedPercentage: Math.round(memoryStatus.usedPercentage * 100),
            availableMB: memoryStatus.availableMB
          });
          
          // Try normal memory freeing
          this.tryFreeMemory(false);
          this.triggerWarningHandlers(memoryStatus);
        }
        // Normal regular cleanup at longer intervals
        else if (this.gcEnabled && Date.now() - this.lastGC > this.gcInterval) {
          // Preventative collection to keep memory usage smooth
          if (global.gc) {
            global.gc();
            this.lastGC = Date.now();
          }
        }
      } catch (error) {
        logger.error('Error in memory monitoring', {
          error: error.message,
          stack: error.stack
        });
      }
    }, interval);
    
    // Add more frequent but lightweight monitoring for leak detection
    if (this.memoryLeakDetectionEnabled) {
      this.leakDetectionInterval = setInterval(() => {
        try {
          // Quick memory check, just for trend analysis
          const memoryUsage = process.memoryUsage();
          const heapUsedPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
          const rssPercentage = memoryUsage.rss / this.memoryLimit;
          const usedPercentage = Math.max(heapUsedPercentage, rssPercentage);
          
          // Update trend without full diagnostics
          this.memoryTrend.push({
            timestamp: Date.now(),
            usedPercentage: usedPercentage,
            heapUsed: memoryUsage.heapUsed,
            rss: memoryUsage.rss
          });
          
          if (this.memoryTrend.length > this.maxTrendSize) {
            this.memoryTrend.shift();
          }
          
          // Check for rapid memory growth
          const leakProbability = this.detectMemoryLeak();
          if (leakProbability > 0.8) {
            logger.warn('Possible memory leak detected', {
              leakProbability,
              trendPercentages: this.memoryTrend.slice(-5).map(m => Math.round(m.usedPercentage * 100))
            });
            
            // Try to free memory
            this.tryFreeMemory(true);
          }
        } catch (error) {
          // Don't log errors in lightweight monitoring to avoid recursive errors
        }
      }, 5000); // Every 5 seconds
    }
    
    logger.info(`Enhanced memory monitoring started (interval: ${interval}ms)`, {
      memoryLeakDetection: this.memoryLeakDetectionEnabled,
      gcEnabled: this.gcEnabled,
      initialMemoryPercentage: Math.round(initialStatus.usedPercentage * 100)
    });
  }
  
  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = null;
    }
    
    logger.info('Memory monitoring stopped');
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
    
    // Register emergency memory handler
    this.memoryManager.registerEmergencyHandler((memoryStatus) => {
      this.handleMemoryEmergency(memoryStatus);
    });
    
    // Set up queue persistence
    if (this.persistenceEnabled) {
      this.setupPersistence();
    }
    
    // Set up global buffer tracking for memory management
    global.tempBuffers = global.tempBuffers || [];
    
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
   * Execute a job processor with enhanced timeout protection and memory monitoring
   * @param {Object} job The job to process
   * @returns {Promise} Promise resolving with job result
   */
  executeProcessor(job) {
    return new Promise((resolve, reject) => {
      // Get memory baseline before processing
      const startMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();
      
      // Set timeout for job processing
      const timeoutMs = job.data.timeoutMs || 300000; // 5 minutes default
      const timeoutId = setTimeout(() => {
        reject(new Error(`Job processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Set up memory check interval for this job
      let memoryCheckInterval = null;
      let maxMemoryUsed = 0;
      let lastMemoryReading = startMemory;
      
      // Only set up intensive monitoring for larger jobs
      const isLargeJob = job.data.fileSize && job.data.fileSize > 5 * 1024 * 1024; // > 5MB
      
      if (isLargeJob) {
        // Monitor memory every 2.5 seconds for large jobs
        memoryCheckInterval = setInterval(() => {
          try {
            const currentMemory = process.memoryUsage().heapUsed;
            const memoryDelta = currentMemory - lastMemoryReading;
            const memoryDeltaMB = Math.round(memoryDelta / (1024 * 1024));
            maxMemoryUsed = Math.max(maxMemoryUsed, currentMemory);
            
            // Check for sudden large memory increases
            if (memoryDelta > 100 * 1024 * 1024) { // 100MB jump
              logger.warn(`Job ${job.id} caused large memory jump: +${memoryDeltaMB}MB`, {
                currentMemoryMB: Math.round(currentMemory / (1024 * 1024)),
                runtime: Math.round((Date.now() - startTime) / 1000) + 's'
              });
            }
            
            lastMemoryReading = currentMemory;
            
            // Check if we need to trigger garbage collection
            const memoryManager = this.memoryManager;
            const memoryStatus = memoryManager.getMemoryStatus();
            
            if (memoryStatus.isCritical && memoryManager.gcEnabled) {
              logger.info(`Job ${job.id} triggering GC due to high memory`, {
                usedPercentage: Math.round(memoryStatus.usedPercentage * 100)
              });
              global.gc();
            }
          } catch (monitorError) {
            // Suppress errors in memory monitoring
          }
        }, 2500);
      }
      
      // Using non-async try/catch to avoid potential recursion issues
      try {
        // Execute the processor as a promise to avoid potential stack issues
        Promise.resolve().then(() => job.processor(job.data))
          .then(result => {
            // Clean up monitoring
            if (memoryCheckInterval) {
              clearInterval(memoryCheckInterval);
            }
            
            // Calculate memory impact
            const endMemory = process.memoryUsage().heapUsed;
            const memoryImpactMB = Math.round((maxMemoryUsed - startMemory) / (1024 * 1024));
            const endImpactMB = Math.round((endMemory - startMemory) / (1024 * 1024));
            const processingTime = Date.now() - startTime;
            
            // Store memory metrics for future prioritization
            if (!job.data.estimatedMemoryMB && memoryImpactMB > 0) {
              job.data.estimatedMemoryMB = memoryImpactMB;
            }
            
            // Log memory usage for large jobs
            if (isLargeJob || memoryImpactMB > 50) {
              logger.info(`Job ${job.id} memory impact: peak ${memoryImpactMB}MB, end ${endImpactMB}MB`, {
                processingTime: processingTime + 'ms',
                peakMemoryMB: memoryImpactMB,
                endMemoryMB: endImpactMB
              });
            }
            
            // Clear timeout and resolve
            clearTimeout(timeoutId);
            resolve(result);
            
            // Suggest garbage collection for large jobs
            if (memoryImpactMB > 100 && this.memoryManager.gcEnabled) {
              setImmediate(() => {
                global.gc();
              });
            }
          })
          .catch(error => {
            // Clean up monitoring
            if (memoryCheckInterval) {
              clearInterval(memoryCheckInterval);
            }
            
            // Clear timeout and reject
            clearTimeout(timeoutId);
            reject(error);
          });
      } catch (immediateError) {
        // Handle synchronous errors (rare, but possible)
        logger.error(`Immediate error in job ${job.id}:`, {
          error: immediateError.message
        });
        
        // Clean up monitoring
        if (memoryCheckInterval) {
          clearInterval(memoryCheckInterval);
        }
        
        // Clear timeout and reject
        clearTimeout(timeoutId);
        reject(immediateError);
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
    if (memoryStatus.usedPercentage > 0.75) { // Use critical threshold instead of hardcoded value
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
    const usedPercentage = Math.round(memoryStatus.usedPercentage * 100);
    logger.warn('Memory warning in processing queue', {
      memoryUsedPercentage: usedPercentage,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      queueLength: this.queue.size
    });
    
    // Calculate optimal concurrency based on memory usage
    const originalConcurrency = this.maxConcurrency;
    let newConcurrency;
    
    if (memoryStatus.isEmergency) {
      // Emergency mode - reduce to absolute minimum
      newConcurrency = 1;
      
      // If we have active jobs and queue pending, pause completely
      if (this.activeJobs.size > 0 && this.queue.size > 0) {
        logger.warn('Pausing queue due to EMERGENCY memory pressure', {
          activeJobs: this.activeJobs.size,
          queuedJobs: this.queue.size,
          usedPercentage
        });
        this.pause();
        
        // Attempt to resume after memory recovery
        const resumeCheck = setInterval(() => {
          const currentMemory = this.memoryManager.getMemoryStatus();
          if (currentMemory.usedPercentage < this.memoryThreshold) {
            this.resume();
            logger.info('Resuming queue after memory recovery', {
              currentPercentage: Math.round(currentMemory.usedPercentage * 100),
              threshold: Math.round(this.memoryThreshold * 100)
            });
            clearInterval(resumeCheck);
          } else {
            logger.debug('Memory still high, keeping queue paused', {
              currentPercentage: Math.round(currentMemory.usedPercentage * 100),
              threshold: Math.round(this.memoryThreshold * 100)
            });
          }
        }, 5000); // Check every 5 seconds
      }
    } else if (memoryStatus.isCritical) {
      // Critical mode - reduce significantly
      newConcurrency = Math.max(1, Math.floor(this.maxConcurrency * 0.5));
      
      // Apply back pressure by temporarily pausing
      if (this.activeJobs.size >= 2) {
        logger.info('Temporarily pausing queue for memory relief', {
          activeJobs: this.activeJobs.size,
          usedPercentage
        });
        this.pause();
        
        // Resume after a short delay
        setTimeout(() => {
          const currentMemory = this.memoryManager.getMemoryStatus();
          if (currentMemory.usedPercentage < this.criticalThreshold) {
            this.resume();
            logger.info('Resuming queue after short pause', {
              currentPercentage: Math.round(currentMemory.usedPercentage * 100)
            });
          } else {
            // Still critical, extend pause
            logger.warn('Extending queue pause due to continued high memory', {
              currentPercentage: Math.round(currentMemory.usedPercentage * 100)
            });
            
            // Try again in 30 seconds
            setTimeout(() => {
              this.resume();
              logger.info('Resuming queue after extended pause');
            }, 30000);
          }
        }, 5000); // Short 5 second pause first
      }
    } else {
      // Warning mode - reduce moderately
      newConcurrency = Math.max(1, Math.ceil(this.maxConcurrency * 0.7));
    }
    
    // Update concurrency if changed
    if (newConcurrency !== originalConcurrency) {
      logger.info(`Adjusting queue concurrency from ${originalConcurrency} to ${newConcurrency} due to memory pressure`, {
        memoryUsedPercentage: usedPercentage,
        queueSize: this.queue.size
      });
      this.maxConcurrency = newConcurrency;
      
      // Emit event
      this.emit('concurrencyChanged', newConcurrency, 'memory');
    }
    
    // Try to free memory with urgency level based on status
    this.memoryManager.tryFreeMemory(
      memoryStatus.isCritical, 
      memoryStatus.isEmergency
    );
    
    // Prioritize memory-efficient jobs
    this.reprioritizeJobs(memoryStatus);
  }
  
  /**
   * Reprioritize jobs based on memory constraints
   * @param {Object} memoryStatus Current memory status
   */
  reprioritizeJobs(memoryStatus) {
    // Skip if queue is empty or not critical
    if (this.queue.size === 0 || !memoryStatus.isWarning) {
      return;
    }
    
    logger.info('Reprioritizing jobs based on memory constraints', {
      queueSize: this.queue.size,
      memoryPercentage: Math.round(memoryStatus.usedPercentage * 100)
    });
    
    // Boost priority of smaller/lighter jobs
    this.queue.forEach((job, jobId) => {
      if (job.data && job.data.estimatedMemoryMB) {
        // For jobs with memory estimates, prioritize lighter ones
        const originalPriority = job.priority;
        
        if (job.data.estimatedMemoryMB < 50) {
          // Small jobs get priority boost
          job.priority = Math.min(10, job.priority + 2);
        } else if (job.data.estimatedMemoryMB > 200 && memoryStatus.isCritical) {
          // Heavy jobs get deprioritized
          job.priority = Math.max(1, job.priority - 2);
        }
        
        if (job.priority !== originalPriority) {
          logger.debug(`Adjusted job ${jobId} priority: ${originalPriority} -> ${job.priority}`, {
            estimatedMemoryMB: job.data.estimatedMemoryMB
          });
        }
      } else if (job.data && job.data.fileSize) {
        // For jobs with file size info but no memory estimates
        // Use file size as a rough proxy for memory usage
        const fileSizeMB = job.data.fileSize / (1024 * 1024);
        const originalPriority = job.priority;
        
        if (fileSizeMB < 5) {
          // Small files get priority boost
          job.priority = Math.min(10, job.priority + 1);
        } else if (fileSizeMB > 50 && memoryStatus.isCritical) {
          // Large files get deprioritized
          job.priority = Math.max(1, job.priority - 1);
        }
        
        if (job.priority !== originalPriority) {
          logger.debug(`Adjusted job ${jobId} priority based on file size: ${originalPriority} -> ${job.priority}`, {
            fileSizeMB
          });
        }
      }
    });
  }
  
  /**
   * Handle emergency memory situation
   * @param {Object} memoryStatus Current memory status
   */
  handleMemoryEmergency(memoryStatus) {
    const usedPercentage = Math.round(memoryStatus.usedPercentage * 100);
    logger.error('MEMORY EMERGENCY in processing queue', {
      memoryUsedPercentage: usedPercentage,
      activeJobs: this.activeJobs.size,
      queuedJobs: this.queue.size,
      availableMB: memoryStatus.availableMB || 'unknown'
    });
    
    // Immediate pause
    this.pause();
    
    // Force to absolute minimum concurrency
    this.maxConcurrency = 1;
    
    // If we have more than one active job, try to abort non-critical jobs
    if (this.activeJobs.size > 1) {
      logger.warn('Too many active jobs during memory emergency, aborting non-critical jobs');
      
      // Find jobs that can be safely aborted (not critical and relatively new)
      const jobsToAbort = [];
      this.activeJobs.forEach((job, jobId) => {
        const jobRuntime = Date.now() - job.startedAt;
        const isCritical = job.data && job.data.critical === true;
        
        // If job is not critical and has been running less than 30 seconds
        if (!isCritical && jobRuntime < 30000) {
          jobsToAbort.push(jobId);
        }
      });
      
      // Abort selected jobs
      jobsToAbort.forEach(jobId => {
        logger.warn(`Aborting job ${jobId} due to memory emergency`);
        
        const job = this.activeJobs.get(jobId);
        job.status = 'aborted';
        job.error = 'Aborted due to memory emergency';
        
        // Move to failed
        this.activeJobs.delete(jobId);
        this.failedJobs.set(jobId, job);
        this.currentConcurrency--;
        
        // Emit event
        this.emit('jobAborted', job, 'memory-emergency');
      });
      
      logger.info(`Aborted ${jobsToAbort.length} jobs to free memory`);
    }
    
    // Try to aggressively free memory
    this.memoryManager.tryFreeMemory(true, true);
    
    // Set up a recovery check
    setTimeout(() => {
      const currentMemory = this.memoryManager.getMemoryStatus();
      
      if (currentMemory.usedPercentage < this.memoryThreshold) {
        // Memory has recovered
        this.resume();
        logger.info('Memory recovered, resuming queue', {
          currentPercentage: Math.round(currentMemory.usedPercentage * 100),
          threshold: Math.round(this.memoryThreshold * 100)
        });
      } else {
        // Memory still constrained, extend pause but with limited processing
        logger.warn('Memory still constrained after emergency pause', {
          currentPercentage: Math.round(currentMemory.usedPercentage * 100),
          threshold: Math.round(this.memoryThreshold * 100)
        });
        
        // Allow processing only one job at a time
        setTimeout(() => {
          this.resume();
          logger.info('Cautiously resuming with minimal concurrency');
        }, 30000); // 30 second additional pause
      }
    }, 10000); // Initial 10 second recovery check
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

// Create a singleton instance with optimized memory settings
const processingQueue = new ProcessingQueue({
  name: 'pdfspark-main',
  maxConcurrency: process.env.MAX_CONCURRENCY ? parseInt(process.env.MAX_CONCURRENCY) : 2, // Conservative default
  railwayMode: !!process.env.RAILWAY_SERVICE_NAME,
  memoryThreshold: process.env.MEMORY_THRESHOLD ? parseFloat(process.env.MEMORY_THRESHOLD) : 0.60, // More conservative for Railway
  memoryOptions: {
    warningThreshold: process.env.MEMORY_WARNING_THRESHOLD ? parseFloat(process.env.MEMORY_WARNING_THRESHOLD) : 0.60,
    criticalThreshold: process.env.MEMORY_CRITICAL_THRESHOLD ? parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD) : 0.75,
    emergencyThreshold: process.env.MEMORY_EMERGENCY_THRESHOLD ? parseFloat(process.env.MEMORY_EMERGENCY_THRESHOLD) : 0.85,
    memoryLeakDetectionEnabled: process.env.MEMORY_LEAK_DETECTION !== 'false',
    gcInterval: process.env.GC_INTERVAL ? parseInt(process.env.GC_INTERVAL) : 30000,
    memoryReservation: process.env.MEMORY_RESERVATION ? parseFloat(process.env.MEMORY_RESERVATION) : 0.1,
    maxTrendSize: 20
  },
  persistenceEnabled: process.env.QUEUE_PERSISTENCE !== 'false',
  maxHistoryJobs: process.env.MAX_HISTORY_JOBS ? parseInt(process.env.MAX_HISTORY_JOBS) : 50 // Smaller history
});

// Make memory manager available to other components
const memoryManager = processingQueue.memoryManager;

// Expose memory measurement functions globally for debugging
global.getMemoryStatus = () => memoryManager.getMemoryStatus();
global.freeMemory = (aggressive = false) => memoryManager.tryFreeMemory(aggressive);

// Start queue processing automatically with enhanced monitoring
processingQueue.start();

// Log initial memory status
logger.info('Memory management system initialized', {
  initialMemory: {
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    heapTotalMB: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)),
    rssMB: Math.round(process.memoryUsage().rss / (1024 * 1024))
  },
  gcEnabled: typeof global.gc === 'function',
  maxConcurrency: processingQueue.maxConcurrency,
  memoryThresholds: {
    warning: Math.round(processingQueue.memoryManager.warningThreshold * 100),
    critical: Math.round(processingQueue.memoryManager.criticalThreshold * 100),
    emergency: Math.round(processingQueue.memoryManager.emergencyThreshold * 100)
  }
});

module.exports = {
  ProcessingQueue,
  MemoryManager,
  processingQueue,
  memoryManager
};