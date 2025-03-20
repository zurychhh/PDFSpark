# PDFSpark Memory Diagnostics

This document describes the enhanced memory diagnostic endpoints available in the PDFSpark application to help troubleshoot memory-related issues, particularly in resource-constrained environments like Railway.

## Accessing Diagnostic Endpoints

All advanced diagnostic endpoints are protected with an Admin API key for security. To access them, you need to include the Admin API key in one of two ways:

1. Using a header: `X-API-Key: your_admin_api_key`
2. Using a query parameter: `?key=your_admin_api_key`

The Admin API key should be set in the environment variables as `ADMIN_API_KEY`.

## Available Endpoints

### 1. Basic Memory Check

**Endpoint**: `GET /api/diagnostic/memory`

This endpoint provides basic memory usage information. It's not protected and provides non-sensitive information.

**Example Response**:
```json
{
  "status": "ok",
  "memory": {
    "free": 524288000,
    "total": 2147483648,
    "usedPercent": 75.6,
    "rss": 1024000000,
    "heapTotal": 900000000,
    "heapUsed": 800000000
  },
  "memoryManager": {
    "status": "active",
    "currentUsagePercent": 75.6,
    "thresholds": {
      "warning": 65,
      "critical": 80,
      "emergency": 90
    }
  }
}
```

### 2. Advanced Memory Diagnostics

**Endpoint**: `GET /api/diagnostic/memory/advanced`  
**Protected**: Yes (Admin API key required)

This endpoint provides comprehensive memory metrics, trend analysis, memory leak detection, and optional memory recovery testing.

**Query Parameters**:
- `testRecovery=true` - Runs a garbage collection test to assess memory recovery potential
- `details=true` - Includes more detailed metrics about the V8 heap
- `estimateSize=true` - Estimates the memory usage of major application components

**Example Response**:
```json
{
  "status": "ok",
  "timestamp": "2023-06-15T10:30:00.000Z",
  "memory": {
    "system": {
      "free": 524288000,
      "total": 2147483648,
      "usedPercent": 75.6
    },
    "process": {
      "rss": 1024000000,
      "heapTotal": 900000000,
      "heapUsed": 800000000,
      "external": 60000000,
      "arrayBuffers": 10000000
    },
    "v8Heap": {
      "totalHeapSize": 900000000,
      "totalHeapSizeExecutable": 5000000,
      "totalPhysicalSize": 850000000,
      "totalAvailableSize": 1073741824,
      "usedHeapSize": 800000000,
      "heapSizeLimit": 1073741824,
      "mallocedMemory": 8000000,
      "peakMallocedMemory": 10000000,
      "numberOfNativeContexts": 1,
      "numberOfDetachedContexts": 0
    },
    "memoryManager": {
      "status": "active",
      "currentUsagePercent": 75.6,
      "thresholds": {
        "warning": 65,
        "critical": 80,
        "emergency": 90
      },
      "trend": "stable",
      "memoryLeakDetected": false,
      "lastGcEffectiveness": 15.2
    },
    "componentSizes": {
      "global": 50000000,
      "memoryStorage": 20000000,
      "applicationCache": 30000000,
      "sessions": 10000000
    },
    "recoveryTest": {
      "beforeGc": {
        "heapUsed": 800000000,
        "rss": 1024000000
      },
      "afterGc": {
        "heapUsed": 700000000,
        "rss": 950000000
      },
      "reclaimedPercent": 12.5,
      "effectiveness": "moderate"
    }
  },
  "recommendations": [
    "Consider increasing available memory to at least 2GB",
    "Memory trend appears stable, no immediate action required",
    "Global object size is large, consider reducing cached data"
  ]
}
```

### 3. Memory History Tracking

**Endpoint**: `GET /api/diagnostic/memory/history`  
**Protected**: Yes (Admin API key required)

This endpoint provides access to historical memory usage data, helping identify patterns and detect anomalies over time.

**Query Parameters**:
- `command=start` - Starts memory history tracking
- `command=stop` - Stops memory history tracking
- `command=clear` - Clears the memory history data
- `interval=60000` - Sets the sampling interval in milliseconds (when starting)
- `limit=100` - Limits the number of data points returned
- `detectAnomalies=true` - Analyzes the history for anomalies

**Example Response**:
```json
{
  "status": "ok",
  "tracking": {
    "active": true,
    "startedAt": "2023-06-15T10:00:00.000Z",
    "dataPoints": 45,
    "sampleInterval": 60000
  },
  "memoryHistory": [
    {
      "timestamp": "2023-06-15T10:00:00.000Z",
      "heapUsed": 750000000,
      "rss": 1000000000,
      "usedPercent": 72.5
    },
    {
      "timestamp": "2023-06-15T10:01:00.000Z",
      "heapUsed": 760000000,
      "rss": 1010000000,
      "usedPercent": 73.2
    }
    // Additional data points...
  ],
  "analysis": {
    "trend": "increasing",
    "avgIncreasePerHour": 20000000,
    "peakUsage": {
      "timestamp": "2023-06-15T10:30:00.000Z",
      "heapUsed": 850000000,
      "usedPercent": 80.1
    },
    "anomalies": [
      {
        "timestamp": "2023-06-15T10:15:00.000Z",
        "description": "Sudden increase of 15% in heap usage",
        "value": 798000000,
        "previousValue": 695000000
      }
    ]
  }
}
```

## Usage Examples

### Starting Memory History Tracking

```bash
curl -H "X-API-Key: your_admin_api_key" "https://your-pdfspark-app.com/api/diagnostic/memory/history?command=start&interval=60000"
```

### Getting Advanced Memory Diagnostics with Recovery Test

```bash
curl -H "X-API-Key: your_admin_api_key" "https://your-pdfspark-app.com/api/diagnostic/memory/advanced?testRecovery=true&details=true"
```

### Viewing Memory History with Anomaly Detection

```bash
curl -H "X-API-Key: your_admin_api_key" "https://your-pdfspark-app.com/api/diagnostic/memory/history?limit=50&detectAnomalies=true"
```

## Interpreting Results

### Memory Status Indicators

- **Healthy**: Memory usage is below warning thresholds, and no memory leaks are detected.
- **Warning**: Memory usage has exceeded the warning threshold (65% by default).
- **Critical**: Memory usage has exceeded the critical threshold (80% by default).
- **Emergency**: Memory usage has exceeded the emergency threshold (90% by default).

### Trend Analysis

- **Stable**: Memory usage is relatively constant over time.
- **Increasing**: Memory usage is consistently increasing, which might indicate a memory leak.
- **Decreasing**: Memory usage is trending downward.
- **Fluctuating**: Memory usage shows significant variations over time.

### Recovery Effectiveness

- **High**: More than 20% of memory was reclaimed during the recovery test.
- **Moderate**: Between 10% and 20% of memory was reclaimed.
- **Low**: Less than 10% of memory was reclaimed, which might indicate inefficient memory usage or potential leaks.

## Troubleshooting Common Issues

1. **High Memory Usage with Low Recovery Effectiveness**
   - Possible memory leaks in the application
   - Check for unclosed resources (file handles, database connections)
   - Inspect objects with circular references

2. **Frequent Anomalies in Memory History**
   - Might indicate inefficient processing of large files
   - Review the chunked processing implementation
   - Consider increasing chunk size for better efficiency

3. **Steadily Increasing Memory Trend**
   - Classic sign of a memory leak
   - Check for cached data that isn't being cleaned up
   - Verify that temporary files are being properly deleted

4. **Resource Limitations on Railway**
   - Consider upgrading to a plan with more memory
   - Implement more aggressive garbage collection strategies
   - Reduce the number of concurrent operations