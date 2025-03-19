# Memory-Optimized Railway Deployment Dockerfile for PDFSpark
# Configured for ephemeral Railway filesystem with memory fallback

FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash net-tools procps htop

# Critical environment variables for Railway
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV MEMORY_MANAGEMENT_AGGRESSIVE=true
ENV TEMP_DIR=/tmp
ENV UPLOAD_DIR=/tmp/uploads
ENV LOG_DIR=/tmp/logs
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Explicitly create app directory 
WORKDIR /app

# Create required directories with proper permissions
# Using /tmp instead of /app for Railway's ephemeral filesystem
RUN mkdir -p /tmp/uploads /tmp/temp /tmp/logs && \
    chmod 777 /tmp/uploads /tmp/temp /tmp/logs && \
    mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# First copy package.json files to optimize build caching
COPY backend/package*.json ./

# Install dependencies with production flag
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy the railway entry script (enhanced for memory management)
COPY railway-entry.js ./
RUN chmod +x ./railway-entry.js

# Copy backend source code
COPY backend/ ./

# Create memory monitoring script
RUN echo '#!/bin/sh' > /app/monitor-memory.sh && \
    echo 'echo "=== PDFSpark Memory Monitor ==="' >> /app/monitor-memory.sh && \
    echo 'echo "Timestamp: $(date)"' >> /app/monitor-memory.sh && \
    echo 'free -m' >> /app/monitor-memory.sh && \
    echo 'node -e "console.table(process.memoryUsage())"' >> /app/monitor-memory.sh && \
    chmod +x /app/monitor-memory.sh

# Health check that includes memory status
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || (echo "Health check failed"; /app/monitor-memory.sh; exit 1)

# Expose the application port
EXPOSE 3000

# Start the application with more memory
# Use --expose-gc to allow manual garbage collection
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "railway-entry.js"]