# PDFSpark Railway Deployment Guide

This guide provides step-by-step instructions to fix the Railway deployment issues and improve memory management for the PDFSpark backend application.

## Issue Overview

The PDFSpark application was experiencing deployment failures and memory management issues on Railway.app. The main problems were:

1. **Configuration Conflict**: Multiple `railway.json` files with different build strategies
2. **Docker Path Issues**: Incorrect paths in the Dockerfile
3. **Memory Management**: Inadequate memory thresholds for Railway's constrained environment
4. **Ephemeral Storage**: Not properly handling Railway's ephemeral filesystem

## Solution Implemented

A comprehensive fix has been implemented that addresses all these issues:

1. **Unified Railway Configuration**: Single `railway.json` file in the project root that points to the backend Dockerfile
2. **Optimized Dockerfile**: Enhanced Dockerfile with proper build context and paths
3. **Conservative Memory Thresholds**: Lower, more conservative memory thresholds for Railway's environment
4. **Proper Temporary Directory Setup**: Configuration for using `/tmp` for file operations
5. **Memory Fallback Mode**: Enabled memory fallback and aggressive memory management

## Deployment Configuration

The deployment configuration has been updated with:

- Root `railway.json` using `DOCKERFILE` builder pointing to backend/Dockerfile
- Environment variables for memory optimization
- Health check configuration
- Backend Dockerfile with memory optimizations and diagnostic tools
- A simplified railway-entry.js wrapper script
- Memory threshold adjustments in processingQueue.js

## Memory Management Improvements

Memory management has been improved with the following adjustments:

1. **Conservative Thresholds**:
   - Warning threshold reduced from 65% to 60%
   - Critical threshold reduced from 80% to 75%
   - Emergency threshold reduced from 90% to 85%

2. **Increased Garbage Collection**:
   - Added `--expose-gc` flag to enable manual garbage collection
   - Automatic GC triggers at lower memory thresholds

3. **Concurrency Control**:
   - More aggressive scaling down of concurrent operations under memory pressure
   - Limited maximum concurrency to 2 for Railway environment

4. **Environment Variables**:
   - Added more memory-related environment variables
   - Created fallback railway-entry.js with memory optimizations

## Verifying the Deployment

To verify the deployment is working properly:

1. Check the application health endpoint: `https://pdfspark-production-production.up.railway.app/health`
2. Monitor memory usage in the Railway dashboard
3. Make test conversions to verify functionality

## Ongoing Monitoring

For ongoing monitoring and troubleshooting:

1. Use the built-in diagnostic endpoint: `https://pdfspark-production-production.up.railway.app/api/diagnostic/memory`
2. Monitor Railway logs for memory warnings and critical alerts
3. Check container health status in Railway dashboard

## Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Service crashes shortly after start | Check memory usage at startup - may need to increase initial garbage collection |
| File uploads fail | Verify TMP directory configuration and permissions |
| High memory usage | Reduce MAX_CONCURRENCY setting or adjust thresholds further |
| Slow conversion performance | Monitor and balance memory thresholds with performance requirements |

## Future Optimizations

1. **Memory Monitoring Dashboard**: Consider implementing a dedicated memory monitoring dashboard
2. **Queue-Based Processing**: Consider moving to a queue-based processing system for better resource management
3. **Auto-scaling**: Implement auto-scaling triggers based on memory thresholds