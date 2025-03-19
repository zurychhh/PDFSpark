# Queue-Based Processing Implementation Plan for PDFSpark

This plan outlines the implementation of an enhanced Queue-Based Processing system for memory-intensive operations in PDFSpark, specifically addressing the challenges of Railway deployment.

## 1. Overview and Goals

### 1.1. Current State

We've already implemented:
- A basic queue system for conversions in `conversionController.js`
- A Cloudinary-First approach for file storage
- Memory fallback mode for Railway's ephemeral filesystem

### 1.2. Goals

Our enhanced Queue-Based Processing system will:
- Control concurrency to prevent memory exhaustion
- Monitor system resources and adjust processing accordingly
- Support graceful degradation under heavy load
- Handle different types of operations with priority levels
- Persist queue state across application restarts

## 2. Technical Design

### 2.1. Enhanced Queue System

We will implement a `ProcessingQueue` class that:

1. **Controls Concurrency**:
   - Limits parallel operations based on memory availability
   - Dynamically adjusts concurrency limits based on system load
   - Handles different job types with specific resource limits

2. **Operation Prioritization**:
   - Premium/paid operations get higher priority
   - Small file operations can be processed more quickly
   - Critical system operations take precedence over user operations

3. **Persistence**:
   - Queue state persists in memory with MongoDB backup
   - Operations can resume after application restart
   - Railway-specific persistence strategy using memory fallback

4. **Resource Monitoring**:
   - Memory usage monitoring and throttling
   - CPU usage monitoring and concurrency adjustment
   - Cloudinary API rate limit awareness

### 2.2. Core Components

#### 2.2.1. ProcessingQueue Class:

```javascript
class ProcessingQueue {
  constructor(options = {}) {
    this.queue = new Map();
    this.activeJobs = new Map();
    this.maxConcurrency = options.maxConcurrency || 3;
    this.currentConcurrency = 0;
    this.processingInterval = null;
    this.memoryThreshold = options.memoryThreshold || 0.7; // 70% memory usage
    this.running = false;
  }
  
  // Add a job to the queue
  addJob(jobId, data, priority = 5, processor) { ... }
  
  // Process the queue
  processQueue() { ... }
  
  // Process a single job
  async processJob(job) { ... }
  
  // Memory monitoring
  checkMemoryAvailability() { ... }
  
  // Dynamic concurrency adjustment
  adjustConcurrency() { ... }
  
  // Persistence methods
  persistQueueState() { ... }
  restoreQueueState() { ... }
  
  // Control methods
  start() { ... }
  stop() { ... }
  pause() { ... }
  resume() { ... }
}
```

#### 2.2.2. JobProcessor Interface:

```javascript
class JobProcessor {
  constructor(options = {}) {
    this.queue = options.queue;
    this.jobType = options.jobType;
    this.logger = options.logger || console;
  }
  
  // Process specific job types
  async process(job) { ... }
  
  // Resource estimation
  estimateResources(job) { ... }
  
  // Error handling
  handleError(job, error) { ... }
}
```

#### 2.2.3. Memory Manager:

```javascript
class MemoryManager {
  constructor(options = {}) {
    this.warningThreshold = options.warningThreshold || 0.7; // 70%
    this.criticalThreshold = options.criticalThreshold || 0.85; // 85%
    this.gcEnabled = typeof global.gc === 'function';
    this.lastGC = 0;
    this.gcInterval = options.gcInterval || 60000; // 1 minute
  }
  
  // Get current memory status
  getMemoryStatus() { ... }
  
  // Try to free memory
  tryFreeMemory(aggressive = false) { ... }
  
  // Register memory warning handlers
  registerWarningHandler(handler) { ... }
  
  // Start monitoring
  startMonitoring(interval = 30000) { ... }
}
```

## 3. Implementation Steps

### 3.1. Phase 1: Core Queue Implementation

1. Create `ProcessingQueue` class in `backend/utils/processingQueue.js`
2. Implement basic job management (add, process, complete)
3. Add memory monitoring and concurrency control
4. Add persistence layer with MongoDB integration
5. Create unit tests for the queue system

### 3.2. Phase 2: Specialized Job Processors

1. Create `ConversionJobProcessor` class for PDF conversions
2. Create `UploadJobProcessor` class for file uploads
3. Create `CloudinaryJobProcessor` for Cloudinary operations
4. Integrate processors with the main queue

### 3.3. Phase 3: Controller Integration

1. Update `conversionController.js` to use the new queue system
2. Modify `fileController.js` to queue large file uploads
3. Add queue status endpoint to the API
4. Implement admin controls for queue management

### 3.4. Phase 4: Railway Optimizations

1. Add Railway-specific queue configuration
2. Implement memory-aware processing for Railway constraints
3. Add detailed logging for Railway deployments
4. Create Railway deployment verification tests

## 4. Memory Management Strategy

### 4.1. Dynamic Concurrency

```javascript
adjustConcurrency() {
  const memStatus = this.memoryManager.getMemoryStatus();
  
  // Reduce concurrency if memory usage is high
  if (memStatus.usedPercentage > 80) {
    this.maxConcurrency = Math.max(1, this.maxConcurrency - 1);
    this.logger.warn(`Memory pressure detected (${memStatus.usedPercentage}%), reducing concurrency to ${this.maxConcurrency}`);
    
    // Try to free memory if critically high
    if (memStatus.usedPercentage > 90) {
      this.memoryManager.tryFreeMemory(true);
    }
  } 
  // Increase concurrency if memory usage is low and we have queued jobs
  else if (memStatus.usedPercentage < 50 && this.queue.size > this.maxConcurrency) {
    this.maxConcurrency = Math.min(5, this.maxConcurrency + 1);
    this.logger.info(`Memory available (${memStatus.usedPercentage}%), increasing concurrency to ${this.maxConcurrency}`);
  }
}
```

### 4.2. Job Resource Estimation

```javascript
estimateJobMemory(job) {
  const { fileSize, targetFormat, options } = job.data;
  
  // Base memory estimate - 2MB + file size
  let estimatedMB = 2 + (fileSize / (1024 * 1024));
  
  // Add format-specific estimates
  if (targetFormat === 'docx') {
    estimatedMB *= 1.5; // DOCX conversion uses more memory
  } else if (targetFormat === 'xlsx') {
    estimatedMB *= 2; // XLSX conversion is memory intensive
  }
  
  // Consider options
  if (options.highQuality) {
    estimatedMB *= 1.2;
  }
  
  return estimatedMB;
}
```

### 4.3. Chunked Processing

For large files, implement chunked processing:

```javascript
async processLargeFile(file, options) {
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  const results = [];
  
  // Process each chunk
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    
    // Extract chunk
    const chunk = file.slice(start, end);
    
    // Process chunk
    const chunkResult = await this.processChunk(chunk, options);
    results.push(chunkResult);
    
    // Force garbage collection if available
    if (global.gc && i % 2 === 0) {
      global.gc();
    }
  }
  
  // Combine results
  return this.combineResults(results);
}
```

## 5. API and Integration

### 5.1. Queue Status Endpoint

```javascript
// New endpoint: GET /api/queue/status
exports.getQueueStatus = async (req, res) => {
  try {
    const queueStats = processingQueue.getStats();
    
    // Add permission checks for admin/user specific data
    const isAdmin = req.user && req.user.role === 'admin';
    
    res.json({
      success: true,
      stats: {
        queuedJobs: queueStats.queuedCount,
        activeJobs: queueStats.activeCount,
        completedJobs: queueStats.completedCount,
        maxConcurrency: queueStats.maxConcurrency,
        memory: isAdmin ? queueStats.memoryStatus : undefined,
        estimatedWaitTime: queueStats.estimatedWaitTimeMs,
      },
      // Detailed job info only for admins or user's own jobs
      jobs: isAdmin ? queueStats.jobs : undefined
    });
  } catch (error) {
    console.error('Error fetching queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue status'
    });
  }
};
```

### 5.2. User-Facing Progress Updates

```javascript
// Enhanced conversion status endpoint
exports.getOperationStatus = async (req, res) => {
  try {
    const operation = await Operation.findById(req.params.id);
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }
    
    // Get queue position and estimated time
    let queueInfo = {};
    if (operation.status === 'queued') {
      queueInfo = processingQueue.getJobInfo(operation._id);
    }
    
    res.json({
      success: true,
      status: operation.status,
      progress: operation.progress,
      queuePosition: queueInfo.position,
      estimatedTimeMs: queueInfo.estimatedTimeMs,
      message: getStatusMessage(operation, queueInfo)
    });
  } catch (error) {
    // Error handling...
  }
};
```

## 6. Testing Strategy

### 6.1. Unit Tests

1. Queue system basic functionality
2. Memory monitoring and adjustment
3. Job priority and ordering
4. Error handling and recovery

### 6.2. Integration Tests

1. End-to-end conversion with queuing
2. System behavior under load
3. Railway-specific behavior testing
4. Persistence across simulated restarts

### 6.3. Performance Tests

1. Memory usage patterns
2. Concurrency adjustment effectiveness
3. High load scenarios
4. Recovery from memory pressure

## 7. Deployment and Monitoring

### 7.1. Configuration Options

```javascript
// Configuration in railway-entry.js
const queueOptions = {
  maxConcurrency: process.env.MAX_CONCURRENCY || 2,
  railwayMode: !!process.env.RAILWAY_SERVICE_NAME,
  memoryThreshold: process.env.MEMORY_THRESHOLD || 0.7,
  persistenceEnabled: process.env.QUEUE_PERSISTENCE !== 'false',
  monitoringInterval: process.env.MONITORING_INTERVAL || 30000
};

const processingQueue = new ProcessingQueue(queueOptions);
```

### 7.2. Monitoring Integration

- Log queue statistics periodically
- Add memory usage alerts
- Report job processing times and failures
- Create queue status dashboard for admins

## 8. Migration Strategy

1. Implement core queue system without modifying existing controllers
2. Run both queue systems in parallel temporarily
3. Gradually transition controllers to the new queue system
4. Monitor and compare performance
5. Phase out old queue system after stability verification

## 9. Timeline and Milestones

1. **Week 1**: Core queue implementation and basic tests
2. **Week 2**: Job processors and controller integration
3. **Week 3**: Railway optimizations and end-to-end testing
4. **Week 4**: Migration, monitoring, and production deployment

## 10. Conclusion

This Queue-Based Processing system will significantly improve PDFSpark's reliability on Railway by:

1. **Preventing memory exhaustion** through adaptive concurrency
2. **Improving user experience** with better status updates and priority handling
3. **Enhancing reliability** with persistence and error recovery
4. **Optimizing resource usage** through intelligent job management

These improvements address the core challenges identified in the Railway deployment while creating a foundation for future scalability.